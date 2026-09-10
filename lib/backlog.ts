import { supabaseAdmin } from './supabase-server'
import {
  STATUS_ENCERRADOS, STATUS_GANHOS, ORDEM_PRIORIDADE,
  type TipoItem, type Prioridade,
} from './backlog-constantes'

/**
 * O Backlog Operacional — leitura.
 *
 * Quem escreve é lib/actions-backlog.ts. Nenhuma função aqui checa permissão
 * sozinha: as páginas checam `podeGerenciarBacklog` antes de renderizar e as
 * actions checam de novo, uma a uma (uma Server Action pode ser chamada
 * direto — a tela que esconde o menu não é a barreira).
 *
 * ─── HOJE É EM BRASÍLIA ──────────────────────────────────────────────────────
 *
 * Toda comparação de data usa `hojeBRT()`, não `new Date()` do servidor. A
 * função roda em Washington: às 21h de Brasília já é o dia seguinte lá, e
 * "contatos de hoje" apareceria vazio no fim da tarde — justo a hora em que
 * alguém abre a tela pra ver o que ainda falta fazer.
 */

export type ItemBacklog = {
  id: string
  tipo: TipoItem
  titulo: string
  status: string
  prioridade: Prioridade
  responsavelId: string | null
  responsavelNome: string | null
  eventoId: string | null
  eventoNome: string | null

  descricao: string | null
  prazo: string | null

  contatoNome: string | null
  whatsapp: string | null
  email: string | null
  eventoPrevistoNome: string | null
  dataEventoPrevista: string | null
  quantidadeEstimada: number | null
  servicoInteresse: string | null
  origemLead: string | null
  proximoContatoData: string | null

  observacoes: string | null
  convertidoOrganizacaoId: string | null
  convertidoOrganizacaoNome: string | null
  convertidoEm: string | null
  criadoPorNome: string | null
  criadoEm: string
  atualizadoEm: string
}

export type EntradaHistorico = {
  id: string
  acao: string
  valorAnterior: string | null
  valorNovo: string | null
  autorNome: string | null
  criadoEm: string
}

export type FiltroBacklog = {
  tipo?: TipoItem
  status?: string
  prioridade?: string
  responsavelId?: string
  eventoId?: string
  origem?: string
  busca?: string
  /** 'encerrados' inclui fechado/perdido/concluído/cancelado; o padrão os esconde. */
  incluirEncerrados?: boolean
}

/** A data de hoje em Brasília, no formato `YYYY-MM-DD` — a régua de tudo aqui. */
export function hojeBRT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

type LinhaCrua = Record<string, unknown> & {
  perfis?: { nome?: string } | { nome?: string }[] | null
  eventos?: { nome?: string } | { nome?: string }[] | null
  organizacoes?: { nome?: string } | { nome?: string }[] | null
}

/** O join do PostgREST tipa 1:1 como array; em runtime vem objeto. Aceita os dois. */
function nomeDaRelacao(rel: LinhaCrua['perfis']): string | null {
  if (!rel) return null
  return (Array.isArray(rel) ? rel[0]?.nome : rel.nome) ?? null
}

const SELECT_ITEM = `
  id, tipo, titulo, status, prioridade, responsavel_id, evento_id,
  descricao, prazo, contato_nome, whatsapp, email, evento_previsto_nome,
  data_evento_prevista, quantidade_estimada, servico_interesse, origem_lead,
  proximo_contato_data, observacoes, convertido_organizacao_id, convertido_em,
  criado_em, atualizado_em,
  perfis:responsavel_id(nome), eventos:evento_id(nome), organizacoes:convertido_organizacao_id(nome)
`

