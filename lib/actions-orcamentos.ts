'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { getPerfil, supabaseAdmin } from './supabase-server'
import { registrarAuditoria } from './auditoria'
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
  /** Multiplica valorDia/valorFuncionario/valorTecnico juntos (evento de N dias). */
  dias: number
  /** Abatido do subtotal. Nunca deixa o total ficar negativo (limitado ao subtotal). */
  desconto: number
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
  const dias = Math.max(1, Math.round(Number(dados.dias) || 1))

  const itens = dados.itens
    .map(i => ({ descricao: i.descricao.trim(), valor: Number(i.valor) || 0 }))
    .filter(i => i.descricao && i.valor > 0)

  const subtotal = (valorDia + valorFuncionario + valorTecnico) * dias + itens.reduce((s, i) => s + i.valor, 0)
  // Nunca deixa o desconto virar o total negativo — o máximo que se pode
  // descontar é o próprio subtotal (orçamento de graça, no limite).
  const desconto = Math.min(Math.max(0, Number(dados.desconto) || 0), subtotal)
  const valorTotal = subtotal - desconto

  return {
    nomeEvento, responsavel, telefone, dataEvento,
    valorDia, valorFuncionario, valorTecnico, dias, desconto, valorTotal,
    observacoes: (dados.observacoes ?? '').trim() || null,
    status: statusValido(dados.status),
    itens,
  }
}

/** "Nº 12 · Festa X — R$ 1.234,56", curto, para a auditoria. Módulo interno do master: sem organização. */
function resumoDoOrcamento(o: { numero?: number | null; nomeEvento: string; valorTotal: number }): string {
  const numero = o.numero != null ? `Nº ${o.numero} · ` : ''
  const texto = `${numero}${o.nomeEvento} — ${o.valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
  return texto.length > 120 ? `${texto.slice(0, 119)}…` : texto
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
      dias: campos.dias,
      desconto: campos.desconto,
      valor_total: campos.valorTotal,
      observacoes: campos.observacoes,
      status: campos.status,
      created_by: perfil.id,
    }).select('id, numero').single()
    if (error) {
      console.error('[orcamentos] insert recusado', { erro: error.message, codigo: error.code })
      return { ok: false, erro: mensagemAmigavel(error) }
    }

    await gravarItens(data.id as string, campos.itens)
    after(() => registrarAuditoria({
      perfil, acao: 'ORCAMENTO_CRIADO', campoAlterado: 'Orçamento',
      valorNovo: resumoDoOrcamento({ numero: data.numero as number | null, nomeEvento: campos.nomeEvento, valorTotal: campos.valorTotal }),
    }))

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

    const { data: atual } = await supabaseAdmin.from('orcamentos').select('id, numero, nome_evento, valor_total').eq('id', id).maybeSingle()
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
      dias: campos.dias,
      desconto: campos.desconto,
      valor_total: campos.valorTotal,
      observacoes: campos.observacoes,
      status: campos.status,
      updated_at: new Date().toISOString(),
    }).eq('id', id)
    if (error) {
      console.error('[orcamentos] update recusado', { erro: error.message, codigo: error.code })
      return { ok: false, erro: mensagemAmigavel(error) }
    }

    // Itens não têm identidade própria fora do orçamento — apagar e regravar
    // é mais simples e seguro que diff item a item.
    const { error: erroDelete } = await supabaseAdmin.from('orcamento_itens').delete().eq('orcamento_id', id)
    if (erroDelete) return { ok: false, erro: `Não consegui atualizar os itens: ${erroDelete.message}` }
    await gravarItens(id, campos.itens)
    after(() => registrarAuditoria({
      perfil, acao: 'ORCAMENTO_EDITADO', campoAlterado: 'Orçamento',
      valorAnterior: resumoDoOrcamento({ numero: atual.numero as number | null, nomeEvento: String(atual.nome_evento ?? ''), valorTotal: Number(atual.valor_total ?? 0) }),
      valorNovo: resumoDoOrcamento({ numero: atual.numero as number | null, nomeEvento: campos.nomeEvento, valorTotal: campos.valorTotal }),
    }))

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

    // Lido ANTES de apagar: é o que a auditoria mostra depois.
    const { data: antes } = await supabaseAdmin.from('orcamentos').select('numero, nome_evento, valor_total').eq('id', id).maybeSingle()

    const { error } = await supabaseAdmin.from('orcamentos').delete().eq('id', id)
    if (error) return { ok: false, erro: mensagemAmigavel(error) }
    after(() => registrarAuditoria({
      perfil, acao: 'ORCAMENTO_EXCLUIDO', campoAlterado: 'Orçamento',
      valorAnterior: antes
        ? resumoDoOrcamento({ numero: antes.numero as number | null, nomeEvento: String(antes.nome_evento ?? ''), valorTotal: Number(antes.valor_total ?? 0) })
        : `Orçamento ${id}`,
    }))

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
      dias: original.dias,
      desconto: original.desconto,
      valor_total: original.valorTotalCalculado,
      observacoes: original.observacoes,
      status: 'rascunho',
      created_by: perfil.id,
    }).select('id, numero').single()
    if (error) return { ok: false, erro: mensagemAmigavel(error) }

    await gravarItens(data.id as string, original.itens.map(i => ({ descricao: i.descricao, valor: i.valor })))
    after(() => registrarAuditoria({
      perfil, acao: 'ORCAMENTO_DUPLICADO', campoAlterado: 'Orçamento',
      valorAnterior: resumoDoOrcamento({ numero: original.numero, nomeEvento: original.nomeEvento, valorTotal: original.valorTotalCalculado }),
      valorNovo: resumoDoOrcamento({ numero: data.numero as number | null, nomeEvento: original.nomeEvento, valorTotal: original.valorTotalCalculado }),
    }))

    revalidatePath('/admin/orcamentos')
    return { ok: true, id: data.id as string }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}
