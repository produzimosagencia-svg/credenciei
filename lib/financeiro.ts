import { supabaseAdmin } from './supabase-server'
import { EVENTO_INTERNO } from './financeiro-categorias'
export { CATEGORIAS_CUSTO, type CategoriaCusto, EVENTO_INTERNO } from './financeiro-categorias'

/**
 * O módulo Financeiro — faturamento, custos e lucro por evento.
 *
 * Leitura pura, sem `'use server'`: quem muda dado é `lib/actions-financeiro.ts`.
 * Nenhuma função aqui checa `ehMaster` sozinha — MAS toda página que as chama
 * checa antes de renderizar (ver `app/admin/financeiro/page.tsx` e
 * `app/admin/eventos/[id]/financeiro/page.tsx`), e as mutações em
 * `lib/actions-financeiro.ts` checam de novo, cada uma, porque uma Server
 * Action pode ser chamada direto — a tela que a esconde não é a barreira.
 *
 * ─── VOCABULÁRIO: A TELA NÃO FALA COMO O CÓDIGO ─────────────────────────────
 *
 * Na interface, desde 09/09/2026 (pedido do Juan), o que a gente cobra do
 * cliente chama RECEITA e o que a gente gasta chama DESPESA. No código e no
 * banco os nomes continuam `faturamento` e `custo`/`custos_evento` — renomear
 * coluna, campo de formulário e Server Action pra trocar um rótulo de tela
 * seria uma migração de banco e um churn de dezenas de arquivos sem ganhar
 * nada pra quem usa. A tradução mora nos rótulos JSX das telas de Financeiro,
 * e só lá.
 */

export type Custo = {
  id: string
  /** `null` = despesa interna, não pertence a evento nenhum. */
  eventoId: string | null
  descricao: string
  categoria: string
  valor: number
  data: string
  observacao: string | null
  temComprovante: boolean
  criadoPorNome: string | null
  criadoEm: string
}

export type FinanceiroDoEvento = {
  eventoId: string
  eventoNome: string
  faturamento: number
  temNfe: boolean
  nfeNome: string | null
  custoTotal: number
  lucro: number
  /** Percentual — `null` quando não há faturamento pra calcular margem sobre. */
  margem: number | null
  custos: Custo[]
  custosPorCategoria: { categoria: string; total: number }[]
}

/** Linha crua de `custos_evento`, com o nome de quem criou já resolvido. */
type LinhaCusto = {
  id: string; evento_id: string | null; descricao: string; categoria: string; valor: number
  data: string; observacao: string | null; comprovante_path: string | null
  criado_em: string; perfis: { nome: string } | { nome: string }[] | null
}

function nomeDoCriador(p: LinhaCusto['perfis']): string | null {
  if (!p) return null
  return Array.isArray(p) ? p[0]?.nome ?? null : p.nome
}

/**
 * O financeiro de UM evento — faturamento, custos, lucro. É o que monta
 * `/admin/eventos/[id]/financeiro`.
 *
 * `financeiro_eventos` pode não ter linha ainda (nasce só quando o master
 * salva o faturamento pela primeira vez) — sem linha, faturamento é 0 e o
 * evento aparece com "lucro" igual ao custo total negativo, o que é
 * matematicamente certo: sem faturamento lançado, todo custo já lançado é
 * prejuízo até alguém preencher a receita.
 */
export async function financeiroDoEvento(eventoId: string): Promise<FinanceiroDoEvento | null> {
  const [{ data: evento }, { data: fin }, { data: custosRaw }] = await Promise.all([
    supabaseAdmin.from('eventos').select('id, nome').eq('id', eventoId).maybeSingle(),
    supabaseAdmin.from('financeiro_eventos').select('faturamento, nfe_path, nfe_nome').eq('evento_id', eventoId).maybeSingle(),
    supabaseAdmin
      .from('custos_evento')
      .select('id, evento_id, descricao, categoria, valor, data, observacao, comprovante_path, criado_em, perfis(nome)')
      .eq('evento_id', eventoId)
      .order('data', { ascending: false })
      .returns<LinhaCusto[]>(),
  ])
  if (!evento) return null

  const custos: Custo[] = (custosRaw ?? []).map(c => ({
    id: c.id,
    eventoId: c.evento_id,
    descricao: c.descricao,
    categoria: c.categoria,
    valor: Number(c.valor) || 0,
    data: c.data,
    observacao: c.observacao,
    temComprovante: !!c.comprovante_path,
    criadoPorNome: nomeDoCriador(c.perfis),
    criadoEm: c.criado_em,
  }))

  const faturamento = Number(fin?.faturamento) || 0
  const custoTotal = custos.reduce((soma, c) => soma + c.valor, 0)

  const porCategoriaMapa = new Map<string, number>()
  for (const c of custos) porCategoriaMapa.set(c.categoria, (porCategoriaMapa.get(c.categoria) ?? 0) + c.valor)

  return {
    eventoId,
    eventoNome: evento.nome as string,
    faturamento,
    temNfe: !!fin?.nfe_path,
    nfeNome: (fin?.nfe_nome as string | null) ?? null,
    custoTotal,
    lucro: faturamento - custoTotal,
    margem: faturamento > 0 ? ((faturamento - custoTotal) / faturamento) * 100 : null,
    custos,
    custosPorCategoria: [...porCategoriaMapa.entries()]
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total),
  }
}

