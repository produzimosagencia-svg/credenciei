'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { getPerfil, supabaseAdmin, meusSetores } from './supabase-server'
import { podeGerenciarEventos, ehMaster } from './permissions'
import { suporteTemEscopo } from './suporte'
import { registrarAuditoria } from './auditoria'
import { descredenciarFuncionario } from './actions'
import { conferenciaAberta, planilhaEquipeCsv } from './conferencia'
import { mensagemAmigavel } from './erros'

/**
 * Conferência de equipe — ESCRITA.
 *
 * `descredenciarFuncionario` (de lib/actions.ts) já faz a remoção com todas as
 * travas e a auditoria — a remoção aqui só o embrulha com o motivo certo e
 * garante que a linha de conferência exista. `confirmarConferencia` fecha:
 * carimba quem/quando e a fotografia dos números.
 *
 * Toda ação devolve `{ ok }` / `{ ok:false, erro }` — nada lança (o Next
 * mascara exceção de Server Action em produção).
 */

export type ResultadoConf = { ok: true } | { ok: false; erro: string }

/** Quem pode conferir/remover na equipe deste setor. Devolve o perfil ou null. */
async function exigirSetor(fornecedorId: string, eventoId: string) {
  const perfil = await getPerfil()
  if (!perfil) return null

  const { data: setor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, evento_id, eventos(organizacao_id)')
    .eq('id', fornecedorId)
    .maybeSingle()
  if (!setor || setor.evento_id !== eventoId) return null
  const orgId = (setor.eventos as unknown as { organizacao_id: string | null } | null)?.organizacao_id ?? null

  if (ehMaster(perfil.role)) return perfil
  if (podeGerenciarEventos(perfil) && orgId && orgId === perfil.organizacao_id) return perfil
  if (perfil.role === 'supervisor') {
    const meus = await meusSetores(perfil)
    return meus.some(s => s.id === fornecedorId) ? perfil : null
  }
  if (perfil.role === 'suporte' && (await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: orgId ?? undefined }))) {
    return perfil
  }
  return null
}

async function garantirLinha(fornecedorId: string, eventoId: string) {
  await supabaseAdmin
    .from('conferencias_equipe')
    .upsert({ fornecedor_id: fornecedorId, evento_id: eventoId }, { onConflict: 'fornecedor_id', ignoreDuplicates: true })
}

/** Tira alguém da equipe durante a conferência. Reusa `descredenciarFuncionario`. */
export async function removerNaConferencia(
  funcionarioId: string, fornecedorId: string, eventoId: string,
): Promise<ResultadoConf> {
  try {
    const perfil = await exigirSetor(fornecedorId, eventoId)
    if (!perfil) return { ok: false, erro: 'Você não pode mexer nesta equipe.' }
    await garantirLinha(fornecedorId, eventoId)
    await descredenciarFuncionario(funcionarioId, fornecedorId, eventoId, 'Removido na conferência de equipe')
    revalidatePath(`/admin/conferencia/${fornecedorId}`)
    revalidatePath(`/admin/eventos/${eventoId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}

/** O CSV da equipe do setor — pro botão "Baixar planilha" da tela. */
export async function planilhaEquipeDaConferencia(
  fornecedorId: string, eventoId: string,
): Promise<{ ok: true; csv: string; nome: string } | { ok: false; erro: string }> {
  const perfil = await exigirSetor(fornecedorId, eventoId)
  if (!perfil) return { ok: false, erro: 'Sem acesso a esta equipe.' }
  const csv = await planilhaEquipeCsv(fornecedorId)
  return { ok: true, csv, nome: `equipe-${fornecedorId.slice(0, 8)}.csv` }
}

/** Fecha a conferência: carimba quem, quando e os números. */
export async function confirmarConferencia(
  fornecedorId: string, eventoId: string,
): Promise<ResultadoConf> {
  try {
    const perfil = await exigirSetor(fornecedorId, eventoId)
    if (!perfil) return { ok: false, erro: 'Você não pode confirmar esta equipe.' }

    const { data: setor } = await supabaseAdmin
      .from('fornecedores').select('nome, eventos(nome, data_inicio, organizacao_id)').eq('id', fornecedorId).maybeSingle()
    const ev = setor?.eventos as unknown as { nome: string; data_inicio: string; organizacao_id: string | null } | null
    if (!ev) return { ok: false, erro: 'Setor não encontrado.' }
    if (!conferenciaAberta(ev.data_inicio)) {
      return { ok: false, erro: 'A conferência abre 1 dia antes do evento.' }
    }

    const [{ count: mantidos }, { count: removidos }] = await Promise.all([
      supabaseAdmin.from('funcionarios').select('id', { count: 'exact', head: true })
        .eq('fornecedor_id', fornecedorId).is('descredenciado_em', null).neq('ativo', false),
      supabaseAdmin.from('funcionarios').select('id', { count: 'exact', head: true })
        .eq('fornecedor_id', fornecedorId).not('descredenciado_em', 'is', null),
    ])

    const { error } = await supabaseAdmin
      .from('conferencias_equipe')
      .upsert({
        fornecedor_id: fornecedorId,
        evento_id: eventoId,
        status: 'confirmada',
        confirmada_por: perfil.id,
        confirmada_em: new Date().toISOString(),
        total_mantidos: mantidos ?? 0,
        total_removidos: removidos ?? 0,
      }, { onConflict: 'fornecedor_id' })
    if (error) return { ok: false, erro: mensagemAmigavel(error) }

    after(() => registrarAuditoria({
      perfil,
      acao: 'DESCREDENCIAMENTO',
      campoAlterado: `Conferência de equipe — setor ${setor?.nome ?? ''}`,
      valorNovo: `${mantidos ?? 0} mantidos, ${removidos ?? 0} removidos`,
      eventoId,
      organizacaoId: ev.organizacao_id ?? undefined,
    }))

    revalidatePath(`/admin/conferencia/${fornecedorId}`)
    revalidatePath(`/admin/eventos/${eventoId}`)
    return { ok: true }
  } catch (e) {
    return { ok: false, erro: mensagemAmigavel(e) }
  }
}
