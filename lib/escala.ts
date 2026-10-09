import { supabaseAdmin, buscarTudo } from './supabase-server'
import { obterFuncionalidadesDoEvento } from './internos-servidor'
import { faseDoDia, periodoDoEvento, somarDias } from './janelas'
import { emLotes } from './lotes'
import {
  TRAVA_POR_DIA_ATIVA, planejarAprovacao, statusEscalaValido, vereditoDaEscala,
  type DiaDaEscala, type DiaEscolhido, type StatusEscala, type VereditoEscala,
} from './escala-regras'

/**
 * Escala por dia (eventos de subeventos) — LEITURA e GRAVAÇÃO no banco.
 *
 * As regras puras estão em lib/escala-regras.ts. Permissão é de quem chama
 * (as actions em lib/actions.ts): estas funções só arrumam o dado, dado um id
 * que já passou pela régua — mesmo contrato de lib/conferencia.ts.
 *
 * Tudo aqui é TOLERANTE à migração pendente (supabase/upgrade-escala-por-dia.sql):
 * sem as colunas/tabela, o evento simplesmente não usa escala por dia e tudo
 * se comporta como antes.
 */

/**
 * O evento usa escala por dia? Três chaves, todas precisam estar ligadas:
 *   * o evento é de subeventos (`eventos.tem_subeventos`);
 *   * a organização tem subeventos liberado (mesma dupla checagem da tela do
 *     evento, app/admin/eventos/[id]/page.tsx);
 *   * a organização ligou "Dias de trabalho escolhidos pelo funcionário" em
 *     Configurações → Funcionalidades do Sistema (nasce desligado).
 * Evento normal → `false`, sempre.
 */
/**
 * Esta pessoa (pelo CPF) tem conta de supervisor em algum fornecedor do sistema? Vira regra automática a partir
 * de 08/10/2026 (pedido do Juan, depois de liberar manualmente os supervisores do VITAL: "quem for supervisor
 * pode deixar liberado todos os dias... todas as pessoas que for supervisor pode liberar pra todos os dias") —
 * supervisor precisa poder estar presente em qualquer dia do evento, não só nos que marcou no próprio cadastro
 * de colaborador. `aprovarCredenciamento` e `ajustarEscalaDoFuncionario` chamam isto pra forçar todos os dias,
 * ignorando o que foi pedido/marcado na tela.
 */
/*
 * POR EVENTO desde 09/10/2026 (pedido do Juan: "supervisor pode ter permissão de ir todos os dias; encarregado e
 * colaborador são dias selecionados"). Antes bastava a conta ter `role = 'supervisor'` em qualquer lugar — e quem
 * era rebaixado a colaborador (Função na ficha da equipe) continuava com a conta de supervisor, então os dias dele
 * voltavam a ser "todos" a cada ajuste. Agora vale quem SUPERVISIONA um setor deste evento (`supervisor_setores`).
 */
export async function pessoaEhSupervisor(cpf: string | null | undefined, eventoId: string): Promise<boolean> {
  const limpo = (cpf ?? '').replace(/\D/g, '')
  if (limpo.length !== 11) return false
  try {
    const { data: contas } = await supabaseAdmin.from('perfis').select('id').eq('cpf', limpo)
    const ids = (contas ?? []).map(c => c.id as string)
    if (!ids.length) return false
    const { data } = await supabaseAdmin
      .from('supervisor_setores').select('fornecedor_id, fornecedores!inner(evento_id)')
      .in('perfil_id', ids).eq('fornecedores.evento_id', eventoId).limit(1)
    return !!data?.length
  } catch {
    return false
  }
}