export type FinanceiroInterno = {
  custoTotal: number
  custos: Custo[]
  custosPorCategoria: { categoria: string; total: number }[]
}

/**
 * As despesas internas — salário da equipe da agência, serviço contratado
 * pra empresa, nada que pertença a um evento (Juan, 09/09/2026). É o que
 * monta o painel "Despesas internas" no dashboard.
 *
 * Sem faturamento nem lucro aqui: despesa interna não tem receita própria
 * pra comparar — o lucro que ela afeta é o da operação inteira, que já
 * aparece nos KPIs do dashboard.
 */
export async function financeiroInterno(): Promise<FinanceiroInterno> {
  const { data: custosRaw } = await supabaseAdmin
    .from('custos_evento')
    .select('id, evento_id, descricao, categoria, valor, data, observacao, comprovante_path, criado_em, perfis(nome)')
    .is('evento_id', null)
    .order('data', { ascending: false })
    .returns<LinhaCusto[]>()

  const custos: Custo[] = (custosRaw ?? []).map(c => ({
    id: c.id,
    eventoId: null,
    descricao: c.descricao,
    categoria: c.categoria,
    valor: Number(c.valor) || 0,
    data: c.data,
    observacao: c.observacao,
    temComprovante: !!c.comprovante_path,
    criadoPorNome: nomeDoCriador(c.perfis),
    criadoEm: c.criado_em,
  }))

  const porCategoriaMapa = new Map<string, number>()
  for (const c of custos) porCategoriaMapa.set(c.categoria, (porCategoriaMapa.get(c.categoria) ?? 0) + c.valor)

  return {
    custoTotal: custos.reduce((soma, c) => soma + c.valor, 0),
    custos,
    custosPorCategoria: [...porCategoriaMapa.entries()]
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total),
  }
}

/** A lista de eventos pro filtro do dashboard — todos, mais recente primeiro. */
export async function eventosParaFiltro(): Promise<{ id: string; nome: string; dataInicio: string | null }[]> {
  const { data } = await supabaseAdmin
    .from('eventos').select('id, nome, data_inicio').order('data_inicio', { ascending: false })
  return (data ?? []).map(e => ({
    id: e.id as string,
    nome: e.nome as string,
    dataInicio: (e.data_inicio as string | null) ?? null,
  }))
}

export type FiltroDashboard = {
  de?: string
  ate?: string
  /** Um id de evento real, `EVENTO_INTERNO`, ou `undefined` (tudo). */
  eventoId?: string
  categoria?: string
}

export type DashboardFinanceiro = {
  kpis: {
    faturamentoTotal: number
    lucroTotal: number
    custosTotal: number
    /** Percentual — `null` sem faturamento no recorte. */
    margem: number | null
    gastosWhatsApp: number
    gastosFuncionarios: number
    outrosGastos: number
    quantidadeEventos: number
    ticketMedio: number
  }
  porEvento: { evento: string; eventoId: string; faturamento: number; custos: number; lucro: number }[]
  evolucao: { periodo: string; faturamento: number; custos: number; lucro: number }[]
  porCategoria: { categoria: string; total: number }[]
}

const zerado: DashboardFinanceiro = {
  kpis: {
    faturamentoTotal: 0, lucroTotal: 0, custosTotal: 0, margem: null,
    gastosWhatsApp: 0, gastosFuncionarios: 0, outrosGastos: 0,
    quantidadeEventos: 0, ticketMedio: 0,
  },
  porEvento: [], evolucao: [], porCategoria: [],
}

