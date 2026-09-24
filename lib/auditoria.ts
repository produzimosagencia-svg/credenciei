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

/** Como a origem do cadastro aparece na auditoria. Chave = `funcionarios.origem`. */
export const ROTULO_ORIGEM_CADASTRO: Record<string, string> = {
  formulario: 'Cadastro pelo link',
  portaria: 'Cadastro pela portaria (cartaz)',
  planilha: 'Importado por planilha',
}

/**
 * Registra na auditoria que ALGUÉM SE CADASTROU — pedido do Juan
 * (24/09/2026): "quem se cadastrou, que horas, por meio de que (link ou
 * planilha)". Separado de `registrarAuditoria` porque o cadastro público
 * não tem perfil autenticado (é a própria pessoa preenchendo o formulário,
 * sem sessão) — não existe um "responsável" no sentido de admin agindo.
 */
export async function registrarCadastroFuncionario(args: {
  funcionarioId: string
  nome: string
  eventoId: string
  organizacaoId?: string | null
  origem: 'formulario' | 'portaria' | 'planilha'
}): Promise<void> {
  try {
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const { error } = await supabaseAdmin.from('alteracoes_cadastro').insert([{
      usuario_responsavel: `${args.nome} (cadastro próprio)`,
      usuario_responsavel_id: null,
      organizacao_id: args.organizacaoId ?? null,
      evento_id: args.eventoId,
      funcionario_id: args.funcionarioId,
      acao: 'CADASTRO_FUNCIONARIO',
      campo_alterado: 'Cadastro',
      valor_novo: ROTULO_ORIGEM_CADASTRO[args.origem] ?? args.origem,
      ip,
    }])
    if (error) console.error('[auditoria] cadastro não gravado', error.message)
  } catch (e) {
    console.error('[auditoria] falha inesperada (cadastro)', e)
  }
}

/**
 * Mesma coisa, em lote — pra importação por planilha (dezenas/centenas de
 * pessoas de uma vez). Um INSERT só, não um por pessoa: gravar um por um
 * seria centenas de idas ao banco só de log numa importação grande.
 * `usuarioResponsavel` aqui é quem RODOU a importação (admin/supervisor),
 * não a pessoa importada — ela nem sabe que a planilha existe.
 */
export async function registrarCadastrosEmLote(args: {
  eventoId: string
  organizacaoId?: string | null
  usuarioResponsavel: { id: string; nome: string }
  itens: { funcionarioId: string }[]
}): Promise<void> {
  if (!args.itens.length) return
  try {
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const linhas = args.itens.map(item => ({
      usuario_responsavel: args.usuarioResponsavel.nome,
      usuario_responsavel_id: args.usuarioResponsavel.id,
      organizacao_id: args.organizacaoId ?? null,
      evento_id: args.eventoId,
      funcionario_id: item.funcionarioId,
      acao: 'CADASTRO_FUNCIONARIO',
      campo_alterado: 'Cadastro',
      valor_novo: ROTULO_ORIGEM_CADASTRO.planilha,
      ip,
    }))
    const { error } = await supabaseAdmin.from('alteracoes_cadastro').insert(linhas)
    if (error) console.error('[auditoria] cadastro em lote não gravado', error.message)
  } catch (e) {
    console.error('[auditoria] falha inesperada (cadastro em lote)', e)
  }
}
