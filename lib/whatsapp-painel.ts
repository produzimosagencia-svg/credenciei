// O que o painel do WhatsApp lê e escreve.
//
// Separado de `lib/actions.ts` porque é outro assunto: aqui não se fala de
// evento, setor ou ponto — se fala do CANAL. Quem cuida disso é o dono da
// plataforma, não o produtor de um evento.

import { supabaseAdmin } from './supabase-server'
import { formatarNumeroWhatsApp } from './whatsapp'

const VERSAO = 'v21.0'

// ─── Templates aprovados na Meta ─────────────────────────────────────────────

export type TemplateMeta = {
  nome: string
  status: string
  categoria: string
  idioma: string
  corpo: string
  /** Quantas variáveis o corpo espera. É o que o disparo precisa preencher. */
  variaveis: number
}

export type NumeroWhatsApp = {
  id: string
  numero: string
  nome: string
  qualidade: string
  status: string
  configurado: boolean
}

/** Números pertencentes à conta da Meta, para a primeira etapa do disparo. */
export async function numerosWhatsApp(): Promise<NumeroWhatsApp[]> {
  const token = process.env.WHATSAPP_TOKEN
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  if (!token || !waba) return []

  try {
    const res = await fetch(
      `https://graph.facebook.com/${VERSAO}/${waba}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,status`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store' },
    )
    const corpo = await res.json().catch(() => null) as { data?: {
      id: string; display_phone_number?: string; verified_name?: string; quality_rating?: string; status?: string
    }[] } | null
    return (corpo?.data ?? []).map(n => ({
      id: n.id,
      numero: n.display_phone_number ?? 'Número sem identificação',
      nome: n.verified_name ?? 'WhatsApp Business',
      qualidade: n.quality_rating ?? 'UNKNOWN',
      status: n.status ?? 'UNKNOWN',
      configurado: n.id === process.env.WHATSAPP_PHONE_ID,
    }))
  } catch {
    return []
  }
}

/**
 * Os templates direto da Meta, não os do código.
 *
 * A diferença importa: o texto aprovado é o que a pessoa recebe, e ele pode
 * ter sido editado no painel da Meta sem o código saber. Ler da fonte evita
 * a tela mostrar um texto e o WhatsApp entregar outro.
 */
export async function templatesAprovados(): Promise<TemplateMeta[]> {
  const token = process.env.WHATSAPP_TOKEN
  const waba = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID
  if (!token || !waba) return []

  try {
    const res = await fetch(
      `https://graph.facebook.com/${VERSAO}/${waba}/message_templates?fields=name,status,category,language,components&limit=100`,
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store' },
    )
    const corpo = await res.json().catch(() => null) as
      { data?: { name: string; status: string; category: string; language?: string; components?: { type: string; text?: string }[] }[] } | null

    return (corpo?.data ?? []).map(t => {
      const texto = t.components?.find(c => c.type === 'BODY')?.text ?? ''
      return {
        nome: t.name,
        status: t.status,
        categoria: t.category,
        idioma: t.language ?? 'pt_BR',
        corpo: texto,
        variaveis: new Set([...texto.matchAll(/\{\{(\d+)\}\}/g)].map(m => m[1])).size,
      }
    }).sort((a, b) => a.nome.localeCompare(b.nome))
  } catch {
    return []
  }
}

// ─── Conversas ───────────────────────────────────────────────────────────────

export type StatusEnvioWhatsApp = 'sent' | 'delivered' | 'read' | 'failed'

export type Conversa = {
  telefone: string
  nome: string | null
  ultimaEm: string
  ultimoTexto: string | null
  ultimaDirecao: 'recebida' | 'enviada'
  /** Confirmação da Meta para a última mensagem, quando ela saiu daqui. */
  ultimoStatus: StatusEnvioWhatsApp | null
  naoLidas: number
  /** Dá para responder com texto livre? Só dentro de 24h da última recebida. */
  janelaAberta: boolean
}

const JANELA_H = 24
const CHAVE_LEITURAS = 'whatsapp_conversas_leituras'
const PRIORIDADE_STATUS: Record<StatusEnvioWhatsApp, number> = {
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
}

