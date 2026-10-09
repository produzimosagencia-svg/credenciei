import 'server-only'
import { supabaseAdmin } from './supabase-server'
import { adicionarFuncionarioNaPlanilha, registrarPresencaNaPlanilha } from './google-sheets'
import { formatarBR } from './tz'
import { normalizarCpf } from './usuario'
import { ROLE_LABELS } from './permissions'
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
  const vazio = { subeventosHabilitado: false, travaCotaHabilitada: false, avisoUniformeHabilitado: false, escalaPorDiaHabilitada: false, encarregadosHabilitado: false, areaNoScannerHabilitada: false }
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
    areaNoScannerHabilitada: (data as { area_no_scanner_habilitada?: boolean }).area_no_scanner_habilitada === true,
  }
}

/** Coluna de `organizacoes` (e chave de `eventos.funcionalidades`) → campo de `FuncionalidadesOrganizacao`. */
export const CHAVES_FUNCIONALIDADES = {
  subeventos_habilitado: 'subeventosHabilitado',
  trava_cota_habilitada: 'travaCotaHabilitada',
  aviso_uniforme_habilitado: 'avisoUniformeHabilitado',
  escala_por_dia_habilitada: 'escalaPorDiaHabilitada',
  encarregados_habilitado: 'encarregadosHabilitado',
  area_no_scanner_habilitada: 'areaNoScannerHabilitada',
} as const satisfies Record<string, keyof FuncionalidadesOrganizacao>

/** Mistura a organização com o que o evento salvou (`eventos.funcionalidades`; null = segue a organização). */
function aplicarDoEvento(daOrg: FuncionalidadesOrganizacao, doEvento: unknown): FuncionalidadesOrganizacao {
  if (!doEvento || typeof doEvento !== 'object') return daOrg
  const r = { ...daOrg }
  for (const [coluna, campo] of Object.entries(CHAVES_FUNCIONALIDADES)) {
    const v = (doEvento as Record<string, unknown>)[coluna]
    if (typeof v === 'boolean') r[campo] = v
  }
  return r
}

/**
 * As funcionalidades que valem NESTE evento (pedido do Juan, 09/10/2026 — "Configurações" dentro do evento): as da
 * organização, com o que o evento salvou por cima. `personalizado` = o evento tem configuração própria.
 * Tolerante: sem a coluna `eventos.funcionalidades` (migração pendente), é exatamente a organização.
 */
export async function obterFuncionalidadesDoEvento(eventoId: string | null | undefined): Promise<FuncionalidadesOrganizacao & { personalizado: boolean }> {
  if (!eventoId) return { ...(await obterFuncionalidadesOrganizacao(null)), personalizado: false }
  const { data: ev } = await supabaseAdmin.from('eventos').select('*').eq('id', eventoId).maybeSingle()
  const daOrg = await obterFuncionalidadesOrganizacao((ev as { organizacao_id?: string | null } | null)?.organizacao_id ?? null)
  const doEvento = (ev as { funcionalidades?: unknown } | null)?.funcionalidades ?? null
  return { ...aplicarDoEvento(daOrg, doEvento), personalizado: !!doEvento && typeof doEvento === 'object' }
}

/**
 * Dos eventos dados, em quais o leitor deve pedir/conferir a ÁREA (subevento)
 * de quem entra. Vem da organização do evento — Configurações → Funcionalidades
 * ("Selecionar a área no leitor"), desligada por padrão: o leitor só lê a câmera
 * e registra quem entra. Tolerante à migração pendente (sem a coluna = desligado).
 */
/**
 * O tutorial guiado está ligado NESTE evento? (supabase/upgrade-tutorial-por-evento.sql — nasce ligado).
 * Tolerante: sem a coluna, ou evento não encontrado, o tutorial continua aparecendo — comportamento de sempre.
 */
export async function tutorialHabilitadoNoEvento(eventoId: string | null | undefined): Promise<boolean> {
  if (!eventoId) return true
  try {
    const { data, error } = await supabaseAdmin.from('eventos').select('tutorial_habilitado').eq('id', eventoId).maybeSingle()
    if (error || !data) return true
    return (data as { tutorial_habilitado?: boolean }).tutorial_habilitado !== false
  } catch {
    return true
  }
}