export async function eventoUsaEscalaPorDia(eventoId: string): Promise<boolean> {
  try {
    const { data: evento, error } = await supabaseAdmin
      .from('eventos').select('tem_subeventos, organizacao_id').eq('id', eventoId).maybeSingle()
    if (error || !evento || (evento as { tem_subeventos?: boolean }).tem_subeventos !== true) return false

    const orgId = (evento as { organizacao_id?: string | null }).organizacao_id
    if (!orgId) return false
    // As do EVENTO (Configurações dentro do evento, 09/10/2026), que sem configuração própria são as da organização.
    const flags = await obterFuncionalidadesDoEvento(eventoId)
    if (!flags.subeventosHabilitado || !flags.escalaPorDiaHabilitada) return false

    // A tabela existe? Sem ela não há onde guardar a escolha — melhor seguir
    // sem escala do que derrubar o cadastro inteiro.
    const { error: semTabela } = await supabaseAdmin.from('funcionario_dias').select('id', { head: true }).limit(1)
    return !semTabela
  } catch {
    return false
  }
}

/**
 * Os dias que a pessoa pode escolher: todos os dias de trabalho do evento
 * (`jornada_dias` não cancelados), cada um com a sua fase. Sem nenhuma linha
 * em `jornada_dias` (evento antigo), cai no período data_inicio → data_fim.
 */
export async function diasDaEscalaDoEvento(eventoId: string): Promise<DiaDaEscala[]> {
  const { data: linhas } = await supabaseAdmin
    .from('jornada_dias').select('data, tipo').eq('evento_id', eventoId).eq('cancelado', false).order('data')

  let datas = [...new Set((linhas ?? []).map(l => l.data as string))].sort()
  let principais = [...new Set((linhas ?? []).filter(l => l.tipo === 'principal').map(l => l.data as string))]

  if (!datas.length) {
    const { data: evento } = await supabaseAdmin
      .from('eventos').select('data_inicio, data_fim').eq('id', eventoId).maybeSingle()
    const periodo = evento ? periodoDoEvento(evento) : null
    if (!periodo) return []
    datas = []
    for (let d = periodo.primeiro; d <= periodo.ultimo; d = somarDias(d, 1)) datas.push(d)
    principais = [periodo.primeiro]
  }

  return datas.map(data => ({ data, fase: faseDoDia(data, principais) }))
}

export type EscalaDoFuncionario = {
  status: StatusEscala | null
  decididaEm: string | null
  decididaPor: string | null
  dias: DiaEscolhido[]
}

/**
 * A escala de várias pessoas de uma vez (tela de aprovações). Ausente no Map
 * = fora do fluxo. Em lotes: um evento grande passa de 500 pessoas, e um
 * `in(...)` com todos os ids estoura o tamanho da URL do PostgREST.
 */
export async function escalasDosFuncionarios(funcionarioIds: string[]): Promise<Map<string, EscalaDoFuncionario>> {
  const resultado = new Map<string, EscalaDoFuncionario>()
  const LOTE = 150
  for (let i = 0; i < funcionarioIds.length; i += LOTE) {
    for (const [id, e] of await escalasDoLote(funcionarioIds.slice(i, i + LOTE))) resultado.set(id, e)
  }
  return resultado
}

async function escalasDoLote(funcionarioIds: string[]): Promise<Map<string, EscalaDoFuncionario>> {
  const resultado = new Map<string, EscalaDoFuncionario>()
  if (!funcionarioIds.length) return resultado
  try {
    const { data: funcs, error } = await supabaseAdmin
      .from('funcionarios').select('id, escala_status, escala_decidida_em, escala_decidida_por').in('id', funcionarioIds)
    if (error || !funcs) return resultado

    const comEscala = funcs.filter(f => statusEscalaValido(f.escala_status))
    if (!comEscala.length) return resultado

    const decisores = [...new Set(comEscala.map(f => f.escala_decidida_por as string | null).filter((v): v is string => !!v))]
    // Paginado: 150 pessoas × vários dias passa do teto de 1000 linhas por consulta.
    const [dias, { data: perfis }] = await Promise.all([
      buscarTudo<{ funcionario_id: string; data: string; selecionado: boolean; aprovado: boolean }>((de, ate) =>
        supabaseAdmin.from('funcionario_dias').select('funcionario_id, data, selecionado, aprovado')
          .in('funcionario_id', comEscala.map(f => f.id as string)).order('funcionario_id').order('data').range(de, ate)),
      decisores.length
        ? supabaseAdmin.from('perfis').select('id, nome').in('id', decisores)
        : Promise.resolve({ data: [] as { id: string; nome: string }[] }),
    ])
    const nome = new Map((perfis ?? []).map(p => [p.id as string, p.nome as string]))

    for (const f of comEscala) {
      resultado.set(f.id as string, {
        status: statusEscalaValido(f.escala_status),
        decididaEm: (f.escala_decidida_em as string | null) ?? null,
        decididaPor: f.escala_decidida_por ? (nome.get(f.escala_decidida_por as string) ?? null) : null,
        dias: (dias ?? []).filter(d => d.funcionario_id === f.id).map(d => ({
          data: d.data as string, selecionado: d.selecionado === true, aprovado: d.aprovado === true,
        })),
      })
    }
  } catch { /* migração pendente — ninguém tem escala */ }
  return resultado
}

