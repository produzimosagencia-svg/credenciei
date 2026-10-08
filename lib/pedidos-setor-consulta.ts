import 'server-only'
import { supabaseAdmin } from './supabase-server'
import { diasDaEscalaDoEvento } from './escala'
import type { DiaDaEscala } from './escala-regras'
import { statusDoItemValido, type ContextoDoPedido, type Pessoa, type StatusDoItem } from './pedido-setor-regras'

/**
 * Pedido de setor — as LEITURAS das telas (fila do admin e página de acompanhamento do fornecedor).
 * As escritas moram em lib/actions-pedidos-setor.ts.
 *
 * Todas toleram a migração pendente (supabase/upgrade-pedidos-de-setor.sql): sem as tabelas devolvem
 * `null`/vazio, e a tela mostra o aviso em vez de quebrar.
 */

export type ItemDoPedido = {
  id: string
  nome: string
  subeventoId: string | null
  subeventoNome: string | null
  quantidade: number | null
  porDia: Record<string, number>
  supervisor: Pessoa
  /** Como o fornecedor enviou — não muda depois (serve para mostrar "pediu 10, aprovado 7"). */
  original: { nome?: string; quantidade?: number | null; porDia?: Record<string, number>; subeventoId?: string | null } | null
  status: StatusDoItem
  motivoNegacao: string | null
  decididoEm: string | null
  decididoPor: string | null
  fornecedorId: string | null
}

export type PedidoCompleto = {
  id: string
  token: string
  criadoEm: string
  contato: Pessoa
  observacao: string | null
  itens: ItemDoPedido[]
}

type LinhaItem = {
  id: string; ordem: number; nome: string; subevento_id: string | null; quantidade: number | null
  quantidade_por_dia: Record<string, number> | null; supervisor_nome: string; supervisor_cpf: string; supervisor_telefone: string
  original: ItemDoPedido['original']; status: string; motivo_negacao: string | null
  decidido_em: string | null; decidido_por: string | null; fornecedor_id: string | null
  subeventos: { nome: string } | null
}
type LinhaPedido = {
  id: string; token: string; criado_em: string; contato_nome: string; contato_cpf: string; contato_telefone: string
  observacao: string | null; pedidos_setor_itens: LinhaItem[] | null
}

const SELECT_PEDIDO =
  'id, token, criado_em, contato_nome, contato_cpf, contato_telefone, observacao, ' +
  'pedidos_setor_itens(id, ordem, nome, subevento_id, quantidade, quantidade_por_dia, supervisor_nome, supervisor_cpf, supervisor_telefone, original, status, motivo_negacao, decidido_em, decidido_por, fornecedor_id, subeventos(nome))'

async function paraPedidoCompleto(linhas: LinhaPedido[]): Promise<PedidoCompleto[]> {
  const decisores = [...new Set(linhas.flatMap(p => (p.pedidos_setor_itens ?? []).map(i => i.decidido_por)).filter((v): v is string => !!v))]
  const nomes = new Map<string, string>()
  if (decisores.length) {
    const { data } = await supabaseAdmin.from('perfis').select('id, nome').in('id', decisores)
    for (const p of data ?? []) nomes.set(p.id as string, p.nome as string)
  }
  return linhas.map(p => ({
    id: p.id,
    token: p.token,
    criadoEm: p.criado_em,
    contato: { nome: p.contato_nome, cpf: p.contato_cpf, telefone: p.contato_telefone },
    observacao: p.observacao,
    itens: [...(p.pedidos_setor_itens ?? [])].sort((a, b) => a.ordem - b.ordem).map(i => ({
      id: i.id,
      nome: i.nome,
      subeventoId: i.subevento_id,
      subeventoNome: i.subeventos?.nome ?? null,
      quantidade: i.quantidade,
      porDia: i.quantidade_por_dia ?? {},
      supervisor: { nome: i.supervisor_nome, cpf: i.supervisor_cpf, telefone: i.supervisor_telefone },
      original: i.original,
      status: statusDoItemValido(i.status),
      motivoNegacao: i.motivo_negacao,
      decididoEm: i.decidido_em,
      decididoPor: i.decidido_por ? (nomes.get(i.decidido_por) ?? null) : null,
      fornecedorId: i.fornecedor_id,
    })),
  }))
}

/** Os pedidos do evento, do mais novo para o mais antigo. `null` = a migração ainda não rodou. */
export async function pedidosDoEvento(eventoId: string): Promise<PedidoCompleto[] | null> {
  const { data, error } = await supabaseAdmin
    .from('pedidos_setor').select(SELECT_PEDIDO).eq('evento_id', eventoId).order('criado_em', { ascending: false }).limit(300)
  if (error) return null
  return paraPedidoCompleto((data ?? []) as unknown as LinhaPedido[])
}

/** O que a página PÚBLICA de acompanhamento mostra: nada de CPF nem telefone de ninguém. */
export type PedidoPublico = {
  eventoNome: string
  criadoEm: string
  contatoNome: string
  itens: { nome: string; subeventoNome: string | null; quantidade: number | null; porDia: Record<string, number>; status: StatusDoItem; motivoNegacao: string | null }[]
}

export async function pedidoPublicoPorToken(token: string): Promise<PedidoPublico | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null
  const { data, error } = await supabaseAdmin
    .from('pedidos_setor').select(`${SELECT_PEDIDO}, eventos(nome)`).eq('token', token).maybeSingle()
  if (error || !data) return null
  const linha = data as unknown as LinhaPedido & { eventos: { nome: string } | null }
  const [pedido] = await paraPedidoCompleto([linha])
  return {
    eventoNome: linha.eventos?.nome ?? '',
    criadoEm: pedido.criadoEm,
    contatoNome: pedido.contato.nome,
    itens: pedido.itens.map(i => ({
      nome: i.nome, subeventoNome: i.subeventoNome, quantidade: i.quantidade, porDia: i.porDia,
      status: i.status, motivoNegacao: i.motivoNegacao,
    })),
  }
}