function montar(linha: LinhaCrua): ItemBacklog {
  return {
    id: linha.id as string,
    tipo: linha.tipo as TipoItem,
    titulo: linha.titulo as string,
    status: linha.status as string,
    prioridade: (linha.prioridade as Prioridade) ?? 'media',
    responsavelId: (linha.responsavel_id as string | null) ?? null,
    responsavelNome: nomeDaRelacao(linha.perfis),
    eventoId: (linha.evento_id as string | null) ?? null,
    eventoNome: nomeDaRelacao(linha.eventos),
    descricao: (linha.descricao as string | null) ?? null,
    prazo: (linha.prazo as string | null) ?? null,
    contatoNome: (linha.contato_nome as string | null) ?? null,
    whatsapp: (linha.whatsapp as string | null) ?? null,
    email: (linha.email as string | null) ?? null,
    eventoPrevistoNome: (linha.evento_previsto_nome as string | null) ?? null,
    dataEventoPrevista: (linha.data_evento_prevista as string | null) ?? null,
    quantidadeEstimada: (linha.quantidade_estimada as number | null) ?? null,
    servicoInteresse: (linha.servico_interesse as string | null) ?? null,
    origemLead: (linha.origem_lead as string | null) ?? null,
    proximoContatoData: (linha.proximo_contato_data as string | null) ?? null,
    observacoes: (linha.observacoes as string | null) ?? null,
    convertidoOrganizacaoId: (linha.convertido_organizacao_id as string | null) ?? null,
    convertidoOrganizacaoNome: nomeDaRelacao(linha.organizacoes),
    convertidoEm: (linha.convertido_em as string | null) ?? null,
    criadoPorNome: null,
    criadoEm: linha.criado_em as string,
    atualizadoEm: linha.atualizado_em as string,
  }
}

/**
 * Todos os itens que casam com o filtro.
 *
 * A ordenação final é feita aqui, e não no banco, porque a régua é composta:
 * prioridade primeiro (alta em cima), depois a data que cobra o item — prazo
 * pra tarefa, próximo contato pra cliente — com quem não tem data no fim. É
 * a ordem em que a pessoa quer ver a coluna do Kanban: o que aperta primeiro.
 */
export async function listarBacklog(filtro: FiltroBacklog = {}): Promise<ItemBacklog[]> {
  let q = supabaseAdmin.from('backlog_itens').select(SELECT_ITEM)

  if (filtro.tipo) q = q.eq('tipo', filtro.tipo)
  if (filtro.status) q = q.eq('status', filtro.status)
  if (filtro.prioridade) q = q.eq('prioridade', filtro.prioridade)
  if (filtro.responsavelId) q = q.eq('responsavel_id', filtro.responsavelId)
  if (filtro.eventoId) q = q.eq('evento_id', filtro.eventoId)
  if (filtro.origem) q = q.eq('origem_lead', filtro.origem)
  if (filtro.busca?.trim()) {
    /*
     * `.or()` recebe UMA string com as condições separadas por vírgula, então
     * uma vírgula ou um parêntese digitado na busca viraria sintaxe do
     * PostgREST e quebraria o filtro inteiro. Some com eles; `%` também, que
     * seria um curinga a mais dentro do curinga.
     */
    const termo = filtro.busca.trim().replace(/[,()%*]/g, ' ').trim()
    if (!termo) return []
    const alvo = `%${termo}%`
    q = q.or([
      `titulo.ilike.${alvo}`, `contato_nome.ilike.${alvo}`, `email.ilike.${alvo}`,
      `whatsapp.ilike.${alvo}`, `evento_previsto_nome.ilike.${alvo}`, `descricao.ilike.${alvo}`,
    ].join(','))
  }

  const { data, error } = await q.order('atualizado_em', { ascending: false }).limit(1000)
  if (error) throw new Error(`Não consegui carregar o Backlog: ${error.message}`)

  const itens = (data ?? []).map(l => montar(l as LinhaCrua))
  const visiveis = filtro.incluirEncerrados ? itens : itens.filter(i => !STATUS_ENCERRADOS.has(i.status))

  return visiveis.sort((a, b) => {
    const porPrioridade = ORDEM_PRIORIDADE[a.prioridade] - ORDEM_PRIORIDADE[b.prioridade]
    if (porPrioridade) return porPrioridade
    const dataA = dataQueCobra(a)
    const dataB = dataQueCobra(b)
    if (dataA && dataB) return dataA.localeCompare(dataB)
    if (dataA) return -1
    if (dataB) return 1
    return b.atualizadoEm.localeCompare(a.atualizadoEm)
  })
}

/** A data pela qual o item cobra atenção: prazo na tarefa, retorno no cliente. */
export function dataQueCobra(item: ItemBacklog): string | null {
  return item.tipo === 'tarefa' ? item.prazo : item.proximoContatoData
}

export async function itemDoBacklog(id: string): Promise<ItemBacklog | null> {
  const { data } = await supabaseAdmin.from('backlog_itens').select(SELECT_ITEM).eq('id', id).maybeSingle()
  return data ? montar(data as LinhaCrua) : null
}

