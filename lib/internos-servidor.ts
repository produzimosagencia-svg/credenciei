import 'server-only'
import { supabaseAdmin } from './supabase-server'
import { adicionarFuncionarioNaPlanilha, registrarPresencaNaPlanilha } from './google-sheets'
import { formatarBR } from './tz'
import { normalizarCpf } from './usuario'
import { podeReceberFuncaoExtra, FUNCOES_EXTRAS, MSG_FUNCAO_NAO_COMBINA, type FuncaoExtra } from './funcoes'
import type { DiaDoEvento, FuncionalidadesOrganizacao } from './actions'

/**
 * Funções de SERVIDOR que não podem ser endpoints públicos.
 *
 * Moravam em lib/actions.ts, que é 'use server': TODA função exportada de um
 * arquivo assim vira um endpoint que qualquer pessoa — logada ou não — consegue
 * chamar do navegador. Estas seis não conferem login (rodam dentro do cadastro
 * público, do portão e das telas de servidor), e duas delas ESCREVEM na planilha
 * do evento. Aqui, sem 'use server', só código do servidor as enxerga: o
 * comportamento é o mesmo, mas deixam de ser alcançáveis de fora.
 *
 * Quem chama de uma tela do navegador precisa de um embrulho com login — ver
 * `metodoIdentificacaoDoEvento` em lib/actions.ts.
 */

export async function sincronizarFuncionarioNaPlanilha(funcionarioId: string) {
  try {
    const { data: func } = await supabaseAdmin
      .from('funcionarios')
      .select('*, fornecedores(nome, eventos(spreadsheet_id))')
      .eq('id', funcionarioId)
      .single()

    if (!func) return
    const fornecedor = func.fornecedores as unknown as { nome: string; eventos?: { spreadsheet_id?: string | null } | null }
    const evento = fornecedor?.eventos
    if (!evento?.spreadsheet_id) return

    await adicionarFuncionarioNaPlanilha(evento.spreadsheet_id, fornecedor.nome, {
      nome: func.nome,
      cpf: func.cpf,
      telefone: func.telefone,
      cargo: func.cargo,
      valorReceber: func.valor_receber,
      chavePix: func.chave_pix,
      qr_token: func.qr_token,
    })
  } catch (e) {
    console.error('Erro ao sincronizar funcionário na planilha:', e)
  }
}

export async function sincronizarRegistroNaPlanilha(
  funcionarioId: string,
  eventoId: string,
  tipo: 'entrada' | 'saida'
) {
  try {
    const [{ data: func }, { data: evento }] = await Promise.all([
      supabaseAdmin.from('funcionarios').select('nome, fornecedores(nome)').eq('id', funcionarioId).single(),
      supabaseAdmin.from('eventos').select('spreadsheet_id').eq('id', eventoId).single(),
    ])

    if (!func || !evento?.spreadsheet_id) return

    const fornecedor = func.fornecedores as unknown as { nome: string }
    /*
      * Horário de Brasília, não o do servidor.
      *
      * `format` do date-fns usa o fuso do runtime, e a Vercel roda em UTC: a
      * batida das 17:00 ia parar na planilha do cliente como 20:00. É o número
      * que o produtor usa pra conferir jornada e pagar — não podia estar errado.
      */
     const horario = formatarBR(new Date().toISOString(), 'completo')

    await registrarPresencaNaPlanilha(
      evento.spreadsheet_id,
      fornecedor.nome,
      func.nome,
      tipo,
      horario
    )
  } catch (e) {
    console.error('Erro ao sincronizar registro na planilha:', e)
  }
}

/**
 * Os dias de trabalho de um evento, na ordem.
 *
 * O dia principal sempre aparece, mesmo que ninguém tenha marcado dia nenhum:
 * ele é a data do próprio evento.
 */
export async function diasDoEvento(eventoId: string): Promise<DiaDoEvento[]> {
  const { data: dias } = await supabaseAdmin
    .from('jornada_dias')
    .select('id, data, tipo, cancelado, entrada_inicio, entrada_fim, saida_inicio, saida_fim')
    .eq('evento_id', eventoId)
    .order('data')

  if (!dias?.length) return []

  // Quais desses dias já têm batida (ver `diasComBatida` — não dá pra ler as batidas e montar um conjunto).
  const batidos = await diasComBatida(eventoId, dias.map(d => d.data as string))

  return dias.map(d => ({
    data: d.data as string,
    tipo: (d.tipo as 'principal' | 'preparacao') ?? 'preparacao',
    cancelado: d.cancelado === true,
    temBatidas: batidos.has(d.data as string),
    entradaInicio: (d.entrada_inicio as string | null) ?? null,
    entradaFim: (d.entrada_fim as string | null) ?? null,
    saidaInicio: (d.saida_inicio as string | null) ?? null,
    saidaFim: (d.saida_fim as string | null) ?? null,
  }))
}

/**
 * Este CPF está barrado neste evento?
 *
 * O bloqueio é do evento inteiro (`fornecedor_id` nulo), e a consulta ainda
 * aceita um bloqueio preso a um setor caso algum dia volte a existir.
 * Chamada nos dois pontos que barram gente — o cadastro pelo link e a
 * leitura de QR no portão.
 *
 * Tolerante à migração pendente: sem a tabela, a consulta falha e a resposta
 * é "não bloqueado". Sem isso, o dia em que a migração não tivesse rodado o
 * sistema recusaria TODO MUNDO no portão — o oposto do que se quer de uma
 * lista de exceção.
 */
