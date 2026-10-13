'use server'
/**
 * Dados para o relatório de credenciamento — a fonte que alimenta a planilha
 * Excel em `lib/relatorio-excel.ts` (e o PDF de presença).
 *
 * `'use server'`: cada função exportada vira um endpoint próprio (o mesmo
 * detalhe que causou o achado de segurança 01 da auditoria — ver histórico
 * do projeto). Por isso as funções exportadas aqui SEMPRE começam checando
 * permissão via `exigirAcessoAoEvento`, nunca confiando em quem as chamou
 * pela tela.
 *
 * ─── DE ENXUTO A COMPLETO (12–13/10/2026) ────────────────────────────────
 *
 * Em 2025 a primeira versão foi cortada a pedido do Juan ("ficou muito
 * poluído") e ficou só com entrada e saída. No fechamento do VITAL o pedido
 * se inverteu: a planilha é o que fecha o PAGAMENTO, e precisa do meio, das
 * horas, do dia da semana, do CPF, da área (subgrupo), de quem lançou cada
 * batida à mão e por quê, do que foi batido fora do local (com prova) e de
 * quem está com baixa — sem perder nada. Os sete itens aprovados em
 * 12/10/2026 mais "senti falta do meio" e "o dia da semana na linha" (13/10).
 *
 * NADA aqui inventa informação. Cada campo vem de uma coluna real; quando o
 * dado não existe, o campo fica vazio — nunca um valor calculado que pareça
 * um registro.
 */
import { supabaseAdmin, buscarTudo } from './supabase-server'
import { emLotes } from './lotes'
import { diaBRT } from './janelas'
import { exigirAcessoAoEvento } from './relatorios-acesso'
import { linhasDoSetor, textoDoLancamento, type RegistroBruto, type PausaBruta, type FuncionarioBruto, type ContextoDoRelatorio, type LinhaEmMontagem } from './relatorio-linhas'
import { setoresComMeio, diasComMeio } from './meio'

export type Periodo = { de: string; ate: string }

/**
 * De onde veio a batida: o resumo da linha. 'normal' = leitor do portão (QR ou CPF) ou o celular da própria pessoa;
 * 'registrar' = "Registrar ponto" com foto (supervisor/operador); 'manual' = lançada à mão (Lançar ponto, correção no
 * histórico, saídas lançadas pelo suporte).
 */
export type OrigemDaLinha = 'normal' | 'registrar' | 'manual'

/** Uma linha do relatório detalhado: uma pessoa, num dia (um bloco do dia, se saiu e voltou), com as batidas. */
export type LinhaRelatorio = {
  funcionarioId: string
  nome: string
  setor: string
  /** `cargo` do cadastro — o "subsetor/função" pedido (ex.: Segurança, Bartender). */
  funcao: string
  dataRef: string
  entradaISO: string | null
  saidaISO: string | null
  cpf?: string | null
  /** O(s) meio(s) deste bloco, em ordem (meio por bloco: quem saiu e voltou bate de novo). */
  meiosISO?: string[]
  /** O setor e o dia pedem o meio e a pessoa não bateu nenhum no dia — marcado na primeira linha do dia. */
  semMeio?: boolean
  origem?: OrigemDaLinha
  /** As batidas da linha que não vieram do leitor nem do celular: etapa, como, quem lançou e o motivo. */
  lancamentos?: string[]
  /** As batidas da linha fora do local, com prova de GPS (precisão até 100 m): "Entrada a 1,2 km". */
  foraDoLocal?: string[]
  /** A pessoa está com baixa (saiu da equipe) — as batidas continuam no relatório. */
  baixaEm?: string | null
}

/** Alguém da equipe que NÃO registrou nada no período — o avesso do relatório. */
export type AusenteRelatorio = {
  funcionarioId: string
  nome: string
  setor: string
  funcao: string
  cpf?: string | null
  baixaEm?: string | null
}

/** A equipe inteira, com os dados de pagamento do cadastro — a aba "Pagamento". */
export type PessoaRelatorio = {
  funcionarioId: string
  nome: string
  cpf: string | null
  funcao: string
  chavePix: string | null
  valorReceber: number | null
  pago: boolean
  pagoEm: string | null
  baixaEm: string | null
}

