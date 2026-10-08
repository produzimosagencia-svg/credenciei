'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getPerfil, supabaseAdmin, buscarTudo } from './supabase-server'
import { registrarAuditoria } from './auditoria'
import { emLotes } from './lotes'
import { ehMaster } from './permissions'
import { formatarNumeroWhatsApp, responderConversa, provedor } from './whatsapp'
import {
  registrarEnviada, registrarLeituraConversa, FLUXOS, fluxosAtivos, numerosWhatsApp, templatesAprovados,
} from './whatsapp-painel'
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
  /**
   * URL pública da imagem, obrigatória quando o template tem cabeçalho de
   * mídia. Quem busca o arquivo é o servidor da Meta, então precisa ser
   * https e acessível de fora.
   */
  imagemUrl?: string
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

  /*
   * PAGINADO (`buscarTudo`): o Supabase corta em 1000 linhas por resposta sem
   * avisar — num evento de 4.000 pessoas a prévia mostraria (e o disparo
   * mandaria) só para os primeiros 1000 por nome. `id` desempata nomes
   * iguais pra as páginas não se sobreporem. Tolerante como antes: se a
   * consulta falhar, a prévia sai vazia.
   */
  const montar = () => {
    let q = supabaseAdmin
      .from('funcionarios')
      .select('id, nome, telefone, fornecedores!inner(nome, evento_id)')
      .eq('fornecedores.evento_id', alvo.eventoId)
      .is('descredenciado_em', null)
    if (alvo.fornecedorId) q = q.eq('fornecedor_id', alvo.fornecedorId)
    if (alvo.somenteAtivos) q = q.eq('ativo', true)
    return q.order('nome').order('id')
  }

  const data = await buscarTudo((de, ate) => montar().range(de, ate)).catch(() => null)
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
): Promise<{ enfileiradas: number; semTelefone: number; excluidas: number; campanhaId: string }> {
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

  /*
   * Template com cabeçalho de mídia exige a imagem em todo envio. Barrar aqui
   * é o que evita enfileirar mil mensagens que vão falhar uma a uma: a Meta
   * recusa cada uma com erro de contagem de parâmetros, sem dizer que o que
   * falta é a imagem.
   */
  if (modelo.cabecalho === 'IMAGE' && !pedido.imagemUrl?.trim()) {
    throw new Error(`O template "${modelo.nome}" tem cabeçalho de imagem: informe a URL pública da imagem.`)
  }
  if (modelo.cabecalho && modelo.cabecalho !== 'TEXT' && modelo.cabecalho !== 'IMAGE') {
    throw new Error(`O template "${modelo.nome}" tem cabeçalho de ${modelo.cabecalho.toLowerCase()}, que esta tela ainda não envia.`)
  }
  if (pedido.imagemUrl && !/^https:\/\//.test(pedido.imagemUrl.trim())) {
    throw new Error('A imagem precisa de uma URL https pública: quem busca o arquivo é o servidor da Meta.')
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
    /*
     * PAGINADO, pelo mesmo teto de 1000 linhas da prévia: sem isto, um evento
     * de 4.000 pessoas disparava só para 1000 delas, sem aviso nenhum. A
     * ordem (nome, id) é a mesma da prévia — assim, quando dois cadastros
     * dividem um telefone, o nome que vai na mensagem é o que a prévia
     * mostrou — e é o que mantém as páginas sem sobreposição.
     */
    const montar = () => {
      let q = supabaseAdmin
        .from('funcionarios')
        .select('id, nome, telefone, fornecedores!inner(evento_id)')
        .eq('fornecedores.evento_id', pedido.alvo.eventoId)
        .is('descredenciado_em', null)
      if (pedido.alvo.fornecedorId) q = q.eq('fornecedor_id', pedido.alvo.fornecedorId)
      if (pedido.alvo.somenteAtivos) q = q.eq('ativo', true)
      return q.order('nome').order('id')
    }
    try {
      brutos = await buscarTudo((de, ate) => montar().range(de, ate))
    } catch (e) {
      throw new Error(`Não consegui carregar o público: ${(e as Error).message}`)
    }
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
  if (!await podePassar(`disparo:${perfil.id}`, 5, 60 * 60 * 1000)) {
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
      // Sem isto, template com cabeçalho de imagem sai sem o parâmetro dela e
      // a Meta recusa a mensagem inteira, destinatário por destinatário.
      imagemUrl: pedido.imagemUrl,
      campanhaId,
      origem: pedido.origem,
    }),
  }))

  for (let inicio = 0; inicio < linhas.length; inicio += 500) {
    const { error } = await supabaseAdmin.from('mensagens_agendadas').insert(linhas.slice(inicio, inicio + 500))
    if (error) throw new Error(`Não consegui enfileirar: ${error.message}`)
  }

  const origemTexto = pedido.origem === 'equipe' ? 'equipe do evento' : pedido.origem === 'csv' ? 'planilha' : 'sócios'
  after(() => registrarAuditoria({
    perfil, acao: 'WHATSAPP_DISPARO', campoAlterado: 'Disparo em massa',
    valorNovo: `${linhas.length} destinatário(s) · modelo "${modelo.nome}" · ${origemTexto} · campanha ${campanhaId}`.slice(0, 160),
    eventoId: pedido.alvo.eventoId,
  }))

  revalidatePath('/admin/whatsapp')
  // O id da campanha sai junto: sem ele não dá pra acompanhar ESTE disparo
  // depois, só o total do dia misturado com os avisos automáticos.
  return { enfileiradas: linhas.length, semTelefone, excluidas, campanhaId }
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