export async function cpfEstaBloqueado(
  eventoId: string, cpf: string, fornecedorId: string | null,
): Promise<boolean> {
  const limpo = normalizarCpf(cpf ?? '')
  if (!limpo) return false
  const { data, error } = await supabaseAdmin
    .from('cpfs_bloqueados')
    .select('id, fornecedor_id')
    .eq('evento_id', eventoId)
    .eq('cpf', limpo)
  if (error) {
    console.error('[cpfEstaBloqueado] consulta falhou (migração pendente?):', error.message)
    return false
  }
  return (data ?? []).some(b => b.fornecedor_id === null || b.fornecedor_id === fornecedorId)
}

/**
 * Tolerante à migração pendente (mesmo padrão do resto do sistema): sem as
 * colunas, tudo se comporta como hoje — nenhum recurso novo aparece.
 */
export async function obterFuncionalidadesOrganizacao(organizacaoId: string | null): Promise<FuncionalidadesOrganizacao> {
  const vazio = { subeventosHabilitado: false, travaCotaHabilitada: false, avisoUniformeHabilitado: false, escalaPorDiaHabilitada: false, encarregadosHabilitado: false }
  if (!organizacaoId) return vazio
  const { data, error } = await supabaseAdmin
    .from('organizacoes').select('*').eq('id', organizacaoId).maybeSingle()
  if (error || !data) return vazio
  return {
    subeventosHabilitado: (data as { subeventos_habilitado?: boolean }).subeventos_habilitado === true,
    travaCotaHabilitada: (data as { trava_cota_habilitada?: boolean }).trava_cota_habilitada === true,
    avisoUniformeHabilitado: (data as { aviso_uniforme_habilitado?: boolean }).aviso_uniforme_habilitado === true,
    escalaPorDiaHabilitada: (data as { escala_por_dia_habilitada?: boolean }).escala_por_dia_habilitada === true,
    encarregadosHabilitado: (data as { encarregados_habilitado?: boolean }).encarregados_habilitado === true,
  }
}

/**
 * Quais destes dias JÁ TÊM alguma batida no evento.
 *
 * É a trava que impede apagar ou rebaixar um dia de trabalho com prova de
 * presença. Por isso NÃO pode ser "lê as batidas e monta um conjunto": o banco
 * corta qualquer resposta em 1.000 linhas, e num evento grande (milhares de
 * pessoas × 3 batidas) as batidas de um dia podiam nunca entrar nas primeiras
 * 1.000 — o dia parecia vazio e podia ser removido com ponto registrado.
 * Aqui é uma pergunta por dia ("existe ao menos uma?"), que não depende do
 * tamanho do evento.
 */
export async function diasComBatida(eventoId: string, datas: string[]): Promise<Set<string>> {
  const unicas = [...new Set(datas)]
  const respostas = await Promise.all(unicas.map(async data => {
    const { data: linhas, error } = await supabaseAdmin
      .from('registros').select('id').eq('evento_id', eventoId).eq('data_ref', data).limit(1)
    // Na dúvida (erro de consulta), trata como COM batida: o erro mais seguro é preservar o dia.
    return { data, tem: !!error || (linhas?.length ?? 0) > 0 }
  }))
  return new Set(respostas.filter(r => r.tem).map(r => r.data))
}

// ─── Mais de uma função por pessoa ───────────────────────────────────────────


/**
 * Dá a uma pessoa que JÁ TEM acesso uma função a mais (ver
 * supabase/upgrade-funcoes-multiplas.sql). Idempotente: dar de novo a mesma
 * função só confirma. Recusa as identidades que não se misturam (master,
 * suporte, produtor) e quem já TEM essa função como base.
 *
 * Devolve `ok: false` com a frase pronta pra tela — nunca lança.
 */
export async function garantirFuncaoExtra(
  perfilId: string, role: FuncaoExtra, organizacaoId: string | null,
): Promise<{ ok: true; jaTinha: boolean } | { ok: false; erro: string }> {
  if (!FUNCOES_EXTRAS.includes(role)) return { ok: false, erro: 'Função inválida.' }
  const { data: perfil } = await supabaseAdmin.from('perfis').select('role').eq('id', perfilId).maybeSingle()
  if (!perfil) return { ok: false, erro: 'Acesso não encontrado.' }
  if (perfil.role === role) return { ok: true, jaTinha: true }
  if (!podeReceberFuncaoExtra(perfil.role as string)) return { ok: false, erro: MSG_FUNCAO_NAO_COMBINA }

  const { data: existente } = await supabaseAdmin
    .from('perfil_funcoes').select('id').eq('perfil_id', perfilId).eq('role', role).maybeSingle()
  if (existente) return { ok: true, jaTinha: true }

  const { error } = await supabaseAdmin.from('perfil_funcoes').insert([{ perfil_id: perfilId, role, organizacao_id: organizacaoId }])
  if (error) {
    if (/perfil_funcoes|does not exist|schema cache/i.test(error.message)) {
      return { ok: false, erro: 'Falta rodar a atualização do banco (upgrade-funcoes-multiplas.sql).' }
    }
    return { ok: false, erro: error.message }
  }
  return { ok: true, jaTinha: false }
}

/** Tira uma função EXTRA (a de base não sai por aqui). Tolerante: sem a tabela, não há o que tirar. */
export async function removerFuncaoExtra(perfilId: string, role: FuncaoExtra): Promise<void> {
  const { error } = await supabaseAdmin.from('perfil_funcoes').delete().eq('perfil_id', perfilId).eq('role', role)
  if (error && !/perfil_funcoes|does not exist|schema cache/i.test(error.message)) {
    console.error('[funcoes] não consegui tirar a função extra', error.message)
  }
}