export async function historicoDoItem(id: string): Promise<EntradaHistorico[]> {
  const { data, error } = await supabaseAdmin
    .from('backlog_historico')
    .select('id, acao, valor_anterior, valor_novo, criado_em, perfis:autor_id(nome)')
    .eq('item_id', id)
    .order('criado_em', { ascending: false })
  if (error) throw new Error(`Não consegui carregar o histórico: ${error.message}`)
  return (data ?? []).map(l => ({
    id: l.id as string,
    acao: l.acao as string,
    valorAnterior: (l.valor_anterior as string | null) ?? null,
    valorNovo: (l.valor_novo as string | null) ?? null,
    autorNome: nomeDaRelacao(l.perfis as LinhaCrua['perfis']),
    criadoEm: l.criado_em as string,
  }))
}

// ─── Próximos contatos e atrasos ─────────────────────────────────────────────

export type Cobranca = {
  item: ItemBacklog
  data: string
  /** Dias de atraso (positivo) ou de folga (negativo). 0 = hoje. */
  diasDeAtraso: number
}

/**
 * O que precisa de atenção, separado por urgência.
 *
 * Vale pros DOIS tipos: um cliente cobra pela data do próximo contato, uma
 * tarefa cobra pelo prazo. Eram duas listas no pedido ("Próximos contatos" e
 * "tarefas atrasadas") que respondem à mesma pergunta — "o que eu deixei
 * passar?" —, então saem do mesmo lugar, com a mesma régua.
 */
export function cobrancas(itens: ItemBacklog[], hoje = hojeBRT()) {
  const comData: Cobranca[] = itens
    .filter(i => !STATUS_ENCERRADOS.has(i.status))
    .map(i => ({ item: i, data: dataQueCobra(i) ?? '' }))
    .filter((c): c is { item: ItemBacklog; data: string } => !!c.data)
    .map(c => ({ ...c, diasDeAtraso: diasEntre(c.data, hoje) }))
    .sort((a, b) => a.data.localeCompare(b.data))

  return {
    atrasados: comData.filter(c => c.diasDeAtraso > 0),
    hoje: comData.filter(c => c.diasDeAtraso === 0),
    proximos: comData.filter(c => c.diasDeAtraso < 0),
  }
}

/** Dias entre duas datas `YYYY-MM-DD` — positivo quando `de` já passou de `ate`. */
function diasEntre(de: string, ate: string): number {
  const ms = Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)
  return Math.round(ms / 86_400_000)
}

// ─── Números do painel ───────────────────────────────────────────────────────

export type ResumoBacklog = {
  possiveisClientes: number
  novosLeads: number
  emNegociacao: number
  propostasEnviadas: number
  convertidos: number
  tarefasPendentes: number
  tarefasAtrasadas: number
  contatosHoje: number
  altaPrioridade: number
}

export function resumoBacklog(itens: ItemBacklog[], hoje = hojeBRT()): ResumoBacklog {
  const clientes = itens.filter(i => i.tipo === 'cliente')
  const tarefas = itens.filter(i => i.tipo === 'tarefa')
  const fila = cobrancas(itens, hoje)

  return {
    possiveisClientes: clientes.filter(i => !STATUS_ENCERRADOS.has(i.status)).length,
    novosLeads: clientes.filter(i => i.status === 'novo').length,
    emNegociacao: clientes.filter(i => i.status === 'em_negociacao').length,
    propostasEnviadas: clientes.filter(i => i.status === 'proposta_enviada').length,
    convertidos: clientes.filter(i => STATUS_GANHOS.has(i.status)).length,
    tarefasPendentes: tarefas.filter(i => !STATUS_ENCERRADOS.has(i.status)).length,
    tarefasAtrasadas: fila.atrasados.filter(c => c.item.tipo === 'tarefa').length,
    contatosHoje: fila.hoje.length,
    altaPrioridade: itens.filter(i => i.prioridade === 'alta' && !STATUS_ENCERRADOS.has(i.status)).length,
  }
}

// ─── Calendário ──────────────────────────────────────────────────────────────

export type CompromissoTipo = 'contato' | 'prazo' | 'evento_previsto' | 'evento'

export type Compromisso = {
  data: string
  tipo: CompromissoTipo
  titulo: string
  detalhe: string | null
  /** Pra onde o clique leva — item do Backlog ou evento de verdade. */
  itemId: string | null
  eventoId: string | null
  prioridade: Prioridade | null
}