export async function eventosComAreaNoScanner(eventoIds: string[]): Promise<Set<string>> {
  if (!eventoIds.length) return new Set()
  try {
    // Por EVENTO desde 09/10/2026: a configuração do evento, quando existe, vale por cima da organização.
    const lidos = await Promise.all([...new Set(eventoIds)].map(async id => [id, (await obterFuncionalidadesDoEvento(id)).areaNoScannerHabilitada] as const))
    return new Set(lidos.filter(([, ligado]) => ligado).map(([id]) => id))
  } catch {
    return new Set()
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
 * Dos subgrupos (subeventos) informados, quais estão com o cadastro de novas pessoas TRAVADO
 * (`subeventos.cadastro_suspenso`, supabase/upgrade-cadastro-subevento.sql). Tolerante: sem a coluna (migração
 * não rodada) ou com erro, devolve vazio — a página de cadastro é a porta de entrada da equipe e não pode cair.
 */
export async function subeventosComCadastroSuspenso(ids: (string | null | undefined)[]): Promise<Set<string>> {
  const limpos = [...new Set(ids.filter((x): x is string => !!x))]
  if (!limpos.length) return new Set()
  try {
    const { data, error } = await supabaseAdmin.from('subeventos').select('id, cadastro_suspenso').in('id', limpos)
    if (error) return new Set()
    return new Set((data ?? []).filter(r => (r as { cadastro_suspenso?: boolean }).cadastro_suspenso === true).map(r => r.id as string))
  } catch {
    return new Set()
  }
}

/**
 * As três travas de cadastro de um evento, de uma vez (Juan, 09/10/2026: "esse botão deve travar o cadastro de
 * funcionários e de setores por meio do link ou planilha"): o evento inteiro (`eventos.cadastro_suspenso`), os
 * subgrupos travados (`subeventos.cadastro_suspenso`) e os fornecedores com o link desligado
 * (`fornecedores.link_ativo`). Tolerante: coluna faltando conta como aberto.
 */
export type TravasDeCadastro = { evento: boolean; subgrupos: Set<string>; fornecedores: Set<string> }
export async function travasDeCadastroDoEvento(eventoId: string): Promise<TravasDeCadastro> {
  const [ev, subs, forns] = await Promise.all([
    supabaseAdmin.from('eventos').select('cadastro_suspenso').eq('id', eventoId).maybeSingle().then(r => r, () => ({ data: null })),
    supabaseAdmin.from('subeventos').select('id, cadastro_suspenso').eq('evento_id', eventoId).then(r => r, () => ({ data: null })),
    supabaseAdmin.from('fornecedores').select('id, link_ativo').eq('evento_id', eventoId).then(r => r, () => ({ data: null })),
  ])
  return {
    evento: (ev.data as { cadastro_suspenso?: boolean } | null)?.cadastro_suspenso === true,
    subgrupos: new Set(((subs.data ?? []) as { id: string; cadastro_suspenso?: boolean }[]).filter(x => x.cadastro_suspenso === true).map(x => x.id)),
    fornecedores: new Set(((forns.data ?? []) as { id: string; link_ativo?: boolean }[]).filter(x => x.link_ativo === false).map(x => x.id)),
  }
}

/**
 * O cadastro (de pessoa ou de setor) está TRAVADO neste ponto? Devolve a frase pronta, ou `null` se está aberto.
 * Regra do Juan (09/10/2026): "quando eu apertar o botão de desligar cadastro, ninguém tem como se cadastrar mais,
 * só quando for habilitado pelo botão" — vale pro link, pra planilha, pro cadastro manual e pra IA.
 *
 * `fornecedorId` sem `subeventoId`: o subgrupo é o do fornecedor. Setor NOVO: passe só o `subeventoId` de destino.
 */
export async function motivoCadastroTravado(
  eventoId: string, alvo: { fornecedorId?: string | null; subeventoId?: string | null; oQue?: 'pessoas' | 'setores' } = {},
): Promise<string | null> {
  const travas = await travasDeCadastroDoEvento(eventoId)
  let subeventoId = alvo.subeventoId ?? null
  if (alvo.fornecedorId && alvo.subeventoId === undefined) {
    const { data } = await supabaseAdmin.from('fornecedores').select('subevento_id').eq('id', alvo.fornecedorId).maybeSingle()
    subeventoId = (data as { subevento_id?: string | null } | null)?.subevento_id ?? null
  }
  const oQue = alvo.oQue === 'setores' ? 'novos setores' : 'novas pessoas'
  const onde = travas.evento ? 'deste evento'
    : subeventoId && travas.subgrupos.has(subeventoId) ? 'deste subgrupo'
      : alvo.fornecedorId && travas.fornecedores.has(alvo.fornecedorId) ? 'deste fornecedor'
        : null
  return onde ? `O cadastro de ${oQue} ${onde} está travado. Para cadastrar, destrave no painel "Cadastro de pessoas e setores" do subgrupo.` : null
}

/**
 * Esta pessoa JÁ RECEBEU (ou tem na fila) uma destas mensagens neste evento? É o "link vai uma vez só"
 * (Juan, 09/10/2026): supervisor ou Encarregado em mais de um setor do mesmo evento, ou que trocou de
 * função e voltou, não recebe o mesmo link de novo.
 *
 * Olha a MENSAGEM na fila, não o vínculo — ver `jaFoiAvisadoNesteEvento` em lib/actions.ts (caso do
 * Erivelton). Cancelada ou falhada não conta. Aceita vários números (o digitado e o do cadastro). Erro de
 * consulta devolve `false`: na dúvida, avisa.
 */
export async function jaRecebeuMensagemNoEvento(
  telefone: string | (string | null | undefined)[], eventoId: string, templates: string[],
): Promise<boolean> {
  const numeros = [...new Set(
    (Array.isArray(telefone) ? telefone : [telefone])
      .map(t => (t ?? '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''))
      .filter(Boolean),
  )]
  if (!numeros.length || !templates.length) return false
  const { data, error } = await supabaseAdmin
    .from('mensagens_agendadas')
    .select('mensagem')
    .eq('evento_id', eventoId)
    .eq('tipo', 'disparo_manual')
    .in('telefone', numeros.flatMap(n => [n, `55${n}`]))
    .in('status', ['pendente', 'enviado'])
  if (error) return false
  return (data ?? []).some(m => {
    const texto = String(m.mensagem ?? '')
    return templates.some(t => texto.includes(`"${t}"`))
  })
}
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
  const { data: perfil } = await supabaseAdmin.from('perfis').select('role, organizacao_id').eq('id', perfilId).maybeSingle()
  if (!perfil) return { ok: false, erro: 'Acesso não encontrado.' }
  /*
   * Gestor de credenciamento é POR ORGANIZAÇÃO também quando ele é a função de BASE (Juan, 09/10/2026: "as pessoas
   * podem sim trabalhar em mais de um evento, de organizações diferentes"): operador de base da Navista que vira
   * operador da Homologação ganha a segunda como função EXTRA, e troca pela foto. Antes: "já tinha", e nada gravava.
   */
  const mesmaFuncaoDeBase = perfil.role === role
    && (role !== 'operador_portao' || ((perfil.organizacao_id as string | null) ?? null) === organizacaoId)
  if (mesmaFuncaoDeBase) return { ok: true, jaTinha: true }
  if (!podeReceberFuncaoExtra(perfil.role as string)) return { ok: false, erro: MSG_FUNCAO_NAO_COMBINA }

  /*
   * Gestor de credenciamento é POR ORGANIZAÇÃO: quem já é Gestor na Navista e ganha o papel na
   * Homologação precisa de uma segunda linha. Antes isto olhava só o papel, achava a linha da
   * Navista, respondia "já tinha" e não gravava nada — a tela dizia que deu certo, a mensagem
   * saía, e a pessoa nunca aparecia na lista do evento (achado ao vivo, 08/10/2026). Supervisor e
   * Encarregado seguem com uma linha só.
   */
  let busca = supabaseAdmin.from('perfil_funcoes').select('id').eq('perfil_id', perfilId).eq('role', role)
  if (role === 'operador_portao') busca = organizacaoId ? busca.eq('organizacao_id', organizacaoId) : busca.is('organizacao_id', null)
  const { data: existente } = await busca.limit(1).maybeSingle()
  if (existente) return { ok: true, jaTinha: true }

  const { error } = await supabaseAdmin.from('perfil_funcoes').insert([{ perfil_id: perfilId, role, organizacao_id: organizacaoId }])
  if (error) {
    if (/perfil_funcoes|does not exist|schema cache/i.test(error.message) && !/duplicate|unique/i.test(error.message)) {
      return { ok: false, erro: 'Falta rodar a atualização do banco (upgrade-funcoes-multiplas.sql).' }
    }
    // Já tem a função em OUTRA organização e o banco ainda só aceita uma por papel.
    if (error.code === '23505' || /duplicate|unique/i.test(error.message)) {
      return { ok: false, erro: 'Esta pessoa já tem essa função em outra organização. Falta rodar a atualização do banco (upgrade-funcoes-varias-organizacoes.sql) para ela ter nas duas.' }
    }
    return { ok: false, erro: error.message }
  }
  return { ok: true, jaTinha: false }
}

/** Tira uma função EXTRA (a de base não sai por aqui). Tolerante: sem a tabela, não há o que tirar. */
export async function removerFuncaoExtra(perfilId: string, role: FuncaoExtra, organizacaoId?: string | null): Promise<void> {
  // Com a organização, tira só a função DESSA organização (Gestor em duas: sai de uma, continua na outra).
  let consulta = supabaseAdmin.from('perfil_funcoes').delete().eq('perfil_id', perfilId).eq('role', role)
  if (organizacaoId) consulta = consulta.eq('organizacao_id', organizacaoId)
  const { error } = await consulta
  if (error && !/perfil_funcoes|does not exist|schema cache/i.test(error.message)) {
    console.error('[funcoes] não consegui tirar a função extra', error.message)
  }
}

/**
 * Os operadores de portão (Gestores de credenciamento) de uma organização — quem tem o papel
 * como BASE e quem o recebeu como função EXTRA (um supervisor ou Encarregado que também opera
 * o portão e troca de perfil pela foto).
 *
 * Sem a segunda metade, "criar operador" para alguém que já tinha outro acesso funcionava, mas
 * a pessoa nunca aparecia na lista do evento — a tela não atualizava (achado ao vivo, 07/10/2026,
 * quando o Juan se cadastrou como operador no VITAL). `funcaoExtra` traz o nome da função de
 * base, e é o que a tela usa pra NÃO oferecer editar/excluir a conta inteira, só tirar a função.
 */
export type OperadorDaOrganizacao = {
  id: string; nome: string; email: string; cpf: string | null; telefone: string | null; ativo: boolean
  funcaoExtra?: string | null
}
export async function operadoresDaOrganizacao(organizacaoId: string): Promise<OperadorDaOrganizacao[]> {
  const colunas = 'id, nome, email, cpf, telefone, ativo'
  const [{ data: base }, { data: extras, error: erroExtras }] = await Promise.all([
    supabaseAdmin.from('perfis').select(colunas).eq('role', 'operador_portao').eq('organizacao_id', organizacaoId),
    supabaseAdmin.from('perfil_funcoes').select('perfil_id').eq('role', 'operador_portao').eq('organizacao_id', organizacaoId),
  ])
  const lista: OperadorDaOrganizacao[] = (base ?? []) as OperadorDaOrganizacao[]
  const jaTem = new Set(lista.map(o => o.id))
  // Migração das funções múltiplas pendente (ou erro): fica só com os operadores de base, como antes.
  const idsExtras = erroExtras ? [] : (extras ?? []).map(e => e.perfil_id as string).filter(id => !jaTem.has(id))
  if (idsExtras.length) {
    const { data: pessoas } = await supabaseAdmin.from('perfis').select(`${colunas}, role`).in('id', idsExtras)
    for (const p of (pessoas ?? []) as (OperadorDaOrganizacao & { role: string })[]) {
      const { role, ...resto } = p
      lista.push({ ...resto, funcaoExtra: ROLE_LABELS[role as keyof typeof ROLE_LABELS] ?? role })
    }
  }
  return lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}