/** O que o modal de aprovação recebe — ver `detalheDoCredenciamento` (lib/actions.ts). */
export type DetalheCredenciamento = {
  nome: string
  cpf: string
  telefone: string
  cidade: string | null
  cargo: string | null
  origem: string
  criadoEm: string
  fotoUrl: string | null
  setorNome: string
  subeventoNome: string | null
  status: 'pendente' | 'aprovado' | 'negado'
  motivoNegacao: string | null
  decididoEm: string | null
  decididoPor: string | null
  /** O evento usa escala por dia (ver `eventoUsaEscalaPorDia`). */
  usaEscala: boolean
  diasDoEvento: DiaDaEscala[]
  escala: EscalaDoFuncionario | null
  /** Dias em que o setor já tem o máximo de aprovados (sem contar esta pessoa). */
  lotados: string[]
  /** Supervisor (ver `pessoaEhSupervisor`) — sai aprovado para todos os dias, sem grade pra marcar. */
  ehSupervisor: boolean
}

export async function escalaDoFuncionario(funcionarioId: string): Promise<EscalaDoFuncionario | null> {
  return (await escalasDosFuncionarios([funcionarioId])).get(funcionarioId) ?? null
}

/** Coluna/tabela ainda não existe — a migração não rodou (Postgres 42703/42P01, PostgREST PGRST204/PGRST205). */
function ehMigracaoPendente(error: { code?: string } | null): boolean {
  return !!error && ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code ?? '')
}

const FALHA_AO_CONFERIR: VereditoEscala = {
  ok: false, titulo: 'Não foi possível conferir a escala.', mensagem: 'Tente ler o QR Code de novo em instantes.',
}

/**
 * A checagem do portão: esta pessoa pode trabalhar no dia `dia`?
 *
 *   * migração pendente, ou `escala_status` nulo  → liberado, exatamente como
 *     antes (evento normal nunca tem escala, então nunca para aqui);
 *   * evento deixou de ser de subeventos           → liberado (a regra só
 *     vale enquanto o evento estiver configurado assim);
 *   * pessoa no fluxo                              → só nos dias aprovados.
 *
 * Erro de banco que NÃO seja migração pendente recusa: na dúvida, um QR
 * condicionado à escala não abre o portão.
 */
export async function conferirEscalaNoDia(funcionarioId: string, eventoId: string, dia: string): Promise<VereditoEscala> {
  const { data: func, error } = await supabaseAdmin
    .from('funcionarios').select('escala_status').eq('id', funcionarioId).maybeSingle()
  if (ehMigracaoPendente(error)) return { ok: true }
  if (error) return FALHA_AO_CONFERIR
  const status = statusEscalaValido((func as { escala_status?: unknown } | null)?.escala_status)
  if (!status) return { ok: true }

  const [usaEscala, { data: dias, error: erroDias }] = await Promise.all([
    eventoUsaEscalaPorDia(eventoId),
    supabaseAdmin.from('funcionario_dias').select('data')
      .eq('funcionario_id', funcionarioId).eq('aprovado', true).eq('data', dia),
  ])
  if (!usaEscala) return { ok: true }
  if (erroDias) return FALHA_AO_CONFERIR
  return vereditoDaEscala({ status, diasAprovados: (dias ?? []).map(d => d.data as string) }, dia)
}