/** Quantos pedidos esperam decisão em cada evento — setores novos e mais colaboradores (lista de eventos e card do evento). */
export async function pendentesPorEvento(eventoIds: string[]): Promise<Map<string, number>> {
  const contagem = new Map<string, number>()
  if (!eventoIds.length) return contagem
  // Setores novos e pedidos de mais colaboradores — os dois esperam a mesma pessoa.
  for (const tabela of ['pedidos_setor_itens', 'pedidos_ampliacao']) {
    const { data, error } = await supabaseAdmin
      .from(tabela).select('evento_id').eq('status', 'pendente').in('evento_id', eventoIds).limit(5000)
    if (error) continue
    for (const l of data ?? []) contagem.set(l.evento_id as string, (contagem.get(l.evento_id as string) ?? 0) + 1)
  }
  return contagem
}

/**
 * Os dias e os subeventos do evento — o que o formulário e a edição conferem, e o que a tela oferece.
 *
 * Dia só conta quando o evento tem MAIS de um: num evento de um dia só, "quantas pessoas por dia" seria a
 * mesma pergunta do total. Subevento só conta quando o evento usa e tem algum cadastrado.
 */
export async function contextoDoPedido(eventoId: string): Promise<{
  ctx: ContextoDoPedido
  diasComFase: DiaDaEscala[]
  subeventos: { id: string; nome: string }[]
}> {
  const [dias, { data: ev }, { data: subs }] = await Promise.all([
    diasDaEscalaDoEvento(eventoId).catch(() => [] as DiaDaEscala[]),
    supabaseAdmin.from('eventos').select('tem_subeventos').eq('id', eventoId).maybeSingle(),
    supabaseAdmin.from('subeventos').select('id, nome').eq('evento_id', eventoId).order('nome'),
  ])
  const usaSubeventos = (ev as { tem_subeventos?: boolean } | null)?.tem_subeventos === true
  const subeventos = (subs ?? []).map(x => ({ id: x.id as string, nome: x.nome as string }))
  const comDias = dias.length > 1
  return {
    ctx: { dias: comDias ? dias.map(d => d.data) : [], subeventoIds: usaSubeventos && subeventos.length ? subeventos.map(x => x.id) : null },
    diasComFase: comDias ? dias : [],
    subeventos: usaSubeventos ? subeventos : [],
  }
}

// ─── Pedidos de MAIS colaboradores ───────────────────────────────────────────

export type Ampliacao = {
  id: string
  fornecedorId: string
  setorNome: string
  subeventoNome: string | null
  solicitante: string
  quantidadeAtual: number | null
  cadastrados: number | null
  quantidadeDesejada: number
  motivo: string
  status: StatusDoItem
  quantidadeAprovada: number | null
  motivoNegacao: string | null
  criadoEm: string
  decididoEm: string | null
}

type LinhaAmpliacao = {
  id: string; fornecedor_id: string; solicitante_nome: string; quantidade_atual: number | null; cadastrados: number | null
  quantidade_desejada: number; motivo: string; status: string; quantidade_aprovada: number | null; motivo_negacao: string | null
  criado_em: string; decidido_em: string | null
  fornecedores: { nome: string; subeventos: { nome: string } | null } | null
}

const SELECT_AMPLIACAO = 'id, fornecedor_id, solicitante_nome, quantidade_atual, cadastrados, quantidade_desejada, motivo, status, quantidade_aprovada, motivo_negacao, criado_em, decidido_em, fornecedores(nome, subeventos(nome))'

const paraAmpliacao = (a: LinhaAmpliacao): Ampliacao => ({
  id: a.id,
  fornecedorId: a.fornecedor_id,
  setorNome: a.fornecedores?.nome ?? '',
  subeventoNome: a.fornecedores?.subeventos?.nome ?? null,
  solicitante: a.solicitante_nome,
  quantidadeAtual: a.quantidade_atual,
  cadastrados: a.cadastrados,
  quantidadeDesejada: a.quantidade_desejada,
  motivo: a.motivo,
  status: statusDoItemValido(a.status),
  quantidadeAprovada: a.quantidade_aprovada,
  motivoNegacao: a.motivo_negacao,
  criadoEm: a.criado_em,
  decididoEm: a.decidido_em,
})

/** Os pedidos de mais colaboradores do evento (fila do admin). `null` = a migração ainda não rodou. */
export async function ampliacoesDoEvento(eventoId: string): Promise<Ampliacao[] | null> {
  const { data, error } = await supabaseAdmin
    .from('pedidos_ampliacao').select(SELECT_AMPLIACAO).eq('evento_id', eventoId).order('criado_em', { ascending: false }).limit(300)
  if (error) return null
  return ((data ?? []) as unknown as LinhaAmpliacao[]).map(paraAmpliacao)
}

/** Os últimos pedidos de UM setor — o que o supervisor vê na tela dele. Erro = lista vazia. */
export async function ampliacoesDoSetor(fornecedorId: string): Promise<Ampliacao[]> {
  const { data, error } = await supabaseAdmin
    .from('pedidos_ampliacao').select(SELECT_AMPLIACAO).eq('fornecedor_id', fornecedorId).order('criado_em', { ascending: false }).limit(5)
  if (error) return []
  return ((data ?? []) as unknown as LinhaAmpliacao[]).map(paraAmpliacao)
}