function ehStatusEnvio(tipo: string): tipo is StatusEnvioWhatsApp {
  return tipo === 'sent' || tipo === 'delivered' || tipo === 'read' || tipo === 'failed'
}

async function leiturasConversas(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin
    .from('sistema_estado')
    .select('valor')
    .eq('chave', CHAVE_LEITURAS)
    .maybeSingle()
  const valor = data?.valor
  return valor && typeof valor === 'object' && !Array.isArray(valor)
    ? valor as Record<string, string>
    : {}
}

/**
 * A lista de conversas, mais recente primeiro.
 *
 * Agrupa em memória em vez de no banco porque o volume é de centenas, não de
 * milhões, e um `distinct on` via PostgREST exigiria uma view só para isso.
 */
export async function conversas(limite = 100): Promise<Conversa[]> {
  const [{ data }, { data: status }, leituras] = await Promise.all([
    supabaseAdmin
      .from('whatsapp_eventos')
      .select('telefone, nome_contato, direcao, texto, ocorrido_em, wa_message_id')
      .in('direcao', ['recebida', 'enviada'])
      .not('telefone', 'is', null)
      .order('ocorrido_em', { ascending: false })
      .limit(2000),
    supabaseAdmin
      .from('whatsapp_eventos')
      .select('wa_message_id, tipo, ocorrido_em')
      .eq('direcao', 'status')
      .not('wa_message_id', 'is', null)
      .order('ocorrido_em', { ascending: false })
      .limit(4000),
    leiturasConversas(),
  ])

  const agora = Date.now()
  const porNumero = new Map<string, Conversa>()
  const statusPorMensagem = new Map<string, Conversa['ultimoStatus']>()
  // A consulta vem do status mais novo para o mais velho; o primeiro de cada
  // id é o estado final conhecido (read supera delivered, que supera sent).
  for (const item of status ?? []) {
    const id = item.wa_message_id as string
    const tipo = item.tipo as string
    const atual = statusPorMensagem.get(id)
    if (ehStatusEnvio(tipo) && (!atual || PRIORIDADE_STATUS[tipo] > PRIORIDADE_STATUS[atual])) {
      statusPorMensagem.set(id, tipo)
    }
  }

  for (const e of data ?? []) {
    const tel = e.telefone as string
    const dir = e.direcao as 'recebida' | 'enviada'
    let c = porNumero.get(tel)
    if (!c) {
      c = {
        telefone: tel,
        nome: (e.nome_contato as string | null) ?? null,
        ultimaEm: e.ocorrido_em as string,
        ultimoTexto: (e.texto as string | null) ?? null,
        ultimaDirecao: dir,
        ultimoStatus: dir === 'enviada'
          ? (statusPorMensagem.get(e.wa_message_id as string) ?? (e.wa_message_id ? 'sent' : null))
          : null,
        naoLidas: 0,
        janelaAberta: false,
      }
      porNumero.set(tel, c)
    }
    if (!c.nome && e.nome_contato) c.nome = e.nome_contato as string
    // A janela de resposta livre conta da última mensagem QUE A PESSOA mandou.
    if (dir === 'recebida' && !c.janelaAberta) {
      c.janelaAberta = agora - new Date(e.ocorrido_em as string).getTime() < JANELA_H * 3600_000
    }
    if (dir === 'recebida' && (!leituras[tel] || e.ocorrido_em > leituras[tel])) c.naoLidas++
  }

  return [...porNumero.values()]
    .sort((a, b) => b.ultimaEm.localeCompare(a.ultimaEm))
    .slice(0, limite)
}

/** Persiste o ponto de leitura sem precisar alterar a tabela de mensagens. */
export async function registrarLeituraConversa(telefone: string): Promise<void> {
  const [{ data: ultima }, leituras] = await Promise.all([
    supabaseAdmin
      .from('whatsapp_eventos')
      .select('ocorrido_em')
      .eq('telefone', telefone)
      .eq('direcao', 'recebida')
      .order('ocorrido_em', { ascending: false })
      .limit(1)
      .maybeSingle(),
    leiturasConversas(),
  ])
  if (!ultima?.ocorrido_em) return
  leituras[telefone] = ultima.ocorrido_em as string
  const { error } = await supabaseAdmin.from('sistema_estado').upsert(
    { chave: CHAVE_LEITURAS, valor: leituras, atualizado_em: new Date().toISOString() },
    { onConflict: 'chave' },
  )
  if (error) throw new Error(`Não consegui marcar a conversa como lida: ${error.message}`)
}

