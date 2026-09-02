import { headers } from 'next/headers'
import { supabaseAdmin } from './supabase-server'

/**
 * O gravador único de `alteracoes_cadastro` — ver supabase/upgrade-suporte.sql.
 *
 * Chamado por QUALQUER papel que executar uma ação sensível (correção de
 * CPF, mudança de setor, ativação, ponto assistido, reset de senha...), não
 * só quando o autor é suporte. Hoje essas ações não deixavam rastro nenhum,
 * nem pro master; ter dois caminhos — um com auditoria, um sem — seria pior
 * que gravar sempre.
 *
 * NUNCA lança: uma falha ao gravar auditoria não pode travar a ação em si
 * (a pessoa já mudou o CPF; abortar por causa do log seria pior que
 * simplesmente perder a linha). Mesmo espírito do tratamento tolerante já
 * usado pra colunas novas em `criarFornecedor`/`editarFornecedor`.
 */
export async function registrarAuditoria(args: {
  perfil: { id: string; nome: string }
  /** Ver `ACAO_LABELS` em lib/suporte.ts pros rótulos exibidos na tela. */
  acao: string
  campoAlterado?: string
  valorAnterior?: string | null
  valorNovo?: string | null
  motivo?: string | null
  funcionarioId?: string
  eventoId?: string
  organizacaoId?: string
}): Promise<void> {
  try {
    // Best-effort: só funciona atrás de proxy que preenche x-forwarded-for
    // (a Vercel preenche). Sem isso, ip fica nulo — não é erro.
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

    const { error } = await supabaseAdmin.from('alteracoes_cadastro').insert([{
      usuario_responsavel: args.perfil.nome,
      usuario_responsavel_id: args.perfil.id,
      organizacao_id: args.organizacaoId ?? null,
      evento_id: args.eventoId ?? null,
      funcionario_id: args.funcionarioId ?? null,
      acao: args.acao,
      campo_alterado: args.campoAlterado ?? null,
      valor_anterior: args.valorAnterior ?? null,
      valor_novo: args.valorNovo ?? null,
      motivo: args.motivo ?? null,
      ip,
    }])
    if (error) console.error('[auditoria] não gravou (migração pendente?)', error.message)
  } catch (e) {
    console.error('[auditoria] falha inesperada', e)
  }
}