/** Grava os dias que a pessoa escolheu no formulário e coloca a escala em 'pendente'. */
export async function gravarDiasEscolhidos(
  funcionarioId: string, eventoId: string, dias: string[],
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const agora = new Date().toISOString()
  const { error } = await supabaseAdmin.from('funcionario_dias').insert(
    dias.map(data => ({ funcionario_id: funcionarioId, evento_id: eventoId, data, selecionado: true, selecionado_em: agora })),
  )
  if (error) return { ok: false, erro: error.message }
  const { error: erroStatus } = await supabaseAdmin
    .from('funcionarios').update({ escala_status: 'pendente' }).eq('id', funcionarioId)
  if (erroStatus) return { ok: false, erro: erroStatus.message }
  return { ok: true }
}

/**
 * O supervisor confirma (ou ajusta) os dias: `aprovados` passa a ser
 * EXATAMENTE a lista de dias em que o QR vale. O que a pessoa pediu fica
 * guardado (`selecionado`) — é o registro de quem escolheu o quê.
 *
 * Devolve os dias aprovados antes e depois, para a auditoria.
 */
export async function gravarEscalaAprovada(args: {
  funcionarioId: string; eventoId: string; aprovados: string[]; perfilId: string
}): Promise<{ ok: true; antes: string[]; depois: string[] } | { ok: false; erro: string }> {
  const { funcionarioId, eventoId, aprovados, perfilId } = args
  const agora = new Date().toISOString()

  const { data: existentes, error: erroLeitura } = await supabaseAdmin
    .from('funcionario_dias').select('data, selecionado, aprovado').eq('funcionario_id', funcionarioId)
  if (erroLeitura) return { ok: false, erro: erroLeitura.message }

  const atuais: DiaEscolhido[] = (existentes ?? []).map(d => ({
    data: d.data as string, selecionado: d.selecionado === true, aprovado: d.aprovado === true,
  }))
  const antes = atuais.filter(d => d.aprovado).map(d => d.data).sort()
  const { manter, remover } = planejarAprovacao(atuais, aprovados)

  if (manter.length) {
    const { error } = await supabaseAdmin.from('funcionario_dias').upsert(
      manter.map(d => ({
        funcionario_id: funcionarioId, evento_id: eventoId, data: d.data,
        selecionado: d.selecionado, aprovado: d.aprovado, decidido_por: perfilId, decidido_em: agora,
      })),
      { onConflict: 'funcionario_id,data' },
    )
    if (error) return { ok: false, erro: error.message }
  }
  if (remover.length) {
    const { error } = await supabaseAdmin
      .from('funcionario_dias').delete().eq('funcionario_id', funcionarioId).in('data', remover)
    if (error) return { ok: false, erro: error.message }
  }

  const { error: erroStatus } = await supabaseAdmin.from('funcionarios').update({
    escala_status: 'aprovada', escala_decidida_por: perfilId, escala_decidida_em: agora,
  }).eq('id', funcionarioId)
  if (erroStatus) return { ok: false, erro: erroStatus.message }

  return { ok: true, antes, depois: [...aprovados].sort() }
}

// ─── Trava do fornecedor por dia (supabase/upgrade-trava-por-dia.sql) ────────

/**
 * A trava de cada dia deste fornecedor ("Sábado: 10 / Domingo: 8", vinda da
 * importação de estrutura). Vazio = sem trava por dia. Tolerante à migração
 * pendente: sem a tabela, ninguém tem trava — tudo como antes.
 */
export async function travasDoFornecedor(fornecedorId: string): Promise<Map<string, number>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('fornecedor_cotas_dia').select('data, maximo').eq('fornecedor_id', fornecedorId)
    if (error) return new Map()
    return new Map((data ?? []).map(l => [l.data as string, l.maximo as number]))
  } catch {
    return new Map()
  }
}

/**
 * Os dias LOTADOS deste fornecedor.
 *
 *   'pedido'   — para o formulário: conta quem pediu o dia (ou já tem ele
 *                aprovado), fora os negados. Quem pediu ocupa a vaga enquanto
 *                o supervisor não decide; senão o dia "lotaria" só depois da
 *                aprovação e o formulário aceitaria gente demais.
 *   'aprovado' — para a aprovação: conta só os dias já APROVADOS dos outros.
 *
 * `ignorarFuncionarioId`: a própria pessoa não conta contra ela mesma.
 */
