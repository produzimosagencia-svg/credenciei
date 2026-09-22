import { supabaseAdmin } from './supabase-server'
import { statusValido, type StatusOrcamento } from './orcamentos-constantes'

/**
 * Módulo Orçamentos — leitura.
 *
 * Quem escreve é lib/actions-orcamentos.ts. Nenhuma função aqui checa
 * permissão sozinha — a página checa `podeGerenciarOrcamentos` antes de
 * renderizar, e as actions checam de novo.
 */

export type ItemOrcamento = { id: string; descricao: string; valor: number; posicao: number }

export type Orcamento = {
  id: string
  numero: number
  nomeEvento: string
  responsavel: string
  telefone: string | null
  dataEvento: string | null
  valorDia: number
  valorFuncionario: number
  valorTecnico: number
  /** Multiplica valorDia/valorFuncionario/valorTecnico juntos. Itens adicionais não entram. */
  dias: number
  /** Abatido do subtotal (valores × dias + itens). Nunca deixa o total ficar negativo. */
  desconto: number
  /** Gravado no último save. Ver `orcamentoPorId` pro valor sempre correto. */
  valorTotal: number
  observacoes: string | null
  status: StatusOrcamento
  createdAt: string
  updatedAt: string
}

export type OrcamentoComItens = Orcamento & {
  itens: ItemOrcamento[]
  /** Recalculado a partir dos valores brutos + itens + dias − desconto. Nunca a coluna gravada. */
  valorTotalCalculado: number
}

const SELECT = `
  id, numero, nome_evento, responsavel, telefone, data_evento,
  valor_dia, valor_funcionario, valor_tecnico, dias, desconto, valor_total,
  observacoes, status, created_at, updated_at
`

type LinhaOrcamento = {
  id: string
  numero: number
  nome_evento: string
  responsavel: string
  telefone: string | null
  data_evento: string | null
  valor_dia: number | string
  valor_funcionario: number | string
  valor_tecnico: number | string
  dias: number | string
  desconto: number | string
  valor_total: number | string
  observacoes: string | null
  status: string
  created_at: string
  updated_at: string
}

function montar(l: LinhaOrcamento): Orcamento {
  return {
    id: l.id,
    numero: l.numero,
    nomeEvento: l.nome_evento,
    responsavel: l.responsavel,
    telefone: l.telefone,
    dataEvento: l.data_evento,
    valorDia: Number(l.valor_dia) || 0,
    valorFuncionario: Number(l.valor_funcionario) || 0,
    valorTecnico: Number(l.valor_tecnico) || 0,
    dias: Math.max(1, Number(l.dias) || 1),
    desconto: Number(l.desconto) || 0,
    valorTotal: Number(l.valor_total) || 0,
    observacoes: l.observacoes,
    status: statusValido(l.status),
    createdAt: l.created_at,
    updatedAt: l.updated_at,
  }
}

/** A listagem: mais recentes primeiro, usando a coluna `valor_total` gravada. */
export async function listarOrcamentos(): Promise<Orcamento[]> {
  const { data, error } = await supabaseAdmin
    .from('orcamentos')
    .select(SELECT)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return ((data ?? []) as LinhaOrcamento[]).map(montar)
}

/**
 * Um orçamento com os itens, pra editar/pré-visualizar/gerar o PDF.
 *
 * `valorTotalCalculado` é sempre recalculado aqui a partir dos valores
 * brutos + itens + dias − desconto — nunca confia na coluna `valor_total`
 * gravada (ver o cabeçalho de supabase/upgrade-orcamentos.sql).
 */
export async function orcamentoPorId(id: string): Promise<OrcamentoComItens | null> {
  const { data: linha, error } = await supabaseAdmin
    .from('orcamentos').select(SELECT).eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!linha) return null

  const { data: itensCrus, error: erroItens } = await supabaseAdmin
    .from('orcamento_itens')
    .select('id, descricao, valor, posicao')
    .eq('orcamento_id', id)
    .order('posicao', { ascending: true })
  if (erroItens) throw new Error(erroItens.message)

  const itens: ItemOrcamento[] = ((itensCrus ?? []) as { id: string; descricao: string; valor: number | string; posicao: number }[])
    .map(i => ({ id: i.id, descricao: i.descricao, valor: Number(i.valor) || 0, posicao: i.posicao }))

  const orcamento = montar(linha as LinhaOrcamento)
  const subtotal =
    (orcamento.valorDia + orcamento.valorFuncionario + orcamento.valorTecnico) * orcamento.dias
    + itens.reduce((soma, i) => soma + i.valor, 0)
  const valorTotalCalculado = Math.max(0, subtotal - orcamento.desconto)

  return { ...orcamento, itens, valorTotalCalculado }
}
