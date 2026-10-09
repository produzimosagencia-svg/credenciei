'use server'
/**
 * Dados para o relatório de credenciamento — a fonte que alimenta a planilha
 * Excel em `lib/relatorio-excel.ts`.
 *
 * `'use server'`: cada função exportada vira um endpoint próprio (o mesmo
 * detalhe que causou o achado de segurança 01 da auditoria — ver histórico
 * do projeto). Por isso as funções exportadas aqui SEMPRE começam checando
 * permissão via `exigirAcessoAoEvento`, nunca confiando em quem as chamou
 * pela tela.
 *
 * ─── SIMPLIFICADO A PEDIDO DO JUAN ───────────────────────────────────────
 *
 * A primeira versão respondia tudo — meio, método de cada batida, status,
 * justificativa — e virou o problema que ela tentava resolver: "ficou muito
 * poluído e com excesso de informações". O pedido foi explícito: um gestor
 * administrativo precisa responder rápido só a oito perguntas (quem entrou,
 * quem saiu, quando, em qual setor, em qual função, quantos entraram, quantos
 * saíram, qual período) — o resto foi cortado, não escondido atrás de uma
 * aba extra. Meio saiu inteiro: não é credenciamento de entrada/saída, que é
 * o que este relatório existe pra mostrar.
 *
 * NADA aqui inventa informação. Cada campo vem de uma coluna real; quando o
 * dado não existe, o campo fica vazio — nunca um valor calculado que pareça
 * um registro.
 */
import { supabaseAdmin, buscarTudo } from './supabase-server'
import { emLotes } from './lotes'
import { diaBRT } from './janelas'
import { exigirAcessoAoEvento } from './relatorios-acesso'

export type Periodo = { de: string; ate: string }

/** Uma linha do relatório detalhado: uma pessoa, num dia, com entrada e saída. */
export type LinhaRelatorio = {
  funcionarioId: string
  nome: string
  setor: string
  /** `cargo` do cadastro — o "subsetor/função" pedido (ex.: Segurança, Bartender). */
  funcao: string
  dataRef: string
  entradaISO: string | null
  saidaISO: string | null
}

/** Alguém da equipe que NÃO registrou nada no período — o avesso do relatório. */
export type AusenteRelatorio = {
  funcionarioId: string
  nome: string
  setor: string
  funcao: string
}

export type SetorRelatorio = {
  id: string
  nome: string
  linhas: LinhaRelatorio[]
  /*
   * Quem estava escalado no setor e não bateu NADA no período.
   *
   * Vem junto de `linhas`, da mesma consulta, porque é literalmente o
   * complemento dela: `linhas` guarda quem tem registro, `ausentes` quem
   * não tem. Calcular depois exigiria buscar a equipe de novo e refazer a
   * subtração — e as duas listas poderiam divergir se alguém batesse ponto
   * no meio do caminho.
   */
  ausentes: AusenteRelatorio[]
}

export type DadosRelatorioEvento = {
  eventoId: string
  eventoNome: string
  organizacaoNome: string | null
  /** O período EFETIVAMENTE analisado — o pedido, recortado pelo período real do evento. */
  periodo: Periodo
  setores: SetorRelatorio[]
}

/**
 * O período completo de operação do evento — dos dias de `jornada_dias`
 * (que incluem montagem e desmontagem), não só `data_inicio`/`data_fim` (que
 * é só o dia do show). É o que a tela usa como intervalo padrão do filtro, e
 * o teto que recorta um período pedido fora da faixa real do evento.
 */
async function periodoCompletoDoEvento(eventoId: string): Promise<Periodo | null> {
  const { data } = await supabaseAdmin
    .from('jornada_dias').select('data').eq('evento_id', eventoId).eq('cancelado', false).order('data')
  const dias = (data ?? []).map(d => d.data as string)
  if (!dias.length) return null
  return { de: dias[0], ate: dias[dias.length - 1] }
}