// ─── Histórico e custo dos disparos ─────────────────────────────────────────

export type CategoriaMeta = 'AUTHENTICATION' | 'MARKETING' | 'UTILITY'

export const PRECO_META_BRL: Record<CategoriaMeta, number> = {
  AUTHENTICATION: 0.035,
  MARKETING: 0.3217,
  UTILITY: 0.035,
}

const TEMPLATE_AUTOMATICO: Record<string, string> = {
  lembrete_entrada: 'lembrete_credenciamento',
  lembrete_meio: 'lembrete_credenciamento',
  lembrete_fim: 'lembrete_credenciamento',
  reforco_entrada: 'reforco_credenciamento',
  reforco_meio: 'reforco_credenciamento',
  reforco_fim: 'reforco_credenciamento',
  alerta_supervisor_entrada: 'alerta_supervisor_pendencia',
  alerta_supervisor_meio: 'alerta_supervisor_pendencia',
  alerta_supervisor_fim: 'alerta_supervisor_pendencia',
  confirmacao_escala: 'confirmacao_escala',
  credenciais_supervisor: 'supervisor_acesso',
  aviso_dia_evento: 'aviso_dia_evento',
  boas_vindas_funcionario: 'boas_vindas_funcionario',
  aviso_montagem: 'aviso_montagem',
  aviso_desmontagem: 'aviso_desmontagem',
}

const ROTULO_DISPARO: Record<string, string> = {
  lembrete_entrada: 'Lembrete de entrada', lembrete_meio: 'Lembrete de meio', lembrete_fim: 'Lembrete de saída',
  reforco_entrada: 'Reforço de entrada', reforco_meio: 'Reforço de meio', reforco_fim: 'Reforço de saída',
  alerta_supervisor_entrada: 'Alerta ao supervisor — entrada', alerta_supervisor_meio: 'Alerta ao supervisor — meio', alerta_supervisor_fim: 'Alerta ao supervisor — saída',
  confirmacao_escala: 'Confirmação de escala', credenciais_supervisor: 'Autenticação do supervisor',
  aviso_dia_evento: 'Aviso do dia do evento', boas_vindas_funcionario: 'Mensagem de cadastro',
  aviso_montagem: 'Aviso de montagem', aviso_desmontagem: 'Aviso de desmontagem',
  disparo_manual: 'Disparo manual',
}

export type DisparoResumo = {
  id: string
  tipo: string
  titulo: string
  template: string
  categoria: CategoriaMeta
  evento: string
  origem: 'equipe' | 'csv' | 'socios' | 'automatico' | 'desconhecida'
  telefone: string | null
  criadoEm: string
  total: number
  pendentes: number
  enviando: number
  enviados: number
  falhos: number
  cancelados: number
  custoEstimado: number
}

function categoriaDoTemplate(template: string, tipo: string, categorias: Map<string, CategoriaMeta>): CategoriaMeta {
  const encontrada = categorias.get(template)
  if (encontrada) return encontrada
  // Credencial de acesso é o único fluxo de autenticação quando a API não
  // consegue devolver a categoria histórica do template.
  if (tipo === 'credenciais_supervisor') return 'AUTHENTICATION'
  return 'UTILITY'
}

/**
 * Todos os envios do canal. Campanhas manuais são agrupadas pelo id da
 * campanha; automações disparadas juntas são agrupadas por tipo/evento/minuto.
 * Isso evita transformar uma operação de 500 pessoas em 500 cartões iguais.
 */