// ─── Fluxos ──────────────────────────────────────────────────────────────────

/** Liga/desliga os disparos automáticos. Só o que está ligado é agendado. */
export async function salvarFluxos(ativos: Record<string, boolean>) {
  const perfil = await exigirMaster()
  const limpo = Object.fromEntries(FLUXOS.map(f => [f.chave, ativos[f.chave] !== false]))
  // Como estava, para a auditoria dizer QUAL resposta automática foi ligada ou desligada.
  const antes = await fluxosAtivos()

  const { error } = await supabaseAdmin.from('sistema_estado').upsert(
    { chave: 'fluxos', valor: limpo, atualizado_em: new Date().toISOString() },
    { onConflict: 'chave' },
  )
  if (error) throw new Error('Não foi possível salvar. Rode o SQL do painel primeiro.')

  const mudaram = FLUXOS.filter(f => antes[f.chave] !== limpo[f.chave])
  if (mudaram.length) {
    const descrever = (estado: Record<string, boolean>) =>
      mudaram.map(f => `${f.titulo}: ${estado[f.chave] ? 'ligado' : 'desligado'}`).join(' · ').slice(0, 120)
    after(() => registrarAuditoria({
      perfil, acao: 'WHATSAPP_FLUXOS_ALTERADOS', campoAlterado: 'Respostas automáticas do WhatsApp',
      valorAnterior: descrever(antes), valorNovo: descrever(limpo),
    }))
  }

  revalidatePath('/admin/whatsapp/fluxos')
  return { ok: true as const }
}

// ─── Acompanhamento de um disparo ────────────────────────────────────────────

export type StatusDisparo = {
  total: number
  pendentes: number
  enviando: number
  enviadas: number
  falhas: number
  canceladas: number
  /** Terminou quando ninguém mais está esperando a vez. */
  concluido: boolean
  /** Os que não chegaram, com o motivo que a Meta devolveu. */
  erros: { telefone: string; motivo: string }[]
}

/**
 * Como está UM disparo, pelo id da campanha.
 *
 * A Visão geral responde "quantas saíram hoje", somando o disparo manual com
 * todos os avisos automáticos do sistema. Pra um envio esporádico isso não
 * serve: a pergunta é "o meu, aquele de agora, chegou?".
 *
 * O id da campanha mora dentro do JSON da coluna `mensagem`, que é texto, não
 * jsonb. Por isso a busca é por `ilike` com o UUID: não é elegante, mas um
 * UUID não colide com nada e evita migração de coluna só pra isto.
 */