/** "YYYY-MM-DD" válido? Único formato que `data_ref` usa — filtro maldito não passa disso. */
function dataValida(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

/**
 * O período a aplicar: o pedido, recortado pelos limites reais do evento.
 * Sem pedido nenhum, o período completo. Evento sem nenhum dia configurado
 * (caso raro, cadastro incompleto) cai num período de hoje só, pra nunca
 * devolver TUDO sem intenção.
 */
async function resolverPeriodo(eventoId: string, pedido?: Periodo): Promise<Periodo> {
  const completo = await periodoCompletoDoEvento(eventoId)
  const hoje = diaBRT()
  const teto = completo ?? { de: hoje, ate: hoje }

  if (!pedido || !dataValida(pedido.de) || !dataValida(pedido.ate)) return teto

  const de = pedido.de < teto.de ? teto.de : pedido.de
  const ate = pedido.ate > teto.ate ? teto.ate : pedido.ate
  return de <= ate ? { de, ate } : teto
}

type RegistroBruto = { funcionario_id: string; tipo: string; data_ref: string | null; created_at: string }
type PausaBruta = { funcionario_id: string; data_ref: string; saiu_em: string; voltou_em: string }

/**
 * Monta as linhas de um setor, já dentro do período: uma por (funcionário,
 * dia) em que houve entrada OU saída — ou MAIS de uma, se houve pausa (ver
 * abaixo). Quem não registrou nada no período simplesmente não aparece — é
 * o que mantém a tabela enxuta (o pedido: "evitar transformar isso numa
 * tabela gigantesca e confusa"). O resumo por setor/função, calculado à
 * parte, é quem responde "quantos faltam".
 *
 * ─── PAUSA VIRA LINHA A MAIS (29/09/2026) ────────────────────────────────
 *
 * Sair e voltar no mesmo dia (ex.: duas diárias, tarde e noite) REABRE o
 * turno em vez de criar uma segunda entrada — o banco não aceita duas
 * entradas no mesmo `data_ref` (ver `inferirMomentoQR`). A saída do meio é
 * APAGADA de `registros` e sobrevive só em `pausas_turno`. Achado real do
 * Juan: o relatório de credenciamento só lia `registros`, então mostrava
 * uma pessoa "entrando" de tarde e "saindo" de madrugada, sem rastro
 * nenhum da volta pro trabalho à noite — como se tivesse sido um turno
 * único de 20h, quando na verdade foram duas diárias separadas.
 *
 * A correção: cada pausa do dia parte a linha em duas — a entrada original
 * até o horário em que saiu, e de quando voltou até a saída final (ou até
 * a pausa seguinte, se houve mais de uma). `historico.ts` já faz o mesmo
 * cálculo pro modal de uma pessoa; aqui é a versão pro relatório de todos.
 */
function linhasDoSetor(
  funcionarios: { id: string; nome: string; cargo: string | null }[],
  registrosPorFuncionario: Map<string, RegistroBruto[]>,
  pausasPorFuncionario: Map<string, PausaBruta[]>,
  nomeSetor: string,
): LinhaRelatorio[] {
  const linhas: LinhaRelatorio[] = []

  for (const f of funcionarios) {
    const registros = registrosPorFuncionario.get(f.id) ?? []
    if (!registros.length) continue

    const porDia = new Map<string, RegistroBruto[]>()
    for (const r of registros) {
      if (!r.data_ref) continue
      const grupo = porDia.get(r.data_ref) ?? []
      grupo.push(r)
      porDia.set(r.data_ref, grupo)
    }

    const pausas = pausasPorFuncionario.get(f.id) ?? []

    for (const [dia, doDia] of [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const entradaOriginal = doDia.find(r => r.tipo === 'entrada')?.created_at ?? null
      const saidaFinal = doDia.find(r => r.tipo === 'fim')?.created_at ?? null
      const pausasDoDia = pausas.filter(p => p.data_ref === dia).sort((a, b) => a.saiu_em.localeCompare(b.saiu_em))

      let entradaDaVez = entradaOriginal
      for (const p of pausasDoDia) {
        linhas.push({
          funcionarioId: f.id, nome: f.nome, setor: nomeSetor, funcao: f.cargo ?? '',
          dataRef: dia, entradaISO: entradaDaVez, saidaISO: p.saiu_em,
        })
        entradaDaVez = p.voltou_em
      }
      linhas.push({
        funcionarioId: f.id, nome: f.nome, setor: nomeSetor, funcao: f.cargo ?? '',
        dataRef: dia, entradaISO: entradaDaVez, saidaISO: saidaFinal,
      })
    }
  }

  return linhas
}

/** Carrega os dados de UM setor, dentro do período — o setor individual ou uma aba do completo. */
async function carregarSetor(fornecedorId: string, periodo: Periodo): Promise<SetorRelatorio | null> {
  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores').select('id, nome').eq('id', fornecedorId).single()
  if (!fornecedor) return null

  /*
   * PAGINADO (`buscarTudo`): o Supabase corta em 1000 linhas por resposta sem
   * avisar, e um setor grande passa disso — o resto da equipe sumiria da
   * planilha (nem nas linhas, nem nos ausentes). `id` desempata nomes iguais
   * pra as páginas não se sobreporem. Tolerante como antes: falhou, vem vazio.
   */
  const funcionarios = await buscarTudo<{ id: string; nome: string; cargo: string | null }>((de, ate) =>
    supabaseAdmin
      .from('funcionarios').select('id, nome, cargo').eq('fornecedor_id', fornecedorId)
      .order('nome').order('id').range(de, ate),
  ).catch(() => null)

  /*
   * Batidas e pausas do período inteiro, EM LOTES de 200 ids e paginadas.
   *
   * Duas travas do Supabase ao mesmo tempo: o `.in('funcionario_id', ids)` vai
   * na URL, e com milhares de UUIDs ela passa de ~16KB e a consulta falha
   * inteira (`data: null` — a planilha sairia com todo mundo "ausente"); e
   * cada resposta para em 1000 linhas, que um setor grande em vários dias
   * passa fácil (~3 batidas por pessoa por dia). Os lotes são concatenados;
   * a ordem não importa, porque tudo é agrupado por pessoa e dia logo abaixo.
   */
  const ids = (funcionarios ?? []).map(f => f.id)
  const lotes = emLotes(ids)
  const [registros, pausasBrutas] = ids.length
    ? await Promise.all([
        Promise.all(lotes.map(lote =>
          buscarTudo<RegistroBruto>((de, ate) =>
            supabaseAdmin.from('registros')
              .select('funcionario_id, tipo, data_ref, created_at')
              .in('funcionario_id', lote)
              .in('tipo', ['entrada', 'fim'])
              .gte('data_ref', periodo.de)
              .lte('data_ref', periodo.ate)
              .order('id')
              .range(de, ate),
          ),
        )).then(partes => partes.flat(), () => null),
        // Tolerante: sem a tabela (upgrade-pausas-turno.sql), vem vazio —
        // mesmo padrão de `historico.ts`.
        Promise.all(lotes.map(lote =>
          buscarTudo<PausaBruta>((de, ate) =>
            supabaseAdmin.from('pausas_turno')
              .select('funcionario_id, data_ref, saiu_em, voltou_em')
              .in('funcionario_id', lote)
              .gte('data_ref', periodo.de)
              .lte('data_ref', periodo.ate)
              .order('id')
              .range(de, ate),
          ),
        )).then(partes => partes.flat(), () => [] as PausaBruta[]),
      ])
    : [[] as RegistroBruto[], [] as PausaBruta[]]

  const porFuncionario = new Map<string, RegistroBruto[]>()
  for (const r of (registros ?? []) as RegistroBruto[]) {
    const arr = porFuncionario.get(r.funcionario_id) ?? []
    arr.push(r)
    porFuncionario.set(r.funcionario_id, arr)
  }

  const pausasPorFuncionario = new Map<string, PausaBruta[]>()
  for (const p of (pausasBrutas ?? []) as PausaBruta[]) {
    const arr = pausasPorFuncionario.get(p.funcionario_id) ?? []
    arr.push(p)
    pausasPorFuncionario.set(p.funcionario_id, arr)
  }

  const equipe = funcionarios ?? []
  return {
    id: fornecedor.id,
    nome: fornecedor.nome,
    linhas: linhasDoSetor(equipe, porFuncionario, pausasPorFuncionario, fornecedor.nome),
    // O avesso, da mesma fonte: quem não tem nenhum registro no período.
    ausentes: equipe
      .filter(f => !(porFuncionario.get(f.id) ?? []).length)
      .map(f => ({
        funcionarioId: f.id,
        nome: f.nome,
        setor: fornecedor.nome,
        funcao: f.cargo ?? '',
      })),
  }
}

/** Dados do relatório de UM setor. */
export async function obterDadosRelatorioSetor(
  eventoId: string, fornecedorId: string, periodoPedido?: Periodo,
): Promise<{ dados: DadosRelatorioEvento } | { erro: string }> {
  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) return { erro: acesso.erro }
  if (acesso.setoresPermitidos && !acesso.setoresPermitidos.has(fornecedorId)) {
    return { erro: 'Sem permissão sobre este fornecedor.' }
  }

  const periodo = await resolverPeriodo(eventoId, periodoPedido)
  const setor = await carregarSetor(fornecedorId, periodo)
  if (!setor) return { erro: 'Fornecedor não encontrado.' }
  const { data: confere } = await supabaseAdmin.from('fornecedores').select('evento_id').eq('id', fornecedorId).single()
  if (confere?.evento_id !== eventoId) return { erro: 'Este fornecedor não pertence a este evento.' }

  return {
    dados: {
      eventoId,
      eventoNome: acesso.evento.nome,
      organizacaoNome: acesso.evento.organizacoes?.nome ?? null,
      periodo,
      setores: [setor],
    },
  }
}

/**
 * Dados do relatório COMPLETO do evento — todos os setores, cada um vira uma
 * aba. Supervisor nunca chega aqui: `exigirAcessoAoEvento` só libera
 * `setoresPermitidos: null` para quem gerencia o evento inteiro.
 */
export async function obterDadosRelatorioEvento(
  eventoId: string, periodoPedido?: Periodo,
): Promise<{ dados: DadosRelatorioEvento } | { erro: string }> {
  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) return { erro: acesso.erro }
  if (acesso.setoresPermitidos) return { erro: 'O relatório completo é só para quem gerencia o evento inteiro.' }

  const periodo = await resolverPeriodo(eventoId, periodoPedido)
  const { data: fornecedores } = await supabaseAdmin
    .from('fornecedores').select('id').eq('evento_id', eventoId).order('created_at')
  const setores = (
    await Promise.all((fornecedores ?? []).map(f => carregarSetor(f.id, periodo)))
  ).filter((s): s is SetorRelatorio => s !== null)

  return {
    dados: {
      eventoId,
      eventoNome: acesso.evento.nome,
      organizacaoNome: acesso.evento.organizacoes?.nome ?? null,
      periodo,
      setores,
    },
  }
}