export async function disparosDoCanal(templates: TemplateMeta[], limiteLinhas = 5000): Promise<DisparoResumo[]> {
  const { data } = await supabaseAdmin
    .from('mensagens_agendadas')
    .select('id, tipo, telefone, status, created_at, mensagem, evento_id, eventos(nome)')
    .order('created_at', { ascending: false })
    .limit(limiteLinhas)

  const categorias = new Map(templates
    .filter(t => t.categoria === 'AUTHENTICATION' || t.categoria === 'MARKETING' || t.categoria === 'UTILITY')
    .map(t => [t.nome, t.categoria as CategoriaMeta]))
  const grupos = new Map<string, DisparoResumo>()
  for (const linha of data ?? []) {
    let meta: { campanhaId?: string; template?: string; origem?: 'equipe' | 'csv' | 'socios' | 'automatico' } = {}
    try { meta = JSON.parse(linha.mensagem as string) as typeof meta } catch { /* linha legada */ }
    const tipo = linha.tipo as string
    const template = meta.template ?? TEMPLATE_AUTOMATICO[tipo] ?? 'Template não identificado'
    const legado = `${linha.evento_id}:${template}:${String(linha.created_at).slice(0, 16)}`
    const id = tipo === 'disparo_manual'
      ? (meta.campanhaId ?? legado)
      : `${tipo}:${linha.evento_id}:${String(linha.created_at).slice(0, 16)}`
    const categoria = categoriaDoTemplate(template, tipo, categorias)
    let grupo = grupos.get(id)
    if (!grupo) {
      grupo = {
        id,
        tipo,
        titulo: ROTULO_DISPARO[tipo] ?? tipo.replaceAll('_', ' '),
        template,
        categoria,
        evento: (linha.eventos as unknown as { nome?: string } | null)?.nome ?? 'Evento não identificado',
        origem: tipo === 'disparo_manual' ? (meta.origem ?? 'desconhecida') : 'automatico',
        telefone: tipo === 'disparo_manual' ? null : linha.telefone as string,
        criadoEm: linha.created_at as string,
        total: 0,
        pendentes: 0,
        enviando: 0,
        enviados: 0,
        falhos: 0,
        cancelados: 0,
        custoEstimado: 0,
      }
      grupos.set(id, grupo)
    } else if (grupo.telefone !== linha.telefone) {
      grupo.telefone = null
    }
    grupo.total++
    if (linha.status === 'pendente') grupo.pendentes++
    else if (linha.status === 'enviando') grupo.enviando++
    else if (linha.status === 'enviado') grupo.enviados++
    else if (linha.status === 'falhou') grupo.falhos++
    else if (linha.status === 'cancelado') grupo.cancelados++
    if (linha.status === 'enviado') grupo.custoEstimado += PRECO_META_BRL[categoria]
  }

  return [...grupos.values()].sort((a, b) => b.criadoEm.localeCompare(a.criadoEm))
}

export type ResumoFinanceiroWhatsApp = {
  enviados: number
  custoEstimado: number
  porCategoria: Record<CategoriaMeta, { enviados: number; custo: number }>
}

