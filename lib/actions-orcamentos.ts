'use server'
import { revalidatePath } from 'next/cache'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { podeGerenciarOrcamentos } from './permissions'
import { mensagemAmigavel } from './erros'
import { statusValido } from './orcamentos-constantes'
import { orcamentoPorId } from './orcamentos'

/**
 * Escrita no módulo Orçamentos.
 *
 * TODA AÇÃO DEVOLVE `{ ok }` / `{ ok: false, erro }`, NENHUMA LANÇA. Em
 * produção o Next mascara qualquer exceção que sai de uma Server Action — o
 * navegador recebe "An error occurred in the Server Components render…" e a
 * mensagem escrita se perde (mesma lição de lib/actions-gastos.ts e
 * lib/actions-backlog.ts). Nada de `export type { X }` neste arquivo —
 * re-export de tipo em módulo `'use server'` mata o módulo inteiro.
 *
 * As funções recebem objetos tipados, não `FormData`: o orçamento carrega um
 * array de itens montado no cliente (adicionar/remover linha antes de
 * salvar), e `FormData` não serializa bem um array dinâmico. Chamar a Server
 * Action como função direto do client component resolve isso sem gambiarra.
 */

export type Resultado<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { id?: string } : { dados: T }))
  | { ok: false; erro: string }

const SEM_ACESSO = 'Você não tem acesso a Orçamentos. Fale com o master.'

async function exigirOrcamentos() {
  const perfil = await getPerfil()
  if (!perfil || !podeGerenciarOrcamentos(perfil)) return null
  return perfil
}

export type ItemOrcamentoInput = { descricao: string; valor: number }

export type OrcamentoInput = {
  nomeEvento: string
  responsavel: string
  telefone: string | null
  dataEvento: string | null
  valorDia: number
  valorFuncionario: number
  valorTecnico: number
  observacoes: string | null
  status: string
  itens: ItemOrcamentoInput[]
}

function validar(dados: OrcamentoInput) {
  const nomeEvento = dados.nomeEvento.trim()
  if (!nomeEvento) throw new Error('Informe o nome do evento.')
  const responsavel = dados.responsavel.trim()
  if (!responsavel) throw new Error('Informe o responsável.')
  const telefone = (dados.telefone ?? '').trim() || null
  if (!telefone) throw new Error('Informe o telefone.')
  const dataEvento = (dados.dataEvento ?? '').trim() || null
  if (!dataEvento) throw new Error('Informe a data do evento.')

  const valorDia = Number(dados.valorDia) || 0
  const valorFuncionario = Number(dados.valorFuncionario) || 0
  const valorTecnico = Number(dados.valorTecnico) || 0
  if (valorDia < 0 || valorFuncionario < 0 || valorTecnico < 0) {
    throw new Error('Os valores não podem ser negativos.')
  }

  const itens = dados.itens
    .map(i => ({ descricao: i.descricao.trim(), valor: Number(i.valor) || 0 }))
    .filter(i => i.descricao && i.valor > 0)

  const valorTotal = valorDia + valorFuncionario + valorTecnico + itens.reduce((s, i) => s + i.valor, 0)

  return {
    nomeEvento, responsavel, telefone, dataEvento,
    valorDia, valorFuncionario, valorTecnico, valorTotal,
    observacoes: (dados.observacoes ?? '').trim() || null,
    status: statusValido(dados.status),
    itens,
  }
}

async function gravarItens(orcamentoId: string, itens: { descricao: string; valor: number }[]) {
  if (!itens.length) return
  const { error } = await supabaseAdmin.from('orcamento_itens').insert(
    itens.map((item, posicao) => ({ orcamento_id: orcamentoId, descricao: item.descricao, valor: item.valor, posicao })),
  )
  if (error) throw new Error(`Não consegui salvar os itens: ${error.message}`)
}

// ─── Criar ───────────────────────────────────────────────────────────────────

