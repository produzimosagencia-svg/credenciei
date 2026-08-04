import { supabaseAdmin } from '@/lib/supabase-server'
import type { PerfilIA } from './ferramentas'

/**
 * Registra toda ação que a IA executou no banco. Origem sempre 'assistente_ia',
 * pra distinguir do que a pessoa fez pela tela.
 *
 * Nunca lança: uma falha ao auditar não pode derrubar a ação em si — mas o erro
 * vai pro log do servidor, porque auditoria silenciosamente quebrada é pior que
 * auditoria ausente.
 */
export async function registrarAuditoriaIA(
  perfil: PerfilIA,
  acao: string,
  detalhes: Record<string, unknown>
): Promise<void> {
  try {
    await supabaseAdmin.from('auditoria_ia').insert([{
      perfil_id: perfil.id,
      perfil_nome: perfil.nome,
      perfil_role: perfil.role,
      organizacao_id: perfil.organizacao_id,
      acao,
      detalhes,
      origem: 'assistente_ia',
    }])
  } catch (e) {
    console.error('Falha ao registrar auditoria da IA:', acao, e)
  }
}