/** Total histórico, paginado para não depender do limite padrão do PostgREST. */
export async function resumoFinanceiroWhatsApp(templates: TemplateMeta[]): Promise<ResumoFinanceiroWhatsApp> {
  const categorias = new Map(templates
    .filter(t => t.categoria === 'AUTHENTICATION' || t.categoria === 'MARKETING' || t.categoria === 'UTILITY')
    .map(t => [t.nome, t.categoria as CategoriaMeta]))
  const porCategoria: ResumoFinanceiroWhatsApp['porCategoria'] = {
    AUTHENTICATION: { enviados: 0, custo: 0 },
    MARKETING: { enviados: 0, custo: 0 },
    UTILITY: { enviados: 0, custo: 0 },
  }

  const tamanho = 1000
  for (let inicio = 0; ; inicio += tamanho) {
    const { data } = await supabaseAdmin
      .from('mensagens_agendadas')
      .select('tipo, mensagem')
      .eq('status', 'enviado')
      .range(inicio, inicio + tamanho - 1)
    for (const linha of data ?? []) {
      let meta: { template?: string } = {}
      try { meta = JSON.parse(linha.mensagem as string) as typeof meta } catch { /* automação */ }
      const tipo = linha.tipo as string
      const template = meta.template ?? TEMPLATE_AUTOMATICO[tipo] ?? ''
      const categoria = categoriaDoTemplate(template, tipo, categorias)
      porCategoria[categoria].enviados++
      porCategoria[categoria].custo += PRECO_META_BRL[categoria]
    }
    if ((data?.length ?? 0) < tamanho) break
  }

  /*
   * Autenticação pode sair diretamente pela Cloud API (OTP), sem passar pela
   * fila `mensagens_agendadas`. Esses envios vivem em `whatsapp_eventos` com
   * o nome do template no payload de auditoria. Somamos apenas AUTHENTICATION:
   * os disparos de utilidade feitos como teste direto não pertencem ao volume
   * operacional que o KPI da fila já representa.
   *
   * Mensagens da fila não duplicam aqui: o worker grava a conversa sem
   * `bruto.template`; só o caminho direto conserva esse metadado.
   */
  for (let inicio = 0; ; inicio += tamanho) {
    const { data } = await supabaseAdmin
      .from('whatsapp_eventos')
      .select('bruto')
      .eq('direcao', 'enviada')
      .not('bruto->>template', 'is', null)
      .range(inicio, inicio + tamanho - 1)
    for (const linha of data ?? []) {
      const template = (linha.bruto as { template?: string } | null)?.template ?? ''
      if (categoriaDoTemplate(template, '', categorias) !== 'AUTHENTICATION') continue
      porCategoria.AUTHENTICATION.enviados++
      porCategoria.AUTHENTICATION.custo += PRECO_META_BRL.AUTHENTICATION
    }
    if ((data?.length ?? 0) < tamanho) break
  }

  return {
    enviados: Object.values(porCategoria).reduce((soma, item) => soma + item.enviados, 0),
    custoEstimado: Object.values(porCategoria).reduce((soma, item) => soma + item.custo, 0),
    porCategoria,
  }
}

export type MensagemChat = {
  id: string
  direcao: 'recebida' | 'enviada'
  texto: string | null
  em: string
  /** Último status conhecido da enviada: sent, delivered, read, failed. */
  status: string | null
  erro: string | null
}

export type PerfilConversa = {
  cadastrado: boolean
  nome: string | null
  cpf: string | null
  telefone: string
  email: string | null
  empresa: string | null
  cargo: string | null
  cidade: string | null
  chavePix: string | null
  ativo: boolean | null
  cadastradoEm: string | null
  eventos: {
    funcionarioId: string
    eventoId: string
    evento: string
    setor: string
    cargo: string | null
    inicio: string
    fim: string
    local: string | null
    ativo: boolean
    registros: { tipo: string; em: string }[]
  }[]
}

/** Formatos que costumam existir nos cadastros antigos (com e sem máscara/DDI). */
function variantesTelefone(telefone: string): string[] {
  const completo = formatarNumeroWhatsApp(telefone) ?? telefone.replace(/\D/g, '')
  const local = completo.startsWith('55') ? completo.slice(2) : completo
  const ddd = local.slice(0, 2)
  const numero = local.slice(2)
  const mascarado = numero.length === 9
    ? `(${ddd}) ${numero.slice(0, 5)}-${numero.slice(5)}`
    : `(${ddd}) ${numero.slice(0, 4)}-${numero.slice(4)}`
  return [...new Set([completo, local, mascarado, `55${local}`, `+55 ${mascarado}`])]
}