export async function diasLotados(
  fornecedorId: string, modo: 'pedido' | 'aprovado', ignorarFuncionarioId?: string,
): Promise<string[]> {
  // Trava por dia desligada (lib/escala-regras.ts): nenhum dia fica lotado.
  if (!TRAVA_POR_DIA_ATIVA) return []
  const travas = await travasDoFornecedor(fornecedorId)
  if (!travas.size) return []
  try {
    const linhas = await buscarTudo((de, ate) => supabaseAdmin
      .from('funcionario_dias')
      .select('funcionario_id, data, selecionado, aprovado, funcionarios!inner(fornecedor_id, status_credenciamento, escala_status)')
      .eq('funcionarios.fornecedor_id', fornecedorId)
      .in('data', [...travas.keys()])
      .order('id').range(de, ate))

    const ocupacao = new Map<string, number>()
    for (const l of linhas) {
      if (l.funcionario_id === ignorarFuncionarioId) continue
      const f = l.funcionarios as unknown as { status_credenciamento: string | null; escala_status: string | null } | null
      if (!f || f.status_credenciamento === 'negado') continue
      const ocupa = modo === 'aprovado'
        ? l.aprovado
        : (f.escala_status === 'aprovada' ? l.aprovado : l.selecionado)
      if (ocupa) ocupacao.set(l.data as string, (ocupacao.get(l.data as string) ?? 0) + 1)
    }
    return [...travas].filter(([dia, max]) => (ocupacao.get(dia) ?? 0) >= max).map(([dia]) => dia).sort()
  } catch {
    // Na dúvida não trava: a trava é limite de operação, não segurança — e
    // derrubar o cadastro de todo mundo por uma consulta falha é pior.
    return []
  }
}

/**
 * Grava a trava por dia de um fornecedor a partir do que o formulário trouxe:
 * dia com número = trava; dia em branco = sem trava (apaga a que existia).
 * Dia que não veio no formulário não é tocado. Falha de banco (migração
 * `upgrade-trava-por-dia.sql` pendente) devolve o erro — quem chama decide se
 * isso trava ou só avisa; o resto do cadastro do fornecedor já foi salvo.
 */
export async function gravarTravasDoFornecedor(
  fornecedorId: string, porDia: Record<string, number | null>,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const comTrava = Object.entries(porDia).filter((e): e is [string, number] => e[1] !== null)
  const semTrava = Object.entries(porDia).filter(([, v]) => v === null).map(([d]) => d)
  if (comTrava.length) {
    const { error } = await supabaseAdmin.from('fornecedor_cotas_dia').upsert(
      comTrava.map(([data, maximo]) => ({ fornecedor_id: fornecedorId, data, maximo, atualizado_em: new Date().toISOString() })),
      { onConflict: 'fornecedor_id,data' },
    )
    if (error) return { ok: false, erro: error.message }
  }
  if (semTrava.length) {
    const { error } = await supabaseAdmin.from('fornecedor_cotas_dia')
      .delete().eq('fornecedor_id', fornecedorId).in('data', semTrava)
    if (error) return { ok: false, erro: error.message }
  }
  return { ok: true }
}

/**
 * Ainda cabe mais UMA pessoa neste setor, neste dia? — a trava por dia no
 * PORTÃO (pedido do Juan, 06/10/2026): quando o setor já tem o máximo de
 * pessoas que ENTRARAM no dia, a próxima é barrada, mesmo aprovada e mesmo
 * escalada. Quem manda é a entrada de verdade (`registros`), não a escala.
 *
 *   * sem trava naquele dia (ou migração pendente) → cabe, como sempre;
 *   * quem JÁ entrou hoje nunca é barrado (reler o crachá não é nova entrada);
 *   * o crachá do supervisor não ocupa vaga nem é barrado — ele não é da
 *     equipe contada;
 *   * a consulta de contagem falhar → cabe (a trava é limite de operação: um
 *     erro de leitura não pode trancar o portão do evento inteiro).
 */