/**
 * O resumo que alimenta a TELA de relatórios — setores, total de
 * funcionários e o período completo do evento (o padrão dos seletores de
 * data). Não a planilha: existe pra tela não precisar carregar o histórico
 * de presença inteiro só pra desenhar o formulário de exportação.
 */
export async function obterResumoParaTelaDeRelatorios(eventoId: string): Promise<{
  eventoNome: string
  periodoCompleto: Periodo
  setores: { id: string; nome: string }[]
  totalFuncionarios: number
  /** Quem gerencia o evento inteiro (não só setores dele) — vê o PDF de entrega de valor e todos os relatórios. */
  eventoInteiro: boolean
} | { erro: string }> {
  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) return { erro: acesso.erro }

  let query = supabaseAdmin.from('fornecedores').select('id, nome, funcionarios(count)').eq('evento_id', eventoId)
  if (acesso.setoresPermitidos) query = query.in('id', [...acesso.setoresPermitidos])
  const [{ data: fornecedores }, periodoCompleto] = await Promise.all([
    query.order('nome'),
    resolverPeriodo(eventoId),
  ])

  const setores = (fornecedores ?? []).map(f => ({ id: f.id as string, nome: f.nome as string }))
  const totalFuncionarios = (fornecedores ?? []).reduce((acc, f) => acc + (f.funcionarios?.[0]?.count ?? 0), 0)

  return { eventoNome: acesso.evento.nome, periodoCompleto, setores, totalFuncionarios, eventoInteiro: !acesso.setoresPermitidos }
}

