import { supabaseAdmin, buscarTudo, getPerfil } from './supabase-server'
import { diaBRT } from './janelas'
import { ehMaster, ehProdutor } from './permissions'
import { eventosQuePossoAbrir } from '@/app/admin/EscolherEvento'
import type { OrigemGasto, StatusGasto } from './gastos-constantes'
export { CATEGORIAS_GASTO, CATEGORIA_PADRAO } from './gastos-constantes'

/**
 * Módulo Gastos — leitura.
 *
 * Quem escreve é lib/actions-gastos.ts. Nenhuma função aqui checa permissão
 * sozinha — a página checa `podeRegistrarGastos` antes de renderizar, e as
 * actions checam de novo. O escopo de QUAIS eventos este perfil enxerga sai
 * de `eventosQuePossoAbrir` (app/admin/EscolherEvento.tsx), a mesma régua que
 * Avisos e Relatórios já usam.
 *
 * ─── HOJE É EM BRASÍLIA ──────────────────────────────────────────────────────
 *
 * `diaBRT()` (lib/janelas.ts, arquivo puro). O servidor roda em Washington —
 * "gastos de hoje" às 21h daqui apareceria vazio se dependesse do relógio de
 * lá.
 */

export type Gasto = {
  id: string
  eventoId: string
  eventoNome: string | null
  descricao: string
  valor: number
  fornecedor: string | null
  formaPagamento: string | null
  categoria: string
  dataGasto: string
  registradoEm: string
  origem: OrigemGasto
  status: StatusGasto
  observacao: string | null
  transcricao: string | null
  temComprovante: boolean
  comprovanteNome: string | null
  criadoPorNome: string | null
}

export type FiltroGastos = {
  eventoId?: string
  categoria?: string
  fornecedor?: string
  de?: string
  ate?: string
}

const SELECT = `
  id, evento_id, descricao, valor, fornecedor, forma_pagamento, categoria, data_gasto, registrado_em,
  origem, status, observacao, transcricao, comprovante_path, comprovante_nome,
  eventos:evento_id(nome), perfis:criado_por(nome)
`

type LinhaCrua = Record<string, unknown> & {
  eventos?: { nome?: string } | { nome?: string }[] | null
  perfis?: { nome?: string } | { nome?: string }[] | null
}

function nome(rel: LinhaCrua['eventos']): string | null {
  if (!rel) return null
  return (Array.isArray(rel) ? rel[0]?.nome : rel.nome) ?? null
}

function montar(l: LinhaCrua): Gasto {
  return {
    id: l.id as string,
    eventoId: l.evento_id as string,
    eventoNome: nome(l.eventos),
    descricao: l.descricao as string,
    valor: Number(l.valor) || 0,
    fornecedor: (l.fornecedor as string | null) ?? null,
    formaPagamento: (l.forma_pagamento as string | null) ?? null,
    categoria: l.categoria as string,
    dataGasto: l.data_gasto as string,
    registradoEm: l.registrado_em as string,
    origem: (l.origem as OrigemGasto) ?? 'manual',
    status: (l.status as StatusGasto) ?? 'confirmado',
    observacao: (l.observacao as string | null) ?? null,
    transcricao: (l.transcricao as string | null) ?? null,
    temComprovante: !!l.comprovante_path,
    comprovanteNome: (l.comprovante_nome as string | null) ?? null,
    criadoPorNome: nome(l.perfis),
  }
}

/** Os eventos que este perfil pode registrar gasto — só os ativos vêm primeiro. */
export async function eventosParaGastos() {
  const perfil = await getPerfil()

  // Produtor: só os eventos vinculados a ele em `produtor_eventos`.
  if (ehProdutor(perfil?.role)) {
    const { data } = await supabaseAdmin
      .from('produtor_eventos')
      .select('eventos(id, nome, ativo, data_inicio)')
      .eq('produtor_id', perfil!.id)
    return (data ?? [])
      .map(r => r.eventos as unknown as { id: string; nome: string; ativo: boolean; data_inicio: string } | null)
      .filter((e): e is { id: string; nome: string; ativo: boolean; data_inicio: string } => !!e)
      .sort((a, b) => (b.data_inicio ?? '').localeCompare(a.data_inicio ?? ''))
      .map(e => ({ id: e.id, nome: e.nome, ativo: e.ativo !== false }))
  }

  // Master (dando suporte) vê todos. Os demais caem na régua de sempre —
  // mas o item de menu já sumiu pra eles.
  if (ehMaster(perfil?.role)) {
    const { data } = await supabaseAdmin
      .from('eventos').select('id, nome, ativo').order('data_inicio', { ascending: false })
    return (data ?? []).map(e => ({ id: e.id as string, nome: e.nome as string, ativo: e.ativo !== false }))
  }

  const eventos = await eventosQuePossoAbrir()
  return eventos.map(e => ({ id: e.id, nome: e.nome, ativo: e.ativo }))
}