/**
 * O dashboard financeiro — os KPIs e os dados dos três gráficos, tudo com o
 * mesmo recorte de filtro (o pedido do Juan: "ao alterar os filtros, todos
 * os KPIs e gráficos devem ser atualizados").
 *
 * PERÍODO FILTRA DUAS COISAS DIFERENTES, DE PROPÓSITO: quais EVENTOS entram
 * (pela data de início dele — é o que decide se o faturamento do evento
 * conta) e quais CUSTOS entram (pela data própria de cada custo — um custo
 * pago depois do evento, tipo uma fatura de fornecedor que chegou na
 * semana seguinte, tem a SUA PRÓPRIA data, e o período tem que respeitar
 * ela também). Os dois filtros rodam em paralelo, cada um na tabela certa.
 */
export async function dashboardFinanceiro(filtro: FiltroDashboard): Promise<DashboardFinanceiro> {
  const apenasInterno = filtro.eventoId === EVENTO_INTERNO
  const eventoEspecifico = filtro.eventoId && !apenasInterno ? filtro.eventoId : undefined

  /*
   * Eventos entram no recorte só quando NÃO se pediu "só interno" — despesa
   * interna não pertence a evento nenhum, não há o que buscar aqui.
   */
  let eventos: { id: string; nome: string; data_inicio: string | null }[] = []
  if (!apenasInterno) {
    let consultaEventos = supabaseAdmin.from('eventos').select('id, nome, data_inicio')
    if (filtro.de) consultaEventos = consultaEventos.gte('data_inicio', filtro.de)
    if (filtro.ate) consultaEventos = consultaEventos.lte('data_inicio', filtro.ate)
    if (eventoEspecifico) consultaEventos = consultaEventos.eq('id', eventoEspecifico)
    const { data } = await consultaEventos
    eventos = (data ?? []) as typeof eventos
  }
  if (!apenasInterno && !eventos.length) return zerado

  const eventoIds = eventos.map(e => e.id)
  const dataPorEvento = new Map(eventos.map(e => [e.id, e.data_inicio]))

  /*
   * Duas consultas de custo, não uma: a interna não tem evento pra casar
   * contra `eventoIds`, então usa `.is('evento_id', null)` sozinha, com
   * filtro só de data e categoria — sem o "evento também precisa estar no
   * período" que vale pro resto (ver o comentário da função). Só entra
   * quando faz sentido: pedida explicitamente (`apenasInterno`) ou vendo
   * tudo junto (sem filtro de evento nenhum).
   */
  let buscaEventoLigado = !apenasInterno && eventoIds.length
    ? supabaseAdmin.from('custos_evento').select('evento_id, categoria, valor, data').in('evento_id', eventoIds)
    : null
  if (buscaEventoLigado) {
    if (filtro.de) buscaEventoLigado = buscaEventoLigado.gte('data', filtro.de)
    if (filtro.ate) buscaEventoLigado = buscaEventoLigado.lte('data', filtro.ate)
    if (filtro.categoria) buscaEventoLigado = buscaEventoLigado.eq('categoria', filtro.categoria)
  }

  let buscaInterno = apenasInterno || !filtro.eventoId
    ? supabaseAdmin.from('custos_evento').select('evento_id, categoria, valor, data').is('evento_id', null)
    : null
  if (buscaInterno) {
    if (filtro.de) buscaInterno = buscaInterno.gte('data', filtro.de)
    if (filtro.ate) buscaInterno = buscaInterno.lte('data', filtro.ate)
    if (filtro.categoria) buscaInterno = buscaInterno.eq('categoria', filtro.categoria)
  }

  const [financeirosRes, ligadoRes, internoRes] = await Promise.all([
    eventoIds.length
      ? supabaseAdmin.from('financeiro_eventos').select('evento_id, faturamento').in('evento_id', eventoIds)
      : Promise.resolve({ data: [] as { evento_id: string; faturamento: number }[] }),
    buscaEventoLigado ?? Promise.resolve({ data: [] as { evento_id: string | null; categoria: string; valor: number; data: string }[] }),
    buscaInterno ?? Promise.resolve({ data: [] as { evento_id: string | null; categoria: string; valor: number; data: string }[] }),
  ])
  const custos = [...(ligadoRes.data ?? []), ...(internoRes.data ?? [])]

  const faturamentoPorEvento = new Map((financeirosRes.data ?? []).map(f => [f.evento_id as string, Number(f.faturamento) || 0]))

  // Custos SÓ contam pro evento se a categoria escolhida bater — mas o
  // faturamento do evento conta de qualquer forma (categoria é atributo de
  // custo, não existe "faturamento da categoria X"). Por isso, quando há
  // filtro de categoria, o faturamento não pode ser zerado — só os custos.
  const custosPorEvento = new Map<string, number>()
  const porCategoriaMapa = new Map<string, number>()
  let custosTotal = 0
  let custoInterno = 0
  let gastosWhatsApp = 0
  let gastosFuncionarios = 0
  for (const c of custos) {
    const valor = Number(c.valor) || 0
    const eventoId = c.evento_id as string | null
    if (eventoId) custosPorEvento.set(eventoId, (custosPorEvento.get(eventoId) ?? 0) + valor)
    else custoInterno += valor
    porCategoriaMapa.set(c.categoria as string, (porCategoriaMapa.get(c.categoria as string) ?? 0) + valor)
    custosTotal += valor
    if (c.categoria === 'WhatsApp / disparos de mensagens') gastosWhatsApp += valor
    if (c.categoria === 'Funcionários') gastosFuncionarios += valor
  }

  /*
   * "Quantidade de eventos" e o faturamento total contam só quem tem
   * faturamento LANÇADO — filtrar por categoria de custo não pode fazer um
   * evento inteiro (com faturamento cadastrado) sumir do total só porque,
   * dentro dele, não há custo daquela categoria. Despesa interna não é
   * evento — não entra nesta contagem.
   */
  const comFaturamento = eventos.filter(e => faturamentoPorEvento.has(e.id) || custosPorEvento.has(e.id))

  const faturamentoTotal = comFaturamento.reduce((s, e) => s + (faturamentoPorEvento.get(e.id) ?? 0), 0)
  const quantidadeEventos = comFaturamento.length
  const lucroTotal = faturamentoTotal - custosTotal

  const porEvento = comFaturamento
    .map(e => ({
      evento: e.nome,
      eventoId: e.id,
      faturamento: faturamentoPorEvento.get(e.id) ?? 0,
      custos: custosPorEvento.get(e.id) ?? 0,
      lucro: (faturamentoPorEvento.get(e.id) ?? 0) - (custosPorEvento.get(e.id) ?? 0),
    }))
    .sort((a, b) => (dataPorEvento.get(a.eventoId) ?? '').localeCompare(dataPorEvento.get(b.eventoId) ?? ''))
  // "Despesas internas" entra como se fosse mais um evento no gráfico — é a
  // leitura mais direta pra quem está olhando "custo por evento" e precisa
  // ver que uma fatia não é de evento nenhum.
  if (custoInterno > 0) {
    porEvento.push({ evento: 'Despesas internas', eventoId: EVENTO_INTERNO, faturamento: 0, custos: custoInterno, lucro: -custoInterno })
  }

  /*
   * Evolução por mês — agrupa pela data do EVENTO pro faturamento, e pela
   * data do CUSTO pro custo (interno incluso, pela própria data dele), cada
   * um no mês que é dele de verdade.
   */
  const porMes = new Map<string, { faturamento: number; custos: number }>()
  const mesDe = (iso: string) => iso.slice(0, 7) // "2026-09"
  for (const e of comFaturamento) {
    const dataInicio = dataPorEvento.get(e.id)
    if (!dataInicio) continue
    const mes = mesDe(dataInicio)
    const atual = porMes.get(mes) ?? { faturamento: 0, custos: 0 }
    atual.faturamento += faturamentoPorEvento.get(e.id) ?? 0
    porMes.set(mes, atual)
  }
  for (const c of custos) {
    const mes = mesDe(c.data as string)
    const atual = porMes.get(mes) ?? { faturamento: 0, custos: 0 }
    atual.custos += Number(c.valor) || 0
    porMes.set(mes, atual)
  }
  const evolucao = [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, v]) => ({
      periodo: rotuloMes(mes),
      faturamento: v.faturamento,
      custos: v.custos,
      lucro: v.faturamento - v.custos,
    }))

  const porCategoria = [...porCategoriaMapa.entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total)

  return {
    kpis: {
      faturamentoTotal,
      lucroTotal,
      custosTotal,
      margem: faturamentoTotal > 0 ? (lucroTotal / faturamentoTotal) * 100 : null,
      gastosWhatsApp,
      gastosFuncionarios,
      outrosGastos: Math.max(0, custosTotal - gastosWhatsApp - gastosFuncionarios),
      quantidadeEventos,
      ticketMedio: quantidadeEventos > 0 ? faturamentoTotal / quantidadeEventos : 0,
    },
    porEvento,
    evolucao,
    porCategoria,
  }
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** "2026-09" → "set/26". */
function rotuloMes(chave: string): string {
  const [ano, mes] = chave.split('-')
  return `${MESES[Number(mes) - 1] ?? mes}/${ano.slice(2)}`
}