// ════════════════════════════════════════════════════════════════════════
// RELATÓRIO COMPLETO DO SUBEVENTO
// ════════════════════════════════════════════════════════════════════════
//
// Pedido do Juan (08/10/2026): num subevento (o "Bloco", por exemplo) só dava para
// puxar o relatório setor por setor. Este é o do subevento INTEIRO: todos os fornecedores,
// os supervisores, quem já está autorizado e quem ainda está pré-autorizado (aguardando
// aprovação), os dias de trabalho e os horários das batidas.
//
// Diferente dos relatórios de cima — que são feitos de BATIDAS e por isso só listam quem
// bateu —, este parte da EQUIPE CADASTRADA: tem todo mundo, com a situação de cada um.

/** autorizado = aprovado; pre_autorizado = aguardando aprovação do supervisor. */
export type SituacaoNoRelatorio = 'autorizado' | 'pre_autorizado' | 'negado' | 'descredenciado'

export type BatidaDoDia = { dia: string; entradaISO: string | null; meioISO: string | null; saidaISO: string | null }

export type PessoaDoSubevento = {
  id: string
  nome: string
  cpf: string
  telefone: string
  funcao: string
  situacao: SituacaoNoRelatorio
  ativo: boolean
  /** Os dias que a pessoa pediu no cadastro e os que o supervisor confirmou. */
  diasSolicitados: string[]
  diasAprovados: string[]
  batidas: BatidaDoDia[]
}

