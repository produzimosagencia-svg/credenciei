'use server'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'node:crypto'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { ehMaster } from './permissions'
import { formatarNumeroWhatsApp, responderConversa, provedor } from './whatsapp'
import { enviarTemplate } from './whatsapp-meta'
import { registrarEnviada, registrarLeituraConversa, FLUXOS, numerosWhatsApp, templatesAprovados } from './whatsapp-painel'
import { podePassar } from './limite'

/**
 * Ações do painel de WhatsApp — todas exclusivas do MASTER.
 *
 * O canal é da plataforma, não de um evento: quem dispara em massa, responde
 * conversa e liga ou desliga fluxo é o dono, nunca o produtor de um cliente.
 * Por isso a checagem é `ehMaster` e não a régua de organização usada no resto
 * do sistema.
 */
async function exigirMaster() {
  const perfil = await getPerfil()
  if (!perfil || !ehMaster(perfil.role)) {
    throw new Error('Apenas o master acessa o painel de WhatsApp.')
  }
  return perfil
}

// ─── Disparo em massa ────────────────────────────────────────────────────────

export type AlvoDisparo = { eventoId: string; fornecedorId?: string; somenteAtivos: boolean }

export type PreviaDisparo = {
  total: number
  semTelefone: number
  amostra: { nome: string; telefone: string; setor: string }[]
  contatos: ContatoDisparo[]
}

export type ContatoDisparo = { nome: string; telefone: string }

export type PedidoDisparo = {
  alvo: AlvoDisparo
  origem: 'equipe' | 'csv' | 'socios'
  contatosImportados?: ContatoDisparo[]
  excluirTelefones?: string[]
  phoneNumberId: string
  template: string
  /** A posição 0 é ignorada: {{1}} recebe o nome de cada contato. */
  parametros: string[]
}

/**
 * Quem receberia, sem mandar nada.
 *
 * Existe porque disparo em massa é irreversível: mil mensagens saem em
 * minutos e não voltam. Ver a contagem e alguns nomes antes é o que separa
 * "mandei para o setor certo" de "mandei para o evento inteiro".
 */
export async function previaDisparo(alvo: AlvoDisparo): Promise<PreviaDisparo> {
  await exigirMaster()

  let q = supabaseAdmin
    .from('funcionarios')
    .select('id, nome, telefone, fornecedores!inner(nome, evento_id)')
    .eq('fornecedores.evento_id', alvo.eventoId)
    .is('descredenciado_em', null)
    .order('nome')
  if (alvo.fornecedorId) q = q.eq('fornecedor_id', alvo.fornecedorId)
  if (alvo.somenteAtivos) q = q.eq('ativo', true)

  const { data } = await q
  const todos = data ?? []
  const porTelefone = new Map<string, { nome: string; telefone: string; setor: string }>()
  for (const f of todos) {
    const telefone = formatarNumeroWhatsApp(f.telefone as string)
    if (!telefone) continue
    if (!porTelefone.has(telefone)) porTelefone.set(telefone, {
      nome: f.nome as string,
      telefone,
      setor: (f.fornecedores as unknown as { nome: string })?.nome ?? '—',
    })
  }
  const validos = [...porTelefone.values()]

  return {
    total: validos.length,
    semTelefone: todos.filter(f => !formatarNumeroWhatsApp(f.telefone as string)).length,
    amostra: validos.slice(0, 5),
    contatos: validos.map(c => ({ nome: c.nome, telefone: c.telefone })),
  }
}

/**
 * Dispara um template aprovado para todo mundo do alvo.
 *
 * Enfileira em vez de mandar direto: quem processa é o worker, que já respeita
 * espaçamento entre envios e as travas contra mensagem errada. Mandar aqui
 * num laço faria mil chamadas na mesma requisição — que estoura o tempo da
 * função e, pior, ignora todas as proteções que a fila tem.
 */