export type SetorRelatorio = {
  id: string
  nome: string
  /** O subgrupo (subevento) do fornecedor — no VITAL há três "NASCIMENTO", um em cada subgrupo. */
  area?: string | null
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
  pessoas?: PessoaRelatorio[]
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

async function contextoDoRelatorio(eventoId: string, fornecedorIds: string[]): Promise<ContextoDoRelatorio> {
  const [{ data: ev }, comMeio, diasMeio] = await Promise.all([
    supabaseAdmin.from('eventos').select('local_latitude, local_longitude, local_raio_m').eq('id', eventoId).maybeSingle(),
    setoresComMeio(fornecedorIds).catch(() => new Set<string>()),
    diasComMeio(eventoId).catch(() => ({ ok: false, dias: new Set<string>() })),
  ])
  const local = ev?.local_latitude != null && ev?.local_longitude != null
    ? { latitude: Number(ev.local_latitude), longitude: Number(ev.local_longitude), raioM: Number(ev.local_raio_m ?? 800) }
    : null
  return { local, comMeio, diasMeio }
}

/** Uma consulta com colunas novas que pode falhar antes da migração: tenta da mais completa para a mais simples. */
async function comColunasTolerantes<T>(opcoes: string[], buscar: (colunas: string) => Promise<T>): Promise<T> {
  let ultimoErro: unknown
  for (const colunas of opcoes) {
    try { return await buscar(colunas) } catch (e) { ultimoErro = e }
  }
  throw ultimoErro
}

const COLUNAS_REGISTRO = [
  'id, funcionario_id, tipo, data_ref, created_at, registro_manual, justificativa, criado_por_perfil_id, foto_url, latitude, longitude, precisao_m, distancia_m, fora_do_local',
  'id, funcionario_id, tipo, data_ref, created_at, registro_manual, justificativa, criado_por_perfil_id, foto_url',
  'funcionario_id, tipo, data_ref, created_at',
]
// `meio_em` só existe depois de supabase/upgrade-meio-por-bloco.sql.
const COLUNAS_PAUSA = [
  'funcionario_id, data_ref, saiu_em, voltou_em, origem, registrado_por, meio_em',
  'funcionario_id, data_ref, saiu_em, voltou_em, origem, registrado_por',
  'funcionario_id, data_ref, saiu_em, voltou_em',
]
const COLUNAS_FUNCIONARIO = [
  'id, nome, cargo, cpf, chave_pix, valor_receber, pago, pago_em, descredenciado_em',
  'id, nome, cargo, cpf, descredenciado_em',
  'id, nome, cargo',
]

/** Carrega os dados de UM setor, dentro do período — o setor individual ou uma aba do completo. */
async function carregarSetor(
  fornecedorId: string, periodo: Periodo, ctx: ContextoDoRelatorio,
): Promise<{ setor: SetorRelatorio; emMontagem: LinhaEmMontagem[] } | null> {
  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores').select('id, nome, subeventos(nome)').eq('id', fornecedorId).single()
  if (!fornecedor) return null
  const area = (fornecedor.subeventos as unknown as { nome?: string } | null)?.nome?.trim() || null

  /*
   * PAGINADO (`buscarTudo`): o Supabase corta em 1000 linhas por resposta sem
   * avisar, e um setor grande passa disso — o resto da equipe sumiria da
   * planilha (nem nas linhas, nem nos ausentes). `id` desempata nomes iguais
   * pra as páginas não se sobreporem. Tolerante como antes: falhou, vem vazio.
   */
  const funcionarios = await comColunasTolerantes(COLUNAS_FUNCIONARIO, colunas =>
    buscarTudo<FuncionarioBruto>((de, ate) =>
      supabaseAdmin
        .from('funcionarios').select(colunas).eq('fornecedor_id', fornecedorId)
        .order('nome').order('id').range(de, ate) as unknown as PromiseLike<{ data: FuncionarioBruto[] | null; error: { message: string } | null }>,
    ),
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
        comColunasTolerantes(COLUNAS_REGISTRO, colunas =>
          Promise.all(lotes.map(lote =>
            buscarTudo<RegistroBruto>((de, ate) =>
              supabaseAdmin.from('registros')
                .select(colunas)
                .in('funcionario_id', lote)
                .in('tipo', ['entrada', 'meio', 'fim'])
                .gte('data_ref', periodo.de)
                .lte('data_ref', periodo.ate)
                .order('id')
                .range(de, ate) as unknown as PromiseLike<{ data: RegistroBruto[] | null; error: { message: string } | null }>,
            ),
          )).then(partes => partes.flat()),
        ).catch(() => null),
        // Tolerante: sem a tabela (upgrade-pausas-turno.sql), vem vazio — mesmo padrão de `historico.ts`.
        comColunasTolerantes(COLUNAS_PAUSA, colunas =>
          Promise.all(lotes.map(lote =>
            buscarTudo<PausaBruta>((de, ate) =>
              supabaseAdmin.from('pausas_turno')
                .select(colunas)
                .in('funcionario_id', lote)
                .gte('data_ref', periodo.de)
                .lte('data_ref', periodo.ate)
                .order('id')
                .range(de, ate) as unknown as PromiseLike<{ data: PausaBruta[] | null; error: { message: string } | null }>,
            ),
          )).then(partes => partes.flat()),
        ).catch(() => [] as PausaBruta[]),
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
  const emMontagem = linhasDoSetor(equipe, porFuncionario, pausasPorFuncionario, { id: fornecedor.id, nome: fornecedor.nome }, ctx)
  return {
    emMontagem,
    setor: {
      id: fornecedor.id,
      nome: fornecedor.nome,
      area,
      linhas: emMontagem.map(x => x.linha),
      // O avesso, da mesma fonte: quem não tem nenhum registro no período.
      ausentes: equipe
        .filter(f => !(porFuncionario.get(f.id) ?? []).length)
        .map(f => ({
          funcionarioId: f.id,
          nome: f.nome,
          setor: fornecedor.nome,
          funcao: f.cargo ?? '',
          cpf: f.cpf ?? null,
          baixaEm: f.descredenciado_em ?? null,
        })),
      pessoas: equipe.map(f => ({
        funcionarioId: f.id,
        nome: f.nome,
        cpf: f.cpf ?? null,
        funcao: f.cargo ?? '',
        chavePix: (f.chave_pix ?? '').trim() || null,
        // 0 é o padrão da coluna ("não informado"), não um valor combinado: fica vazio na planilha, não "R$ 0,00".
        valorReceber: Number(f.valor_receber) > 0 ? Number(f.valor_receber) : null,
        pago: f.pago === true,
        pagoEm: f.pago_em ?? null,
        baixaEm: f.descredenciado_em ?? null,
      })),
    },
  }
}

/**
 * Fecha as linhas: troca o id de quem lançou cada batida pelo nome (UMA consulta para o relatório inteiro, não uma por
 * setor) e escreve o lançamento por extenso — "Saída: lançada à mão por Juan Muzy — esqueceu de bater".
 */
async function escreverLancamentos(emMontagem: LinhaEmMontagem[]): Promise<void> {
  const ids = [...new Set(emMontagem.flatMap(x => x.lancamentos.map(l => l.perfilId)).filter((v): v is string => !!v))]
  const nomes = new Map<string, string>()
  for (const lote of emLotes(ids)) {
    const { data } = await supabaseAdmin.from('perfis').select('id, nome').in('id', lote)
    for (const p of data ?? []) nomes.set(p.id as string, p.nome as string)
  }
  for (const x of emMontagem) x.linha.lancamentos = x.lancamentos.map(l => textoDoLancamento(l, nomes))
}

/** Carrega os setores pedidos com o contexto do evento (buscado uma vez) e os nomes de quem lançou (uma consulta). */
async function carregarSetores(eventoId: string, fornecedorIds: string[], periodo: Periodo): Promise<SetorRelatorio[]> {
  const ctx = await contextoDoRelatorio(eventoId, fornecedorIds)
  const carregados = (await Promise.all(fornecedorIds.map(id => carregarSetor(id, periodo, ctx))))
    .filter((s): s is NonNullable<typeof s> => s !== null)
  await escreverLancamentos(carregados.flatMap(c => c.emMontagem))
  return carregados.map(c => c.setor)
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

  const { data: confere } = await supabaseAdmin.from('fornecedores').select('evento_id').eq('id', fornecedorId).maybeSingle()
  if (!confere) return { erro: 'Fornecedor não encontrado.' }
  if (confere.evento_id !== eventoId) return { erro: 'Este fornecedor não pertence a este evento.' }

  const periodo = await resolverPeriodo(eventoId, periodoPedido)
  const [setor] = await carregarSetores(eventoId, [fornecedorId], periodo)
  if (!setor) return { erro: 'Fornecedor não encontrado.' }

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
  const setores = await carregarSetores(eventoId, (fornecedores ?? []).map(f => f.id as string), periodo)

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
  setores: { id: string; nome: string; area: string | null }[]
  totalFuncionarios: number
  /** Quem gerencia o evento inteiro (não só setores dele) — vê o PDF de entrega de valor e todos os relatórios. */
  eventoInteiro: boolean
  /** Os subgrupos (subeventos) com fornecedor — só pra quem gerencia o evento inteiro; vazio nos outros casos. */
  subgrupos: { id: string; nome: string; fornecedores: number }[]
} | { erro: string }> {
  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) return { erro: acesso.erro }

  let query = supabaseAdmin.from('fornecedores').select('id, nome, subevento_id, subeventos(nome), funcionarios(count)').eq('evento_id', eventoId)
  if (acesso.setoresPermitidos) query = query.in('id', [...acesso.setoresPermitidos])
  const [{ data: fornecedores }, periodoCompleto] = await Promise.all([
    query.order('nome'),
    resolverPeriodo(eventoId),
  ])

  /*
   * Com o subgrupo junto (Juan, 13/10/2026: "preciso que apareça aqui o subgrupo junto com nome do setor") — no VITAL
   * há três "NASCIMENTO" (Empresariais, Muvuka e Geral) e a lista mostrava os três iguais.
   */
  const setores = (fornecedores ?? [])
    .map(f => ({ id: f.id as string, nome: (f.nome as string).trim(), area: (f.subeventos as unknown as { nome?: string } | null)?.nome?.trim() || null }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || (a.area ?? '').localeCompare(b.area ?? '', 'pt-BR'))
  const totalFuncionarios = (fornecedores ?? []).reduce((acc, f) => acc + (f.funcionarios?.[0]?.count ?? 0), 0)

  /*
   * "Relatório por subgrupo" na tela de relatórios (pedido do Juan, 11/10/2026: "no relatório falta a opção de aparecer
   * subgrupo também") — o mesmo relatório do subevento que já saía de dentro da tela do subgrupo. Só pra quem gerencia o
   * evento inteiro, a mesma régua de `obterDadosRelatorioSubevento`.
   */
  const eventoInteiro = !acesso.setoresPermitidos
  let subgrupos: { id: string; nome: string; fornecedores: number }[] = []
  if (eventoInteiro) {
    const porSubgrupo = new Map<string, number>()
    for (const f of fornecedores ?? []) {
      const sid = (f as { subevento_id?: string | null }).subevento_id
      if (sid) porSubgrupo.set(sid, (porSubgrupo.get(sid) ?? 0) + 1)
    }
    if (porSubgrupo.size) {
      const { data: subs } = await supabaseAdmin.from('subeventos').select('id, nome').in('id', [...porSubgrupo.keys()]).order('nome')
      subgrupos = (subs ?? []).map(sb => ({ id: sb.id as string, nome: sb.nome as string, fornecedores: porSubgrupo.get(sb.id as string) ?? 0 }))
    }
  }

  return { eventoNome: acesso.evento.nome, periodoCompleto, setores, totalFuncionarios, eventoInteiro, subgrupos }
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

export type BatidaDoDia = {
  dia: string; entradaISO: string | null; meioISO: string | null; saidaISO: string | null
  /** O meio de cada bloco que terminou numa pausa (saiu e voltou pra trabalhar de novo — meio por bloco). */
  meiosAnterioresISO?: string[]
}

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
  /**
   * As mesmas linhas do relatório completo (por bloco, com meio, horas, origem, fora do local e os dados de pagamento),
   * pras abas "Batidas" e "Pagamento" do subgrupo saírem iguais às do completo (Juan, 13/10/2026).
   */
  setoresRelatorio?: SetorRelatorio[]
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
      // Meio por bloco: o meio de cada bloco que terminou numa pausa fica na pausa. Sem a coluna, nada a somar.
      const { data: pausasComMeio, error: erroPausasMeio } = await supabaseAdmin.from('pausas_turno')
        .select('funcionario_id, data_ref, meio_em')
        .in('funcionario_id', lote).not('meio_em', 'is', null)
        .gte('data_ref', periodo.de).lte('data_ref', periodo.ate)
      if (!erroPausasMeio) {
        for (const p of pausasComMeio ?? []) {
          const dias = porPessoaDia.get(p.funcionario_id as string) ?? new Map<string, BatidaDoDia>()
          const b = dias.get(p.data_ref as string) ?? { dia: p.data_ref as string, entradaISO: null, meioISO: null, saidaISO: null }
          b.meiosAnterioresISO = [...(b.meiosAnterioresISO ?? []), p.meio_em as string].sort()
          dias.set(p.data_ref as string, b)
          porPessoaDia.set(p.funcionario_id as string, dias)
        }
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

    // As linhas completas (as mesmas do relatório completo) pras abas "Batidas" e "Pagamento".
    const setoresRelatorio = await carregarSetores(eventoId, idsSetores, periodo)

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
        setoresRelatorio,
      },
    }
  } catch (e) {
    return { erro: e instanceof Error ? e.message : 'Não foi possível montar o relatório do subevento.' }
  }
}