export type SetorDoSubevento = {
  id: string
  nome: string
  previsto: number | null
  supervisores: { nome: string; telefone: string | null }[]
  pessoas: PessoaDoSubevento[]
}

export type DadosRelatorioSubevento = {
  eventoId: string
  eventoNome: string
  organizacaoNome: string | null
  subeventoNome: string
  periodo: Periodo
  setores: SetorDoSubevento[]
}

/**
 * Dados do relatório completo de UM subevento. Só para quem gerencia o evento inteiro
 * (o supervisor tem o relatório do próprio setor) — mesma régua de `obterDadosRelatorioEvento`.
 */
export async function obterDadosRelatorioSubevento(
  eventoId: string, subeventoId: string, periodoPedido?: Periodo,
): Promise<{ dados: DadosRelatorioSubevento } | { erro: string }> {
  try {
    const acesso = await exigirAcessoAoEvento(eventoId)
    if ('erro' in acesso) return { erro: acesso.erro }
    if (acesso.setoresPermitidos) return { erro: 'O relatório do subevento é só para quem gerencia o evento inteiro.' }

    const { data: sub } = await supabaseAdmin.from('subeventos').select('id, nome, evento_id').eq('id', subeventoId).maybeSingle()
    if (!sub || sub.evento_id !== eventoId) return { erro: 'Subevento não encontrado neste evento.' }

    const periodo = await resolverPeriodo(eventoId, periodoPedido)

    const { data: forns } = await supabaseAdmin
      .from('fornecedores').select('id, nome, quantidade_estimada').eq('subevento_id', subeventoId).order('nome')
    const fornecedores = (forns ?? []) as { id: string; nome: string; quantidade_estimada: number | null }[]
    const idsSetores = fornecedores.map(f => f.id)

    // Supervisores por setor.
    const supervisoresPorSetor = new Map<string, { nome: string; telefone: string | null }[]>()
    if (idsSetores.length) {
      const { data: vinculos } = await supabaseAdmin
        .from('supervisor_setores').select('fornecedor_id, perfis(nome, telefone)').in('fornecedor_id', idsSetores)
      for (const v of vinculos ?? []) {
        const p = v.perfis as unknown as { nome?: string; telefone?: string | null } | null
        if (!p?.nome) continue
        const lista = supervisoresPorSetor.get(v.fornecedor_id as string) ?? []
        if (!lista.some(x => x.nome === p.nome)) lista.push({ nome: p.nome, telefone: p.telefone ?? null })
        supervisoresPorSetor.set(v.fornecedor_id as string, lista)
      }
    }

    // A equipe cadastrada (paginada, em lotes de setor).
    type Func = {
      id: string; nome: string; cpf: string; telefone: string | null; cargo: string | null; ativo: boolean | null
      fornecedor_id: string; status_credenciamento: string | null; descredenciado_em: string | null
    }
    const equipe: Func[] = []
    for (const lote of emLotes(idsSetores, 100)) {
      equipe.push(...await buscarTudo<Func>((de, ate) =>
        supabaseAdmin.from('funcionarios')
          .select('id, nome, cpf, telefone, cargo, ativo, fornecedor_id, status_credenciamento, descredenciado_em')
          .in('fornecedor_id', lote).order('nome').order('id').range(de, ate)))
    }
    const idsPessoas = equipe.map(f => f.id)

    // Batidas do período (entrada, meio e saída final), em lotes — o `.in()` vai na URL.
    const porPessoaDia = new Map<string, Map<string, BatidaDoDia>>()
    for (const lote of emLotes(idsPessoas)) {
      const regs = await buscarTudo<RegistroBruto>((de, ate) =>
        supabaseAdmin.from('registros')
          .select('funcionario_id, tipo, data_ref, created_at')
          .in('funcionario_id', lote).in('tipo', ['entrada', 'meio', 'fim'])
          .gte('data_ref', periodo.de).lte('data_ref', periodo.ate)
          .order('id').range(de, ate)).catch(() => [] as RegistroBruto[])
      for (const r of regs) {
        if (!r.data_ref) continue
        const dias = porPessoaDia.get(r.funcionario_id) ?? new Map<string, BatidaDoDia>()
        const b = dias.get(r.data_ref) ?? { dia: r.data_ref, entradaISO: null, meioISO: null, saidaISO: null }
        if (r.tipo === 'entrada' && !b.entradaISO) b.entradaISO = r.created_at
        else if (r.tipo === 'meio' && !b.meioISO) b.meioISO = r.created_at
        else if (r.tipo === 'fim' && !b.saidaISO) b.saidaISO = r.created_at
        dias.set(r.data_ref, b)
        porPessoaDia.set(r.funcionario_id, dias)
      }
    }

    // Dias de trabalho de cada um (o que pediu e o que o supervisor aprovou). Tolerante: sem a tabela, vem vazio.
    const diasPorPessoa = new Map<string, { solicitados: string[]; aprovados: string[] }>()
    for (const lote of emLotes(idsPessoas)) {
      try {
        const dias = await buscarTudo<{ funcionario_id: string; data: string; selecionado: boolean; aprovado: boolean }>((de, ate) =>
          supabaseAdmin.from('funcionario_dias').select('funcionario_id, data, selecionado, aprovado')
            .in('funcionario_id', lote).order('funcionario_id').order('data').range(de, ate))
        for (const d of dias) {
          const acc = diasPorPessoa.get(d.funcionario_id) ?? { solicitados: [], aprovados: [] }
          if (d.selecionado) acc.solicitados.push(d.data)
          if (d.aprovado) acc.aprovados.push(d.data)
          diasPorPessoa.set(d.funcionario_id, acc)
        }
      } catch { /* migração dos dias por pessoa pendente */ }
    }

    const situacaoDe = (f: Func): SituacaoNoRelatorio => {
      if (f.descredenciado_em) return 'descredenciado'
      const s = f.status_credenciamento
      if (s === 'pendente') return 'pre_autorizado'
      if (s === 'negado') return 'negado'
      return 'autorizado'
    }

    const setores: SetorDoSubevento[] = fornecedores.map(forn => ({
      id: forn.id,
      nome: forn.nome.trim(),
      previsto: forn.quantidade_estimada ?? null,
      supervisores: supervisoresPorSetor.get(forn.id) ?? [],
      pessoas: equipe.filter(f => f.fornecedor_id === forn.id).map(f => ({
        id: f.id,
        nome: f.nome,
        cpf: f.cpf,
        telefone: f.telefone ?? '',
        funcao: f.cargo ?? '',
        situacao: situacaoDe(f),
        ativo: f.ativo !== false,
        diasSolicitados: diasPorPessoa.get(f.id)?.solicitados ?? [],
        diasAprovados: diasPorPessoa.get(f.id)?.aprovados ?? [],
        batidas: [...(porPessoaDia.get(f.id)?.values() ?? [])].sort((a, b) => a.dia.localeCompare(b.dia)),
      })),
    }))

    return {
      dados: {
        eventoId,
        eventoNome: acesso.evento.nome,
        organizacaoNome: acesso.evento.organizacoes?.nome ?? null,
        subeventoNome: sub.nome as string,
        periodo,
        setores,
      },
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Não foi possível montar o relatório do subevento.' }
  }
}