/** Junta todos os vínculos encontrados para o número em uma ficha única. */
export async function perfilDaConversa(telefone: string): Promise<PerfilConversa> {
  const numero = formatarNumeroWhatsApp(telefone) ?? telefone.replace(/\D/g, '')
  const { data: cadastros } = await supabaseAdmin
    .from('funcionarios')
    .select(`
      id, nome, cpf, telefone, email, empresa, cargo, cidade, chave_pix, ativo, created_at,
      fornecedores(id, nome, eventos(id, nome, data_inicio, data_fim, local))
    `)
    .in('telefone', variantesTelefone(telefone))
    .order('created_at', { ascending: false })

  if (!cadastros?.length) {
    return {
      cadastrado: false, nome: null, cpf: null, telefone: numero, email: null,
      empresa: null, cargo: null, cidade: null, chavePix: null, ativo: null,
      cadastradoEm: null, eventos: [],
    }
  }

  const { data: registros } = await supabaseAdmin
    .from('registros')
    .select('funcionario_id, tipo, created_at')
    .in('funcionario_id', cadastros.map(c => c.id))
    .order('created_at')

  const porFuncionario = new Map<string, { tipo: string; em: string }[]>()
  for (const registro of registros ?? []) {
    const itens = porFuncionario.get(registro.funcionario_id as string) ?? []
    itens.push({ tipo: registro.tipo as string, em: registro.created_at as string })
    porFuncionario.set(registro.funcionario_id as string, itens)
  }

  type Relacao = {
    id: string
    nome: string
    eventos: { id: string; nome: string; data_inicio: string; data_fim: string; local: string | null }
  }
  const atual = cadastros[0]
  const valorMaisRecente = (campo: 'email' | 'empresa' | 'cargo' | 'cidade' | 'chave_pix') =>
    (cadastros.find(c => c[campo])?.[campo] as string | null) ?? null

  return {
    cadastrado: true,
    nome: atual.nome as string,
    cpf: atual.cpf as string,
    telefone: (atual.telefone as string) || numero,
    email: valorMaisRecente('email'),
    empresa: valorMaisRecente('empresa'),
    cargo: valorMaisRecente('cargo'),
    cidade: valorMaisRecente('cidade'),
    chavePix: valorMaisRecente('chave_pix'),
    ativo: atual.ativo as boolean | null,
    cadastradoEm: atual.created_at as string,
    eventos: cadastros.flatMap(c => {
      const fornecedor = c.fornecedores as unknown as Relacao | null
      if (!fornecedor?.eventos) return []
      return [{
        funcionarioId: c.id as string,
        eventoId: fornecedor.eventos.id,
        evento: fornecedor.eventos.nome,
        setor: fornecedor.nome,
        cargo: (c.cargo as string | null) ?? null,
        inicio: fornecedor.eventos.data_inicio,
        fim: fornecedor.eventos.data_fim,
        local: fornecedor.eventos.local,
        ativo: c.ativo !== false,
        registros: porFuncionario.get(c.id as string) ?? [],
      }]
    }).sort((a, b) => b.inicio.localeCompare(a.inicio)),
  }
}

/** A conversa de um número, em ordem cronológica. */
export async function conversaDe(telefone: string): Promise<MensagemChat[]> {
  const { data: mensagens } = await supabaseAdmin
    .from('whatsapp_eventos')
    .select('id, direcao, tipo, texto, ocorrido_em, wa_message_id, bruto')
    .eq('telefone', telefone)
    .in('direcao', ['recebida', 'enviada'])
    .order('ocorrido_em')
    .limit(500)

  // Busca as confirmações pelo ID da mensagem, não pelo telefone. A Meta pode
  // representar o recipient_id de forma diferente da linha que gravamos no
  // envio; o ID é a ligação estável entre enviada, entregue e visualizada.
  const idsEnviados = (mensagens ?? [])
    .filter(e => e.direcao === 'enviada' && e.wa_message_id)
    .map(e => e.wa_message_id as string)
  const { data: status } = idsEnviados.length
    ? await supabaseAdmin
        .from('whatsapp_eventos')
        .select('tipo, ocorrido_em, wa_message_id, bruto')
        .eq('direcao', 'status')
        .in('wa_message_id', idsEnviados)
        .order('ocorrido_em')
    : { data: [] }

  const statusPorId = new Map<string, { tipo: string; erro: string | null }>()
  for (const e of status ?? []) {
    if (!e.wa_message_id) continue
    const err = (e.bruto as { errors?: { code?: number; title?: string }[] } | null)?.errors?.[0]
    const tipo = e.tipo as string
    const atual = statusPorId.get(e.wa_message_id as string)
    if (!ehStatusEnvio(tipo) || (atual && ehStatusEnvio(atual.tipo) && PRIORIDADE_STATUS[atual.tipo] >= PRIORIDADE_STATUS[tipo])) continue
    statusPorId.set(e.wa_message_id as string, {
      tipo,
      erro: err ? `${err.code}: ${err.title ?? ''}` : null,
    })
  }

  return (mensagens ?? [])
    .map(e => {
      const st = e.wa_message_id ? statusPorId.get(e.wa_message_id as string) : undefined
      return {
        id: e.id as string,
        direcao: e.direcao as 'recebida' | 'enviada',
        texto: (e.texto as string | null) ?? null,
        em: e.ocorrido_em as string,
        status: st?.tipo ?? (e.direcao === 'enviada' && e.wa_message_id ? 'sent' : null),
        erro: st?.erro ?? null,
      }
    })
}