export async function statusDoDisparo(campanhaId: string): Promise<StatusDisparo> {
  await exigirMaster()
  if (!/^[0-9a-f-]{36}$/i.test(campanhaId)) throw new Error('Identificador de disparo inválido.')

  /*
   * PAGINADO: um disparo para um evento inteiro passa das 1000 linhas que o
   * Supabase devolve por resposta, e o acompanhamento travaria em "1000"
   * com o resto invisível. `id` mantém as páginas sem sobreposição.
   */
  let linhas: { id: string; status: string; telefone: string }[]
  try {
    linhas = await buscarTudo((de, ate) =>
      supabaseAdmin
        .from('mensagens_agendadas')
        .select('id, status, telefone')
        .eq('tipo', 'disparo_manual')
        .ilike('mensagem', `%${campanhaId}%`)
        .order('id')
        .range(de, ate),
    )
  } catch (e) {
    throw new Error(`Não consegui ler o status: ${(e as Error).message}`)
  }

  const conta = (s: string) => (linhas ?? []).filter(l => l.status === s).length
  const falhas = conta('falhou')

  // O motivo só existe no log, e só pra quem falhou. Buscar sempre seria puxar
  // uma linha por tentativa de todo mundo, inclusive de quem deu certo.
  let erros: { telefone: string; motivo: string }[] = []
  if (falhas > 0) {
    const ids = (linhas ?? []).filter(l => l.status === 'falhou').map(l => l.id)
    /*
     * Em lotes de 200 ids e paginado: com centenas de falhas o `.in` estoura
     * a URL (~16KB) e a consulta falha inteira; e as tentativas podem passar
     * do teto de 1000 linhas. Como cada lote vem ordenado só dentro de si,
     * a ordem global (mais recente primeiro) é refeita depois de juntar —
     * é ela que decide a "última tentativa" e quais 50 erros aparecem.
     * Tolerante como antes: um lote que falha só fica sem motivo.
     */
    type LogDeErro = { mensagem_agendada_id: string; erro: string | null; destinatario_telefone: string | null; criado_em: string }
    const partes = await Promise.all(emLotes(ids).map(lote =>
      buscarTudo<LogDeErro>((de, ate) =>
        supabaseAdmin
          .from('mensagens_log')
          .select('mensagem_agendada_id, erro, destinatario_telefone, criado_em')
          .in('mensagem_agendada_id', lote)
          .eq('status', 'erro')
          .order('criado_em', { ascending: false })
          .order('id')
          .range(de, ate),
      ).catch(() => [] as LogDeErro[]),
    ))
    const logs = partes.flat().sort((a, b) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())

    const vistos = new Set<string>()
    for (const l of logs ?? []) {
      const chave = String(l.mensagem_agendada_id)
      if (vistos.has(chave)) continue   // só a última tentativa de cada um
      vistos.add(chave)
      erros.push({
        telefone: String(l.destinatario_telefone ?? ''),
        motivo: String(l.erro ?? 'sem detalhe').slice(0, 300),
      })
    }
    erros = erros.slice(0, 50)
  }

  const pendentes = conta('pendente')
  const enviando = conta('enviando')
  return {
    total: (linhas ?? []).length,
    pendentes,
    enviando,
    enviadas: conta('enviado'),
    falhas,
    canceladas: conta('cancelado'),
    concluido: pendentes === 0 && enviando === 0,
    erros,
  }
}

// ─── Imagem de cabeçalho dos templates ───────────────────────────────────────

/** Trinta dias. A URL só precisa viver enquanto a fila do disparo escoa. */
const VALIDADE_IMAGEM_S = 60 * 60 * 24 * 30

/**
 * Sobe a arte do cabeçalho e devolve um link que a Meta consegue abrir.
 *
 * O bucket é PRIVADO, como todos os deste projeto, e o link é assinado. A Meta
 * não precisa de bucket público: ela só precisa de um https que funcione sem
 * login, e é isso que a URL assinada é. Bucket público com caminho previsível
 * deixaria a arte de qualquer cliente aberta pra quem adivinhasse o endereço.
 *
 * O nome do arquivo é aleatório de propósito: nome de arquivo do cliente
 * costuma dizer o nome do evento e do artista antes de a coisa ser anunciada.
 *
 * O prazo de 30 dias é folga sobre o que o disparo leva pra escoar. Se um dia
 * uma fila demorar mais do que isso, as últimas mensagens falham ao buscar a
 * imagem: é o custo de não ter bucket público, e vale pagar.
 */
export async function subirImagemDeTemplate(formData: FormData): Promise<{ url: string }> {
  await exigirMaster()

  const arquivo = formData.get('arquivo')
  if (!(arquivo instanceof File) || arquivo.size === 0) throw new Error('Escolha uma imagem.')

  const TIPOS = ['image/jpeg', 'image/png', 'image/webp']
  if (!TIPOS.includes(arquivo.type)) {
    throw new Error('A imagem precisa ser JPG, PNG ou WEBP.')
  }
  // A Meta recusa mídia acima de 5MB no cabeçalho de template.
  if (arquivo.size > 5 * 1024 * 1024) throw new Error('Imagem muito grande. O limite da Meta é 5MB.')

  const extensao = arquivo.type === 'image/png' ? 'png' : arquivo.type === 'image/webp' ? 'webp' : 'jpg'
  const caminho = `cabecalhos/${randomUUID()}.${extensao}`

  const { error } = await supabaseAdmin.storage
    .from('templates')
    .upload(caminho, Buffer.from(await arquivo.arrayBuffer()), { contentType: arquivo.type })
  if (error) throw new Error(`Não consegui subir a imagem: ${error.message}`)

  const { data, error: erroUrl } = await supabaseAdmin.storage
    .from('templates')
    .createSignedUrl(caminho, VALIDADE_IMAGEM_S)
  if (erroUrl || !data?.signedUrl) throw new Error('Subi a imagem mas não consegui gerar o link. Tente de novo.')

  return { url: data.signedUrl }
}