export async function vagaNoSetorNoDia(
  fornecedorId: string, dia: string, funcionarioId: string, origemDaPessoa?: string | null,
): Promise<{ ok: true } | { ok: false; maximo: number; ocupadas: number }> {
  if (!TRAVA_POR_DIA_ATIVA) return { ok: true }   // a quantidade por dia é livre: o portão não barra por lotação
  if (origemDaPessoa === 'supervisor') return { ok: true }
  try {
    const { data: trava, error } = await supabaseAdmin
      .from('fornecedor_cotas_dia').select('maximo').eq('fornecedor_id', fornecedorId).eq('data', dia).maybeSingle()
    if (error || !trava) return { ok: true }
    const maximo = trava.maximo as number

    const { data: jaEntrou } = await supabaseAdmin.from('registros').select('id')
      .eq('funcionario_id', funcionarioId).eq('tipo', 'entrada').eq('data_ref', dia).limit(1)
    if (jaEntrou?.length) return { ok: true }

    const { count, error: erroContagem } = await supabaseAdmin
      .from('registros')
      .select('funcionario_id, funcionarios!inner(fornecedor_id, origem)', { count: 'exact', head: true })
      .eq('tipo', 'entrada').eq('data_ref', dia).eq('funcionarios.fornecedor_id', fornecedorId)
      .or('origem.is.null,origem.neq.supervisor', { referencedTable: 'funcionarios' })
    if (erroContagem) return { ok: true }
    const ocupadas = count ?? 0
    return ocupadas >= maximo ? { ok: false, maximo, ocupadas } : { ok: true }
  } catch {
    return { ok: true }
  }
}

export type LinhaRelatorioTrava = {
  fornecedorId: string
  nome: string
  supervisores: string[]
  porDia: { data: string; maximo: number | null; aprovados: number }[]
  /** 'sem_trava' = nenhum dia tem limite; 'completa' = todos os dias têm; 'parcial' = só alguns. */
  situacao: 'sem_trava' | 'parcial' | 'completa'
}

export type RelatorioTravas = {
  dias: DiaDaEscala[]
  linhas: LinhaRelatorioTrava[]
}

/**
 * Quais fornecedores do evento têm (ou não) a trava por dia configurada, e quantos já estão aprovados em cada
 * dia — a pergunta do Juan, 08/10/2026: "um relatório com todos os setores que não estão com trava de
 * funcionários por dia". Agrupa em três situações pra a tela filtrar (sem_trava/parcial/completa).
 *
 * Em lotes (`emLotes`) em toda consulta por lista de ids: um evento grande passa de 1000 UUIDs na URL.
 */