/** Registra no histórico uma mensagem que SAIU — é o outro lado do chat. */
export async function registrarEnviada(params: {
  telefone: string
  texto: string
  waMessageId?: string | null
  eventoId?: string | null
  funcionarioId?: string | null
  bruto?: Record<string, unknown> | null
}): Promise<void> {
  const { error } = await supabaseAdmin.from('whatsapp_eventos').insert({
    direcao: 'enviada',
    wa_message_id: params.waMessageId ?? null,
    telefone: formatarNumeroWhatsApp(params.telefone) ?? params.telefone,
    tipo: 'text',
    texto: params.texto,
    ocorrido_em: new Date().toISOString(),
    evento_id: params.eventoId ?? null,
    funcionario_id: params.funcionarioId ?? null,
    bruto: params.bruto ?? null,
  })
  if (error && error.code !== '23505') console.error('[painel] não gravei a enviada:', error.message)
}

// ─── Fluxos automáticos ──────────────────────────────────────────────────────

/**
 * Quais mensagens automáticas estão ligadas.
 *
 * Só o que está aqui como `true` é agendado. Serve para desligar um tipo sem
 * mexer em código — útil quando um template ainda não foi aprovado, ou quando
 * um evento específico não quer certo aviso.
 */
/*
 * `confirmacao_escala` não está aqui: ela dependia de um campo de data na
 * tela de edição do evento, que saiu. Sem esse campo não há quando enviar, e
 * listar um fluxo que nunca dispara seria pior que não listar.
 */
export const FLUXOS: { chave: string; titulo: string; descricao: string; quando: string }[] = [
  { chave: 'boas_vindas_funcionario', titulo: 'Boas-vindas', quando: 'Assim que a pessoa termina o cadastro',
    descricao: 'Manda o link da credencial e explica as três etapas.' },
  { chave: 'aviso_dia_evento', titulo: 'Aviso do dia do evento', quando: 'Na manhã do dia do evento',
    descricao: 'O texto completo, com as três etapas e os horários.' },
  { chave: 'aviso_montagem', titulo: 'Aviso de montagem', quando: '07:00 de cada dia de preparação antes do evento',
    descricao: 'Lembra que hoje tem trabalho e que o horário é livre.' },
  { chave: 'aviso_desmontagem', titulo: 'Aviso de desmontagem', quando: '07:00 de cada dia depois do evento',
    descricao: 'Mesma ideia, com o tom da fase de desmonte.' },
  { chave: 'lembrete', titulo: 'Lembrete de etapa', quando: 'Quando abre o horário de cada etapa',
    descricao: 'Avisa que chegou a hora de registrar entrada, meio ou saída.' },
  { chave: 'reforco', titulo: 'Reforço de etapa', quando: 'Pouco antes do prazo, só para quem não registrou',
    descricao: 'A segunda chamada de quem ainda está pendente.' },
  { chave: 'alerta_supervisor', titulo: 'Alerta ao supervisor', quando: 'Quando o prazo de uma etapa passa',
    descricao: 'Manda ao supervisor a lista de quem ficou pendente.' },
]

export async function fluxosAtivos(): Promise<Record<string, boolean>> {
  try {
    const { data } = await supabaseAdmin
      .from('sistema_estado').select('valor').eq('chave', 'fluxos').maybeSingle()
    const salvo = (data?.valor ?? {}) as Record<string, boolean>
    // Sem configuração salva, tudo ligado: é o comportamento que o sistema
    // sempre teve, e desligar por omissão faria a operação emudecer sozinha.
    return Object.fromEntries(FLUXOS.map(f => [f.chave, salvo[f.chave] !== false]))
  } catch {
    return Object.fromEntries(FLUXOS.map(f => [f.chave, true]))
  }
}
