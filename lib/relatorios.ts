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
import { getPerfil, supabaseAdmin, meusSetores } from './supabase-server'
import { podeGerenciarEventos, ehMaster } from './permissions'
import { diaBRT } from './janelas'

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
 * Confere se este perfil pode gerar relatório deste evento.
 *
 * Master: qualquer evento. Admin/gerente/cliente: só da própria organização.
 * Supervisor: só os setores dele mesmo (nunca o relatório completo do
 * evento) — a mesma régua de isolamento que o resto do sistema já aplica.
 */
type EventoParaRelatorio = {
  id: string
  nome: string
  organizacao_id: string | null
  organizacoes: { nome: string } | null
}

type AcessoRelatorio =
  | { erro: string }
  | { perfil: { role: string; organizacao_id: string | null }; evento: EventoParaRelatorio; setoresPermitidos: Set<string> | null }

async function exigirAcessoAoEvento(eventoId: string): Promise<AcessoRelatorio> {
  const perfil = await getPerfil()
  if (!perfil) return { erro: 'Não autenticado.' }

  const { data } = await supabaseAdmin
    .from('eventos')
    .select('id, nome, organizacao_id, organizacoes(nome)')
    .eq('id', eventoId)
    .single()
  if (!data) return { erro: 'Evento não encontrado.' }
  const evento = data as unknown as EventoParaRelatorio

  if (perfil.role === 'supervisor') {
    const meus = await meusSetores(perfil)
    if (!meus.some(s => s.evento_id === eventoId)) return { erro: 'Sem permissão sobre este evento.' }
    return { perfil, evento, setoresPermitidos: new Set(meus.map(s => s.id)) }
  }

  if (!podeGerenciarEventos(perfil)) return { erro: 'Sem permissão para gerar relatórios.' }
  if (!ehMaster(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
    return { erro: 'Sem permissão sobre este evento.' }
  }
  return { perfil, evento, setoresPermitidos: null }
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

/**
 * Monta as linhas de um setor, já dentro do período: uma por (funcionário,
 * dia) em que houve entrada OU saída. Quem não registrou nada no período
 * simplesmente não aparece — é o que mantém a tabela enxuta (o pedido:
 * "evitar transformar isso numa tabela gigantesca e confusa"). O resumo por
 * setor/função, calculado à parte, é quem responde "quantos faltam".
 */
function linhasDoSetor(
  funcionarios: { id: string; nome: string; cargo: string | null }[],
  registrosPorFuncionario: Map<string, RegistroBruto[]>,
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

    for (const [dia, doDia] of [...porDia.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      linhas.push({
        funcionarioId: f.id,
        nome: f.nome,
        setor: nomeSetor,
        funcao: f.cargo ?? '',
        dataRef: dia,
        entradaISO: doDia.find(r => r.tipo === 'entrada')?.created_at ?? null,
        saidaISO: doDia.find(r => r.tipo === 'fim')?.created_at ?? null,
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

  const { data: funcionarios } = await supabaseAdmin
    .from('funcionarios').select('id, nome, cargo').eq('fornecedor_id', fornecedorId).order('nome')

  const ids = (funcionarios ?? []).map(f => f.id)
  const { data: registros } = ids.length
    ? await supabaseAdmin.from('registros')
        .select('funcionario_id, tipo, data_ref, created_at')
        .in('funcionario_id', ids)
        .in('tipo', ['entrada', 'fim'])
        .gte('data_ref', periodo.de)
        .lte('data_ref', periodo.ate)
    : { data: [] as RegistroBruto[] }

  const porFuncionario = new Map<string, RegistroBruto[]>()
  for (const r of (registros ?? []) as RegistroBruto[]) {
    const arr = porFuncionario.get(r.funcionario_id) ?? []
    arr.push(r)
    porFuncionario.set(r.funcionario_id, arr)
  }

  const equipe = funcionarios ?? []
  return {
    id: fornecedor.id,
    nome: fornecedor.nome,
    linhas: linhasDoSetor(equipe, porFuncionario, fornecedor.nome),
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
    return { erro: 'Sem permissão sobre este setor.' }
  }

  const periodo = await resolverPeriodo(eventoId, periodoPedido)
  const setor = await carregarSetor(fornecedorId, periodo)
  if (!setor) return { erro: 'Setor não encontrado.' }
  const { data: confere } = await supabaseAdmin.from('fornecedores').select('evento_id').eq('id', fornecedorId).single()
  if (confere?.evento_id !== eventoId) return { erro: 'Este setor não pertence a este evento.' }

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

  return { eventoNome: acesso.evento.nome, periodoCompleto, setores, totalFuncionarios }
}