/**
 * Todos os gastos que casam com o filtro, do mais recente pro mais antigo.
 *
 * `buscarTudo` porque um evento grande pode passar de 1000 lançamentos com o
 * tempo, e o `.limit()` do PostgREST corta em silêncio nesse teto.
 */
export async function listarGastos(filtro: FiltroGastos = {}): Promise<Gasto[]> {
  const linhas = await buscarTudo<LinhaCrua>((de, ate) => {
    let q = supabaseAdmin.from('gastos_evento').select(SELECT).order('data_gasto', { ascending: false }).order('registrado_em', { ascending: false })
    if (filtro.eventoId) q = q.eq('evento_id', filtro.eventoId)
    if (filtro.categoria) q = q.eq('categoria', filtro.categoria)
    if (filtro.fornecedor) q = q.eq('fornecedor', filtro.fornecedor)
    if (filtro.de) q = q.gte('data_gasto', filtro.de)
    if (filtro.ate) q = q.lte('data_gasto', filtro.ate)
    return q.range(de, ate)
  })
  return linhas.map(montar)
}

export async function gastoPorId(id: string): Promise<Gasto | null> {
  const { data } = await supabaseAdmin.from('gastos_evento').select(SELECT).eq('id', id).maybeSingle()
  return data ? montar(data as LinhaCrua) : null
}

/**
 * Total gasto por evento — pros eventos que a lista recebe. Uma consulta só
 * (evento_id + valor) e soma em memória.
 */
export async function totaisPorEvento(
  eventos: { id: string; nome: string }[],
): Promise<{ id: string; nome: string; total: number }[]> {
  if (!eventos.length) return []
  const ids = eventos.map(e => e.id)
  const linhas = await buscarTudo<{ evento_id: string; valor: number | null }>((de, ate) =>
    supabaseAdmin.from('gastos_evento').select('evento_id, valor').in('evento_id', ids).range(de, ate),
  )
  const soma = new Map<string, number>()
  for (const l of linhas) soma.set(l.evento_id, (soma.get(l.evento_id) ?? 0) + (Number(l.valor) || 0))
  return eventos
    .map(e => ({ id: e.id, nome: e.nome, total: soma.get(e.id) ?? 0 }))
    .sort((a, b) => b.total - a.total)
}

/** Fornecedores já usados neste recorte — alimenta o filtro da lista. */
export function fornecedoresDe(gastos: Gasto[]): string[] {
  return [...new Set(gastos.map(g => g.fornecedor).filter((f): f is string => !!f))].sort((a, b) => a.localeCompare(b))
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

export type KpisGastos = {
  total: number
  quantidade: number
  maior: number
  medio: number
  hoje: number
  ultimos7: number
  mes: number
}

/** Todos os 7 números do pedido, de uma passada só na lista já carregada. */
export function kpisDeGastos(gastos: Gasto[], hoje = diaBRT()): KpisGastos {
  const total = gastos.reduce((s, g) => s + g.valor, 0)
  const seteDiasAtras = somarDias(hoje, -6)
  const mes = hoje.slice(0, 7)
  return {
    total,
    quantidade: gastos.length,
    maior: gastos.reduce((m, g) => Math.max(m, g.valor), 0),
    medio: gastos.length ? total / gastos.length : 0,
    hoje: gastos.filter(g => g.dataGasto === hoje).reduce((s, g) => s + g.valor, 0),
    ultimos7: gastos.filter(g => g.dataGasto >= seteDiasAtras && g.dataGasto <= hoje).reduce((s, g) => s + g.valor, 0),
    mes: gastos.filter(g => g.dataGasto.startsWith(mes)).reduce((s, g) => s + g.valor, 0),
  }
}

/** `YYYY-MM-DD` + n dias, em UTC (data pura não tem fuso). */
function somarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// ─── Séries dos gráficos ─────────────────────────────────────────────────────

export type DadosGraficos = {
  porCategoria: { categoria: string; total: number }[]
  porDia: { dia: string; total: number }[]
  porFornecedor: { fornecedor: string; total: number }[]
  acumulado: { dia: string; total: number }[]
  distribuicao: { categoria: string; total: number }[]
}

export function dadosDosGraficos(gastos: Gasto[]): DadosGraficos {
  const soma = <K extends string>(chave: (g: Gasto) => K) => {
    const m = new Map<K, number>()
    for (const g of gastos) m.set(chave(g), (m.get(chave(g)) ?? 0) + g.valor)
    return m
  }

  const porCategoria = [...soma(g => g.categoria).entries()]
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total)

  const porFornecedor = [...soma(g => g.fornecedor ?? '—').entries()]
    .map(([fornecedor, total]) => ({ fornecedor, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)

  const porDiaMap = soma(g => g.dataGasto)
  const diasOrdenados = [...porDiaMap.keys()].sort()
  const porDia = diasOrdenados.map(dia => ({ dia, total: porDiaMap.get(dia)! }))

  let corrida = 0
  const acumulado = porDia.map(({ dia, total }) => {
    corrida += total
    return { dia, total: corrida }
  })

  return { porCategoria, porDia, porFornecedor, acumulado, distribuicao: porCategoria }
}
