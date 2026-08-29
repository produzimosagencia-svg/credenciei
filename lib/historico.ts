// O histórico de trabalho de uma pessoa num evento, dia a dia.
//
// ─── POR QUE É DERIVADO E NÃO MATERIALIZADO ─────────────────────────────────
//
// A ausência de alguém num dia NÃO vira linha no banco. Ela é calculada aqui,
// cruzando os DIAS DE TRABALHO do evento (`jornada_dias`) com as BATIDAS que
// existem (`registros`). Falta é a diferença entre os dois.
//
// Gravar "faltou" como linha pareceria mais direto e seria pior: no momento em
// que o supervisor regularizasse a batida pelo registro assistido — que é o
// caminho normal quando alguém perde o horário — a linha de falta continuaria
// lá, e o fechamento do pagamento passaria a ter duas versões da verdade. Com
// o cálculo derivado, regularizar a batida corrige o relatório no mesmo
// instante, sem nenhum passo extra que alguém possa esquecer.
//
// O que o banco precisa guardar para isso funcionar são as duas pontas, e ele
// guarda: o dia esperado e a batida feita. É o que sustenta a pergunta do
// fechamento — "estava escalado para 5 dias e veio em 4".

import { supabaseAdmin } from './supabase-server'
import { janelaDoMeio, type EventoJanelas, type DiaDaJornada, type TipoDia } from './janelas'

export type Batida = {
  em: string
  /** Registrada pelo supervisor no lugar da pessoa, com foto e justificativa. */
  assistido: boolean
  temFoto: boolean
}

export type DiaDoHistorico = {
  data: string
  tipo: TipoDia
  cancelado: boolean
  entrada: Batida | null
  meio: Batida | null
  fim: Batida | null
  /** Que horas era pra ter feito o meio — fixo no dia principal, entrada+4h nos outros. */
  meioEsperadoEm: string | null
  /** Até que horas valia registrar o meio sem ficar em atraso. */
  meioPrazoEm: string | null
  /**
   * Quantos minutos o meio passou do prazo. `null` quando foi no prazo ou
   * quando não houve batida.
   *
   * O meio pode ser registrado depois do prazo de propósito — fechar a janela
   * prenderia a pessoa, já que a saída exige o meio. Mas atrasar não pode sair
   * de graça: é isto que faz o dia aparecer marcado no histórico, para o
   * organizador cobrar a justificativa no acerto.
   */
  meioAtrasoMin: number | null
  /** Bateu pelo menos a entrada. */
  compareceu: boolean
  /** Cumpriu as três etapas. */
  completo: boolean
  /** Da entrada à saída, em horas. `null` enquanto faltar uma das duas pontas. */
  horas: number | null
}

export type ResumoHistorico = {
  diasEscalados: number
  diasTrabalhados: number
  diasFaltados: number
  diasIncompletos: number
  horasTotais: number
}

export type HistoricoNoEvento = {
  eventoId: string
  eventoNome: string
  setorNome: string
  funcionarioId: string
  nome: string
  cpf: string
  descredenciadoEm: string | null
  dias: DiaDoHistorico[]
  resumo: ResumoHistorico
}

const H_MS = 60 * 60 * 1000

/**
 * O histórico completo de uma pessoa no evento em que ela está vinculada.
 *
 * Devolve UMA linha por dia de trabalho do evento — inclusive os dias em que a
 * pessoa não apareceu, que são justamente os que interessam no fechamento.
 */
export async function historicoDoFuncionario(funcionarioId: string): Promise<HistoricoNoEvento | null> {
  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, nome, cpf, descredenciado_em, fornecedor_id, fornecedores!inner(nome, evento_id, eventos!inner(id, nome, data_inicio, data_fim, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim))')
    .eq('id', funcionarioId)
    .single()
  if (!func) return null

  const setor = func.fornecedores as unknown as { nome: string; eventos: EventoJanelas & { id: string; nome: string } }
  const evento = setor?.eventos
  if (!evento) return null

  const [{ data: diasBrutos }, { data: registros }] = await Promise.all([
    supabaseAdmin
      .from('jornada_dias')
      .select('data, tipo, cancelado, entrada_inicio, entrada_fim, saida_inicio, saida_fim')
      .eq('evento_id', evento.id)
      .order('data'),
    supabaseAdmin
      .from('registros')
      .select('tipo, created_at, data_ref, registro_manual, foto_url')
      .eq('funcionario_id', funcionarioId)
      .eq('evento_id', evento.id)
      .order('created_at'),
  ])

  const porDia = new Map<string, Map<string, Batida>>()
  for (const r of registros ?? []) {
    const dia = (r.data_ref as string | null) ?? (r.created_at as string).slice(0, 10)
    if (!porDia.has(dia)) porDia.set(dia, new Map())
    porDia.get(dia)!.set(r.tipo as string, {
      em: r.created_at as string,
      assistido: r.registro_manual === true,
      temFoto: !!r.foto_url,
    })
  }

  /*
   * Dias que têm batida mas não estão em `jornada_dias` entram assim mesmo.
   *
   * Acontece com registro feito antes de o dia ser marcado, ou num dia que o
   * produtor desmarcou depois. Esconder a batida seria pior que mostrar um dia
   * fora da escala: o dinheiro daquele dia foi trabalhado de qualquer jeito.
   */
  const datas = new Set<string>((diasBrutos ?? []).map(d => d.data as string))
  for (const dia of porDia.keys()) datas.add(dia)

  const metaPorData = new Map((diasBrutos ?? []).map(d => [d.data as string, d as DiaDaJornada]))

  const dias: DiaDoHistorico[] = [...datas].sort().map(data => {
    const meta = metaPorData.get(data) ?? null
    const batidas = porDia.get(data)
    const entrada = batidas?.get('entrada') ?? null
    const meio = batidas?.get('meio') ?? null
    const fim = batidas?.get('fim') ?? null
    const janela = janelaDoMeio(evento, meta, entrada?.em ?? null)

    return {
      data,
      tipo: (meta?.tipo as TipoDia) ?? 'preparacao',
      cancelado: meta?.cancelado === true,
      entrada, meio, fim,
      meioEsperadoEm: janela?.inicio ?? null,
      meioPrazoEm: janela?.fim ?? null,
      meioAtrasoMin: meio && janela && new Date(meio.em) > new Date(janela.fim)
        ? Math.round((new Date(meio.em).getTime() - new Date(janela.fim).getTime()) / 60_000)
        : null,
      compareceu: !!entrada,
      completo: !!entrada && !!meio && !!fim,
      horas: entrada && fim
        ? Math.round(((new Date(fim.em).getTime() - new Date(entrada.em).getTime()) / H_MS) * 100) / 100
        : null,
    }
  })

  // Dia cancelado não conta como escalado: o organizador desmarcou o
  // expediente, então ninguém faltou a ele.
  const valem = dias.filter(d => !d.cancelado)

  return {
    eventoId: evento.id,
    eventoNome: evento.nome,
    setorNome: setor.nome,
    funcionarioId,
    nome: func.nome as string,
    cpf: func.cpf as string,
    descredenciadoEm: (func.descredenciado_em as string | null) ?? null,
    dias,
    resumo: {
      diasEscalados: valem.length,
      diasTrabalhados: valem.filter(d => d.compareceu).length,
      diasFaltados: valem.filter(d => !d.compareceu).length,
      diasIncompletos: valem.filter(d => d.compareceu && !d.completo).length,
      horasTotais: Math.round(valem.reduce((soma, d) => soma + (d.horas ?? 0), 0) * 100) / 100,
    },
  }
}
