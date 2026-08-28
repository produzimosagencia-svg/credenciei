'use server'
import { revalidatePath } from 'next/cache'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { ehMaster } from './permissions'
import { formatarNumeroWhatsApp, responderConversa, provedor } from './whatsapp'
import { enviarTemplate } from './whatsapp-meta'
import { registrarEnviada, FLUXOS } from './whatsapp-painel'
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
  const validos = todos.filter(f => !!formatarNumeroWhatsApp(f.telefone as string))

  return {
    total: validos.length,
    semTelefone: todos.length - validos.length,
    amostra: validos.slice(0, 5).map(f => ({
      nome: f.nome as string,
      telefone: f.telefone as string,
      setor: (f.fornecedores as unknown as { nome: string })?.nome ?? '—',
    })),
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
  alvo: AlvoDisparo,
  template: string,
  parametros: string[],
): Promise<{ enfileiradas: number; semTelefone: number }> {
  const perfil = await exigirMaster()

  if (!template.trim()) throw new Error('Escolha um template.')
  // Teto por master: um clique repetido sem querer não pode virar dois
  // disparos para a mesma lista.
  if (!podePassar(`disparo:${perfil.id}`, 5, 60 * 60 * 1000)) {
    throw new Error('Muitos disparos seguidos. Espere alguns minutos.')
  }
  if (provedor() !== 'meta') {
    throw new Error('O disparo em massa exige a API oficial da Meta. Ajuste WHATSAPP_PROVEDOR.')
  }

  let q = supabaseAdmin
    .from('funcionarios')
    .select('id, nome, telefone, fornecedores!inner(evento_id)')
    .eq('fornecedores.evento_id', alvo.eventoId)
    .is('descredenciado_em', null)
  if (alvo.fornecedorId) q = q.eq('fornecedor_id', alvo.fornecedorId)
  if (alvo.somenteAtivos) q = q.eq('ativo', true)

  const { data } = await q
  const todos = data ?? []
  const validos = todos.filter(f => !!formatarNumeroWhatsApp(f.telefone as string))

  /*
   * `data_ref` recebe a data de hoje e o tipo vai como disparo manual, para
   * este envio não colidir com os agendamentos automáticos do mesmo dia — que
   * usam a chave (evento, funcionário, tipo, dia).
   */
  const hoje = new Date().toISOString().slice(0, 10)
  const linhas = validos.map(f => ({
    evento_id: alvo.eventoId,
    funcionario_id: f.id,
    tipo: 'disparo_manual',
    data_ref: hoje,
    agendado_para: new Date().toISOString(),
    telefone: f.telefone,
    // O template e os parâmetros viajam aqui: diferente dos automáticos, este
    // conteúdo não é recalculável depois — foi escolhido à mão agora.
    mensagem: JSON.stringify({ template, parametros }),
  }))

  if (linhas.length) {
    const { error } = await supabaseAdmin.from('mensagens_agendadas').insert(linhas)
    if (error) throw new Error(`Não consegui enfileirar: ${error.message}`)
  }

  revalidatePath('/admin/whatsapp')
  return { enfileiradas: linhas.length, semTelefone: todos.length - validos.length }
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
  await registrarEnviada({ telefone: numero, texto: `[${template}] ${parametros.join(' · ')}`, waMessageId: r.messageId ?? null })
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