export async function relatorioTravasPorDia(eventoId: string): Promise<RelatorioTravas> {
  const dias = await diasDaEscalaDoEvento(eventoId)
  const diasDatas = dias.map(d => d.data)

  const { data: fornecedoresRaw } = await supabaseAdmin
    .from('fornecedores').select('id, nome').eq('evento_id', eventoId).order('nome')
  const fornecedores = fornecedoresRaw ?? []
  const fornecedorIds = fornecedores.map(f => f.id as string)
  if (!fornecedorIds.length) return { dias, linhas: [] }

  const travas: { fornecedor_id: string; data: string; maximo: number }[] = []
  for (const lote of emLotes(fornecedorIds, 150)) {
    const { data } = await supabaseAdmin.from('fornecedor_cotas_dia').select('fornecedor_id, data, maximo').in('fornecedor_id', lote)
    travas.push(...(data ?? []) as typeof travas)
  }
  const travaPorChave = new Map(travas.map(t => [`${t.fornecedor_id}|${t.data}`, t.maximo]))

  // Supervisores de cada fornecedor — principal (perfis.fornecedor_id) + extras (supervisor_setores).
  const supervisoresPrincipais: { id: string; nome: string; fornecedor_id: string }[] = []
  for (const lote of emLotes(fornecedorIds, 150)) {
    const { data } = await supabaseAdmin.from('perfis').select('id, nome, fornecedor_id').eq('role', 'supervisor').in('fornecedor_id', lote)
    supervisoresPrincipais.push(...(data ?? []) as typeof supervisoresPrincipais)
  }
  const supervisorSetores: { fornecedor_id: string; perfil_id: string }[] = []
  for (const lote of emLotes(fornecedorIds, 150)) {
    const { data } = await supabaseAdmin.from('supervisor_setores').select('fornecedor_id, perfil_id').in('fornecedor_id', lote)
    supervisorSetores.push(...(data ?? []) as typeof supervisorSetores)
  }
  const idsExtras = [...new Set(supervisorSetores.map(s => s.perfil_id))]
  const nomesExtras: { id: string; nome: string }[] = []
  for (const lote of emLotes(idsExtras, 150)) {
    const { data } = await supabaseAdmin.from('perfis').select('id, nome').in('id', lote)
    nomesExtras.push(...(data ?? []) as typeof nomesExtras)
  }
  const nomeDoSupervisor = new Map(nomesExtras.map(s => [s.id, s.nome]))
  for (const s of supervisoresPrincipais) nomeDoSupervisor.set(s.id, s.nome)
  const supervisoresPorFornecedor = new Map<string, Set<string>>()
  const adicionarSupervisor = (fornecedorId: string, perfilId: string) => {
    const set = supervisoresPorFornecedor.get(fornecedorId) ?? new Set<string>()
    set.add(perfilId)
    supervisoresPorFornecedor.set(fornecedorId, set)
  }
  for (const s of supervisoresPrincipais) adicionarSupervisor(s.fornecedor_id, s.id)
  for (const row of supervisorSetores) adicionarSupervisor(row.fornecedor_id, row.perfil_id)

  // Ocupação (aprovados) por fornecedor+dia — mesma régua de `diasLotados` (modo 'aprovado'), para todos de uma vez.
  const funcionarios: { id: string; fornecedor_id: string; status_credenciamento: string | null }[] = []
  for (const lote of emLotes(fornecedorIds, 150)) {
    const { data } = await supabaseAdmin.from('funcionarios').select('id, fornecedor_id, status_credenciamento').in('fornecedor_id', lote)
    funcionarios.push(...(data ?? []) as typeof funcionarios)
  }
  const funcMap = new Map(funcionarios.map(f => [f.id, f]))
  const funcIds = funcionarios.map(f => f.id)

  const diasAprovados: { funcionario_id: string; data: string; aprovado: boolean }[] = []
  for (const lote of emLotes(funcIds, 150)) {
    const { data } = await supabaseAdmin.from('funcionario_dias').select('funcionario_id, data, aprovado').in('funcionario_id', lote).in('data', diasDatas)
    diasAprovados.push(...(data ?? []) as typeof diasAprovados)
  }
  const ocupacao = new Map<string, number>()
  for (const d of diasAprovados) {
    if (!d.aprovado) continue
    const f = funcMap.get(d.funcionario_id)
    if (!f || f.status_credenciamento === 'negado') continue
    const chave = `${f.fornecedor_id}|${d.data}`
    ocupacao.set(chave, (ocupacao.get(chave) ?? 0) + 1)
  }

  const linhas: LinhaRelatorioTrava[] = fornecedores.map(f => {
    const fornecedorId = f.id as string
    const porDia = diasDatas.map(data => ({
      data,
      maximo: travaPorChave.get(`${fornecedorId}|${data}`) ?? null,
      aprovados: ocupacao.get(`${fornecedorId}|${data}`) ?? 0,
    }))
    const comTrava = porDia.filter(d => d.maximo != null).length
    const situacao: LinhaRelatorioTrava['situacao'] =
      comTrava === 0 ? 'sem_trava' : comTrava === porDia.length ? 'completa' : 'parcial'
    const sups = [...(supervisoresPorFornecedor.get(fornecedorId) ?? [])]
      .map(id => nomeDoSupervisor.get(id)).filter((n): n is string => !!n)
    return { fornecedorId, nome: f.nome as string, supervisores: [...new Set(sups)], porDia, situacao }
  })
  linhas.sort((a, b) => a.nome.localeCompare(b.nome))

  return { dias, linhas }
}