export async function dispararEmMassa(
  pedido: PedidoDisparo,
): Promise<{ enfileiradas: number; semTelefone: number; excluidas: number }> {
  const perfil = await exigirMaster()

  if (!pedido.template.trim()) throw new Error('Escolha um template.')
  if (!pedido.alvo.eventoId) throw new Error('Escolha um evento para identificar o disparo.')
  if (provedor() !== 'meta') {
    throw new Error('O disparo em massa exige a API oficial da Meta. Ajuste WHATSAPP_PROVEDOR.')
  }

  const [numeros, templates, evento] = await Promise.all([
    numerosWhatsApp(),
    templatesAprovados(),
    supabaseAdmin.from('eventos').select('id').eq('id', pedido.alvo.eventoId).maybeSingle(),
  ])
  if (!evento.data) throw new Error('O evento escolhido não existe mais.')
  if (!numeros.some(n => n.id === pedido.phoneNumberId && n.status === 'CONNECTED')) {
    throw new Error('Escolha um número conectado desta conta do WhatsApp.')
  }
  const modelo = templates.find(t => t.nome === pedido.template && t.status === 'APPROVED')
  if (!modelo) throw new Error('O template não está mais aprovado na Meta. Atualize a tela.')
  if (modelo.categoria === 'AUTHENTICATION') {
    throw new Error('Templates de autenticação não podem ser usados em disparo comum.')
  }
  const parametros = Array.from({ length: modelo.variaveis }, (_, i) => String(pedido.parametros[i] ?? '').trim())
  if (parametros.slice(1).some(v => !v)) {
    throw new Error('Preencha todas as variáveis fixas do template.')
  }

  type Destinatario = { nome: string; telefone: string }
  let brutos: { id?: string | null; nome?: string | null; telefone?: string | null }[] = []
  if (pedido.origem !== 'equipe') {
    if ((pedido.contatosImportados?.length ?? 0) > 5000) throw new Error('O limite por arquivo é de 5.000 contatos.')
    brutos = (pedido.contatosImportados ?? []).map(c => ({ nome: c.nome, telefone: c.telefone }))
  } else {
    let q = supabaseAdmin
      .from('funcionarios')
      .select('id, nome, telefone, fornecedores!inner(evento_id)')
      .eq('fornecedores.evento_id', pedido.alvo.eventoId)
      .is('descredenciado_em', null)
    if (pedido.alvo.fornecedorId) q = q.eq('fornecedor_id', pedido.alvo.fornecedorId)
    if (pedido.alvo.somenteAtivos) q = q.eq('ativo', true)
    const { data, error } = await q
    if (error) throw new Error(`Não consegui carregar o público: ${error.message}`)
    brutos = data ?? []
  }

  const semTelefone = brutos.filter(c => !formatarNumeroWhatsApp(c.telefone ?? '')).length
  const porTelefone = new Map<string, Destinatario>()
  for (const contato of brutos) {
    const telefone = formatarNumeroWhatsApp(contato.telefone ?? '')
    if (!telefone) continue
    const atual = porTelefone.get(telefone)
    const nome = String(contato.nome ?? '').trim() || 'Cliente'
    if (!atual || atual.nome === 'Cliente') porTelefone.set(telefone, { nome, telefone })
  }

  const exclusoes = new Set((pedido.excluirTelefones ?? []).map(formatarNumeroWhatsApp).filter((v): v is string => !!v))
  const excluidas = [...porTelefone.keys()].filter(t => exclusoes.has(t)).length
  const validos = [...porTelefone.values()].filter(c => !exclusoes.has(c.telefone))
  if (!validos.length) throw new Error('Nenhum contato válido restou para o disparo.')

  // Teto por master: um clique repetido sem querer não pode virar dois
  // disparos para a mesma lista.
  if (!podePassar(`disparo:${perfil.id}`, 5, 60 * 60 * 1000)) {
    throw new Error('Muitos disparos seguidos. Espere alguns minutos.')
  }

  /*
   * `data_ref` recebe a data de hoje e o tipo vai como disparo manual, para
   * este envio não colidir com os agendamentos automáticos do mesmo dia — que
   * usam a chave (evento, funcionário, tipo, dia).
   */
  const hoje = new Date().toISOString().slice(0, 10)
  const campanhaId = randomUUID()
  const linhas = validos.map(contato => ({
    evento_id: pedido.alvo.eventoId,
    // Manual usa null de propósito: o índice histórico da fila é único por
    // funcionário/dia e impediria um segundo disparo legítimo no mesmo dia.
    funcionario_id: null,
    tipo: 'disparo_manual',
    data_ref: hoje,
    agendado_para: new Date().toISOString(),
    telefone: contato.telefone,
    // O template e os parâmetros viajam aqui: diferente dos automáticos, este
    // conteúdo não é recalculável depois — foi escolhido à mão agora.
    mensagem: JSON.stringify({
      template: modelo.nome,
      parametros: modelo.variaveis ? [contato.nome, ...parametros.slice(1)] : [],
      phoneNumberId: pedido.phoneNumberId,
      campanhaId,
      origem: pedido.origem,
    }),
  }))

  for (let inicio = 0; inicio < linhas.length; inicio += 500) {
    const { error } = await supabaseAdmin.from('mensagens_agendadas').insert(linhas.slice(inicio, inicio + 500))
    if (error) throw new Error(`Não consegui enfileirar: ${error.message}`)
  }

  revalidatePath('/admin/whatsapp')
  return { enfileiradas: linhas.length, semTelefone, excluidas }
}