export async function criarOrcamento(dados: OrcamentoInput): Promise<Resultado> {
  try {
    const perfil = await exigirOrcamentos()
    if (!perfil) return { ok: false, erro: SEM_ACESSO }

    const campos = validar(dados)
    const { data, error } = await supabaseAdmin.from('orcamentos').insert({
      nome_evento: campos.nomeEvento,
      responsavel: campos.responsavel,
      telefone: campos.telefone,
      data_evento: campos.dataEvento,
      valor_dia: campos.valorDia,
      valor_funcionario: campos.valorFuncionario,
      valor_tecnico: campos.valorTecnico,
      valor_total: campos.valorTotal,
      observacoes: campos.observacoes,
      status: campos.status,
      created_by: perfil.id,
    }).select('id').single()
    if (error) {
      console.error('[orcamentos] insert recusado', { erro: error.message, codigo: error.code })
      return { ok: false, erro: `Não consegui salvar: ${error.message}` }
    }

    await gravarItens(data.id as string, campos.itens)

    revalidatePath('/admin/orcamentos')
    return { ok: true, id: data.id as string }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

// ─── Editar ──────────────────────────────────────────────────────────────────

export async function editarOrcamento(id: string, dados: OrcamentoInput): Promise<Resultado> {
  try {
    const perfil = await exigirOrcamentos()
    if (!perfil) return { ok: false, erro: SEM_ACESSO }

    const { data: atual } = await supabaseAdmin.from('orcamentos').select('id').eq('id', id).maybeSingle()
    if (!atual) return { ok: false, erro: 'Este orçamento não existe mais.' }

    const campos = validar(dados)
    const { error } = await supabaseAdmin.from('orcamentos').update({
      nome_evento: campos.nomeEvento,
      responsavel: campos.responsavel,
      telefone: campos.telefone,
      data_evento: campos.dataEvento,
      valor_dia: campos.valorDia,
      valor_funcionario: campos.valorFuncionario,
      valor_tecnico: campos.valorTecnico,
      valor_total: campos.valorTotal,
      observacoes: campos.observacoes,
      status: campos.status,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) {
      console.error('[orcamentos] update recusado', { erro: error.message, codigo: error.code })
      return { ok: false, erro: `Não consegui salvar: ${error.message}` }
    }

    // Itens não têm identidade própria fora do orçamento — apagar e regravar
    // é mais simples e seguro que diff item a item.
    const { error: erroDelete } = await supabaseAdmin.from('orcamento_itens').delete().eq('orcamento_id', id)
    if (erroDelete) return { ok: false, erro: `Não consegui atualizar os itens: ${erroDelete.message}` }
    await gravarItens(id, campos.itens)

    revalidatePath('/admin/orcamentos')
    return { ok: true, id }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

// ─── Excluir ─────────────────────────────────────────────────────────────────

export async function excluirOrcamento(id: string): Promise<Resultado> {
  try {
    const perfil = await exigirOrcamentos()
    if (!perfil) return { ok: false, erro: SEM_ACESSO }

    const { error } = await supabaseAdmin.from('orcamentos').delete().eq('id', id)
    if (error) return { ok: false, erro: `Não consegui excluir: ${error.message}` }

    revalidatePath('/admin/orcamentos')
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

// ─── Duplicar ────────────────────────────────────────────────────────────────

/** Copia orçamento + itens com status `rascunho` e numeração nova. */
export async function duplicarOrcamento(id: string): Promise<Resultado> {
  try {
    const perfil = await exigirOrcamentos()
    if (!perfil) return { ok: false, erro: SEM_ACESSO }

    const original = await orcamentoPorId(id)
    if (!original) return { ok: false, erro: 'Este orçamento não existe mais.' }

    const { data, error } = await supabaseAdmin.from('orcamentos').insert({
      // `numero` fica de fora de propósito — pega o próximo da sequence.
      nome_evento: original.nomeEvento,
      responsavel: original.responsavel,
      telefone: original.telefone,
      data_evento: original.dataEvento,
      valor_dia: original.valorDia,
      valor_funcionario: original.valorFuncionario,
      valor_tecnico: original.valorTecnico,
      valor_total: original.valorTotalCalculado,
      observacoes: original.observacoes,
      status: 'rascunho',
      created_by: perfil.id,
    }).select('id').single()
    if (error) return { ok: false, erro: `Não consegui duplicar: ${error.message}` }

    await gravarItens(data.id as string, original.itens.map(i => ({ descricao: i.descricao, valor: i.valor })))

    revalidatePath('/admin/orcamentos')
    return { ok: true, id: data.id as string }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}
