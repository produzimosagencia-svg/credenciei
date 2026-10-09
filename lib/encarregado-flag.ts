import 'server-only'
import { supabaseAdmin } from './supabase-server'
import { obterFuncionalidadesDoEvento } from './internos-servidor'

/** A organização liberou "Criar Encarregado"? Tolerante: falhou ou migração pendente → falso (a opção some, nada quebra). */
export async function encarregadosLigadosParaOrganizacao(organizacaoId: string | null | undefined): Promise<boolean> {
  if (!organizacaoId) return false
  try {
    const { data: org, error } = await supabaseAdmin
      .from('organizacoes').select('encarregados_habilitado').eq('id', organizacaoId).maybeSingle()
    if (error) return false
    return (org as { encarregados_habilitado?: boolean } | null)?.encarregados_habilitado === true
  } catch {
    return false
  }
}

/**
 * A organização DONA deste setor liberou "Criar Encarregado"? É o que decide
 * se o item aparece no menu do supervisor.
 */
export async function encarregadosLigadosParaSetor(fornecedorId: string | null | undefined): Promise<boolean> {
  if (!fornecedorId) return false
  try {
    // A configuração do EVENTO do setor (09/10/2026), que sem configuração própria é a da organização.
    const { data: forn } = await supabaseAdmin.from('fornecedores').select('evento_id').eq('id', fornecedorId).maybeSingle()
    return (await obterFuncionalidadesDoEvento((forn?.evento_id as string | undefined) ?? null)).encarregadosHabilitado
  } catch {
    return false
  }
}