/** Marca a conversa como lida antes de navegar para o chat. */
export async function marcarConversaComoLida(telefone: string) {
  await exigirMaster()
  const numero = formatarNumeroWhatsApp(telefone)
  if (!numero) throw new Error('Telefone inválido.')
  await registrarLeituraConversa(numero)
  revalidatePath('/admin/whatsapp/conversas')
  revalidatePath(`/admin/whatsapp/conversas/${numero}`)
  return { ok: true as const }
}

// ─── Chat ────────────────────────────────────────────────────────────────────

/**
 * Responde uma conversa aberta, com texto livre.
 *
 * Só funciona dentro de 24h da última mensagem da pessoa — fora disso a Meta
 * recusa e só template passa. A tela já mostra a janela fechada, mas a
 * checagem tem que estar aqui também: a tela pode estar desatualizada.
 */
export async function responderNoChat(telefone: string, texto: string) {
  await exigirMaster()
  const corpo = texto.trim()
  if (!corpo) throw new Error('Escreva a mensagem.')
  if (corpo.length > 4000) throw new Error('Mensagem longa demais.')

  const numero = formatarNumeroWhatsApp(telefone)
  if (!numero) throw new Error('Telefone inválido.')

  const r = await responderConversa(numero, corpo)
  if (!r.ok) {
    const detalhe = (r.resposta as { error?: { message?: string } } | null)?.error?.message
    throw new Error(detalhe ?? 'A Meta recusou o envio. A janela de 24h pode ter fechado.')
  }

  await registrarEnviada({ telefone: numero, texto: corpo, waMessageId: r.messageId ?? null })
  revalidatePath(`/admin/whatsapp/conversas/${telefone}`)
  return { ok: true as const }
}

/** Manda um template para UM número — o caminho quando a janela de 24h fechou. */
export async function enviarTemplateAvulso(telefone: string, template: string, parametros: string[]) {
  await exigirMaster()
  const numero = formatarNumeroWhatsApp(telefone)
  if (!numero) throw new Error('Telefone inválido.')

  const r = await enviarTemplate(numero, template, parametros)
  if (!r.ok) {
    const detalhe = (r.resposta as { error?: { message?: string } } | null)?.error?.message
    throw new Error(detalhe ?? 'A Meta recusou o envio.')
  }
  await registrarEnviada({
    telefone: numero,
    texto: `[${template}] ${parametros.join(' · ')}`,
    waMessageId: r.messageId ?? null,
    bruto: { origem: 'template_avulso', template, parametros },
  })
  revalidatePath(`/admin/whatsapp/conversas/${telefone}`)
  return { ok: true as const }
}

// ─── Fluxos ──────────────────────────────────────────────────────────────────

/** Liga/desliga os disparos automáticos. Só o que está ligado é agendado. */
export async function salvarFluxos(ativos: Record<string, boolean>) {
  await exigirMaster()
  const limpo = Object.fromEntries(FLUXOS.map(f => [f.chave, ativos[f.chave] !== false]))

  const { error } = await supabaseAdmin.from('sistema_estado').upsert(
    { chave: 'fluxos', valor: limpo, atualizado_em: new Date().toISOString() },
    { onConflict: 'chave' },
  )
  if (error) throw new Error('Não foi possível salvar. Rode o SQL do painel primeiro.')

  revalidatePath('/admin/whatsapp/fluxos')
  return { ok: true as const }
}