/**
 * A agenda: tudo que tem data marcada, num lugar só.
 *
 * Quatro fontes, porque são quatro coisas diferentes que o Juan precisa ver
 * na mesma grade (pedido de 09/09/2026 — "quais são os próximos compromissos
 * e eventos relacionados ao hub"):
 *
 *   · contato          — o retorno combinado com um possível cliente
 *   · prazo            — o vencimento de uma tarefa
 *   · evento_previsto  — a data que o lead DISSE que vai acontecer (ainda não
 *                        existe como evento no sistema, é só uma intenção)
 *   · evento           — evento de verdade, já cadastrado em `eventos`
 *
 * Os três primeiros vêm do Backlog; o último vem da tabela de eventos, e é o
 * que costura o Backlog com a operação real: a mesma grade mostra "retornar
 * pro Luan Santana dia 20" e "Henrique e Juliano começa dia 05".
 */
export async function agendaDoBacklog(
  itens: ItemBacklog[], { de, ate }: { de: string; ate: string },
): Promise<Compromisso[]> {
  const dentro = (d: string | null): d is string => !!d && d >= de && d <= ate
  const compromissos: Compromisso[] = []

  for (const item of itens) {
    if (STATUS_ENCERRADOS.has(item.status)) continue

    if (item.tipo === 'cliente' && dentro(item.proximoContatoData)) {
      compromissos.push({
        data: item.proximoContatoData, tipo: 'contato',
        titulo: item.titulo,
        detalhe: item.contatoNome ? `Retornar para ${item.contatoNome}` : 'Retornar contato',
        itemId: item.id, eventoId: null, prioridade: item.prioridade,
      })
    }
    if (item.tipo === 'tarefa' && dentro(item.prazo)) {
      compromissos.push({
        data: item.prazo, tipo: 'prazo',
        titulo: item.titulo,
        detalhe: item.responsavelNome ? `Responsável: ${item.responsavelNome}` : 'Sem responsável',
        itemId: item.id, eventoId: null, prioridade: item.prioridade,
      })
    }
    if (dentro(item.dataEventoPrevista)) {
      compromissos.push({
        data: item.dataEventoPrevista, tipo: 'evento_previsto',
        titulo: item.eventoPrevistoNome || item.titulo,
        detalhe: `Previsto · ${item.titulo}`,
        itemId: item.id, eventoId: null, prioridade: item.prioridade,
      })
    }
  }

  const { data: eventos } = await supabaseAdmin
    .from('eventos')
    .select('id, nome, data_inicio, organizacoes(nome)')
    .gte('data_inicio', `${de}T00:00:00`)
    .lte('data_inicio', `${ate}T23:59:59`)
  for (const e of eventos ?? []) {
    const dia = String(e.data_inicio).slice(0, 10)
    compromissos.push({
      data: dia, tipo: 'evento',
      titulo: e.nome as string,
      detalhe: nomeDaRelacao(e.organizacoes as LinhaCrua['organizacoes']),
      itemId: null, eventoId: e.id as string, prioridade: null,
    })
  }

  return compromissos.sort((a, b) => a.data.localeCompare(b.data) || a.titulo.localeCompare(b.titulo))
}

// ─── Opções dos seletores ────────────────────────────────────────────────────

export async function opcoesDoBacklog() {
  const [responsaveis, eventos, organizacoes] = await Promise.all([
    /*
     * Só quem administra pode ser responsável. Não faz sentido atribuir "enviar
     * proposta pra Produtora XYZ" a um operador de portão — e a lista fica
     * curta o bastante pra escolher sem procurar.
     */
    supabaseAdmin.from('perfis').select('id, nome, role')
      .in('role', ['master', 'admin', 'gerente']).eq('ativo', true).order('nome'),
    supabaseAdmin.from('eventos').select('id, nome, data_inicio').order('data_inicio', { ascending: false }),
    supabaseAdmin.from('organizacoes').select('id, nome').order('nome'),
  ])
  return {
    responsaveis: (responsaveis.data ?? []).map(p => ({ id: p.id as string, nome: p.nome as string })),
    eventos: (eventos.data ?? []).map(e => ({ id: e.id as string, nome: e.nome as string })),
    organizacoes: (organizacoes.data ?? []).map(o => ({ id: o.id as string, nome: o.nome as string })),
  }
}
