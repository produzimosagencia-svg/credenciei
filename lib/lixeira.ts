import 'server-only'
import { supabaseAdmin } from './supabase-server'

/**
 * Lixeira de funcionários — a cópia guardada ANTES de uma exclusão, e o que ela permite desfazer.
 *
 * Excluir um funcionário apaga em cascata as batidas, os dias de trabalho, a biometria... e o QR da credencial
 * para de valer. Antes do delete, `guardarNaLixeira` copia a linha de `funcionarios` (com o mesmo id e o mesmo
 * token do QR) e tudo o que o cascade levaria. O master restaura pela tela "Excluídos"
 * (lib/actions-lixeira.ts): a pessoa volta com o MESMO QR — o link que ela recebeu no WhatsApp volta a funcionar.
 *
 * Banco: supabase/upgrade-lixeira-funcionarios.sql.
 */

/**
 * As tabelas que o `on delete cascade` esvazia junto com a pessoa, NA ORDEM em que voltam. Tabela que não existe
 * no banco (migração não rodada) é pulada. Lembretes de WhatsApp não entram: são refeitos pela fila.
 */
export const TABELAS_DA_PESSOA = [
  'registros', 'funcionario_dias', 'pausas_turno', 'biometria_consentimentos', 'biometria_templates',
  'avaliacoes_colaborador', 'veiculos',
] as const

/**
 * Guarda a cópia. Devolve `false` quando não deu para guardar (tabela da lixeira ainda não existe, ou falha de
 * banco) — quem chama decide: a exclusão pela tela segue mesmo assim, como sempre foi.
 */
export async function guardarNaLixeira(
  funcionarioId: string, autor: { id: string; nome: string }, motivo?: string | null,
): Promise<boolean> {
  try {
    const { data: dados } = await supabaseAdmin
      .from('funcionarios').select('*, fornecedores(nome, evento_id, eventos(nome))').eq('id', funcionarioId).maybeSingle()
    if (!dados) return false

    const relacionados: Record<string, unknown[]> = {}
    for (const tabela of TABELAS_DA_PESSOA) {
      const { data, error } = await supabaseAdmin.from(tabela).select('*').eq('funcionario_id', funcionarioId)
      if (!error && data?.length) relacionados[tabela] = data
    }

    const { fornecedores, ...linha } = dados as Record<string, unknown> & {
      fornecedores: { nome: string; evento_id: string; eventos: { nome: string } | null } | null
    }
    const { error } = await supabaseAdmin.from('funcionarios_excluidos').insert({
      funcionario_id: funcionarioId,
      evento_id: fornecedores?.evento_id ?? null,
      fornecedor_id: (linha.fornecedor_id as string | null) ?? null,
      nome: String(linha.nome ?? ''),
      cpf: String(linha.cpf ?? ''),
      fornecedor_nome: fornecedores?.nome ?? null,
      evento_nome: fornecedores?.eventos?.nome ?? null,
      dados: linha,
      relacionados,
      batidas: (relacionados.registros ?? []).length,
      excluido_por: autor.id,
      excluido_por_nome: autor.nome,
      motivo: motivo ?? null,
    })
    if (error) {
      console.error('[lixeira] cópia não guardada (migração upgrade-lixeira-funcionarios.sql pendente?)', error.message)
      return false
    }
    return true
  } catch (e) {
    console.error('[lixeira] falha ao guardar cópia', e)
    return false
  }
}

export type Excluido = {
  id: string
  nome: string
  cpf: string
  fornecedorNome: string | null
  eventoNome: string | null
  eventoId: string | null
  batidas: number
  excluidoPor: string | null
  excluidoEm: string
  motivo: string | null
  restauradoEm: string | null
  restauradoPor: string | null
}

/** A lista da tela "Excluídos" (só o master chega aqui). `null` = a migração ainda não rodou. */
export async function listarExcluidos(busca?: string): Promise<Excluido[] | null> {
  let q = supabaseAdmin
    .from('funcionarios_excluidos')
    .select('id, nome, cpf, fornecedor_nome, evento_nome, evento_id, batidas, excluido_por_nome, excluido_em, motivo, restaurado_em, restaurado_por_nome')
    .order('excluido_em', { ascending: false })
    .limit(300)
  const termo = (busca ?? '').trim()
  if (termo) {
    const digitos = termo.replace(/\D/g, '')
    q = digitos.length >= 3 ? q.ilike('cpf', `%${digitos}%`) : q.ilike('nome', `%${termo}%`)
  }
  const { data, error } = await q
  if (error) return null
  return (data ?? []).map(e => ({
    id: e.id as string,
    nome: e.nome as string,
    cpf: e.cpf as string,
    fornecedorNome: (e.fornecedor_nome as string | null) ?? null,
    eventoNome: (e.evento_nome as string | null) ?? null,
    eventoId: (e.evento_id as string | null) ?? null,
    batidas: (e.batidas as number) ?? 0,
    excluidoPor: (e.excluido_por_nome as string | null) ?? null,
    excluidoEm: e.excluido_em as string,
    motivo: (e.motivo as string | null) ?? null,
    restauradoEm: (e.restaurado_em as string | null) ?? null,
    restauradoPor: (e.restaurado_por_nome as string | null) ?? null,
  }))
}
