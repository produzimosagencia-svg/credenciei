// Quando cada etapa pode ser registrada — a parte pura, sem banco.
//
// ─── O QUE MUDOU E POR QUÊ ───────────────────────────────────────────────────
//
// Antes, as três etapas viviam presas a horários fixos gravados no evento
// (`janela_entrada_inicio`, `janela_meio_inicio`, …). Isso só funciona para
// evento de um dia. Numa operação de montagem + evento + desmontagem, obrigava
// o produtor a reconfigurar tudo todo dia, e quem chegasse fora do horário
// simplesmente não conseguia se credenciar.
//
// O modelo agora é outro:
//
//   ENTRADA e SAÍDA  → livres, o dia inteiro, em qualquer dia do período do
//                      evento. A exceção é o DIA PRINCIPAL (a data de início
//                      do evento), onde as janelas configuradas continuam
//                      valendo como trava — é o dia que tem portaria, fila e
//                      horário combinado com o cliente.
//
//   MEIO             → deixa de ter horário fixo. Passa a ser calculado a
//                      partir da ENTRADA REAL de cada pessoa: quatro horas
//                      depois de quando ela bateu. Quem entrou 08:00 faz o
//                      meio 12:00; quem entrou 10:30 faz 14:30.
//
// A consequência prática é que a janela do meio é individual. Duas pessoas do
// mesmo setor que entraram com uma hora de diferença têm meios diferentes, e é
// isso que se quer: o meio existe pra confirmar que a pessoa continua no posto
// no meio do TURNO DELA, não no meio do relógio.
//
// As jornadas recorrentes (`jornada_dias`) continuam existindo, mas com outro
// papel: os horários de lá deixam de ser trava e viram EXPECTATIVA — é o que
// alimenta "horário esperado" nas listas de pendência e nos lembretes. Quem
// trava é só o dia principal.

/** Distância entre a entrada real e a abertura do meio. */
export const HORAS_ATE_MEIO = 4

/**
 * Por quanto tempo o meio fica aberto depois de abrir.
 *
 * Não pode ser um instante: a pessoa está trabalhando, pode estar carregando
 * caixa exatamente às 12:00, e falhar por isso seria injusto. Também não pode
 * ser infinito — se nunca fecha, ninguém nunca entra na lista de pendência e a
 * etapa perde a função. Duas horas cobre o intervalo de almoço inteiro.
 */
export const DURACAO_JANELA_MEIO_H = 2

/**
 * Teto para considerar uma entrada "ainda em aberto" na hora de decidir a que
 * dia a saída pertence.
 *
 * Serve ao turno que vira a madrugada: entrou 22:00 do dia 5, sai 04:00 do dia
 * 6, e a saída tem que cair no dia 5 — é assim que a operação conta a noite.
 * Sem um teto, uma entrada esquecida da semana passada capturaria a saída de
 * hoje. Dezoito horas é maior que qualquer turno real e menor que um dia
 * inteiro de intervalo.
 */
export const TETO_TURNO_H = 18

const H_MS = 60 * 60 * 1000
const OFFSET_BRT_MS = 3 * H_MS

// ─── Dias em BRT ─────────────────────────────────────────────────────────────

/**
 * O dia civil (em Brasília) de um instante — "2026-08-28".
 *
 * Passa pelo offset em vez de usar `toLocaleDateString` porque o servidor da
 * Vercel roda em UTC: às 22:00 de Brasília já é o dia seguinte lá, e o registro
 * cairia no dia errado.
 */
export function diaBRT(instante: Date | string = new Date()): string {
  const d = typeof instante === 'string' ? new Date(instante) : instante
  const br = new Date(d.getTime() - OFFSET_BRT_MS)
  const p2 = (n: number) => String(n).padStart(2, '0')
  return `${br.getUTCFullYear()}-${p2(br.getUTCMonth() + 1)}-${p2(br.getUTCDate())}`
}

// ─── Período do evento ───────────────────────────────────────────────────────

export type EventoJanelas = {
  data_inicio?: string | null
  data_fim?: string | null
  janela_entrada_inicio?: string | null
  janela_entrada_fim?: string | null
  janela_meio_inicio?: string | null
  janela_meio_fim?: string | null
  janela_fim_inicio?: string | null
  janela_fim_fim?: string | null
}

/** Primeiro e último dia civil em que o evento existe. */
export function periodoDoEvento(evento: EventoJanelas): { primeiro: string; ultimo: string } | null {
  if (!evento?.data_inicio) return null
  const primeiro = diaBRT(evento.data_inicio)
  // Evento sem data de fim (ou com fim antes do início, que é dado ruim) vale
  // por um dia só — melhor que abrir o período para sempre.
  const fim = evento.data_fim ? diaBRT(evento.data_fim) : primeiro
  return { primeiro, ultimo: fim >= primeiro ? fim : primeiro }
}

/**
 * O DIA PRINCIPAL é a data de início do evento.
 *
 * É o dia em que o evento de fato acontece, e o único para o qual o produtor
 * configurou horário de portaria. Montagem e desmontagem acontecem nos outros
 * dias do período, e é justamente lá que amarrar horário atrapalhava.
 */
export function ehDiaPrincipal(evento: EventoJanelas, dia: string): boolean {
  return !!evento?.data_inicio && diaBRT(evento.data_inicio) === dia
}

// ─── A janela do meio, individual ────────────────────────────────────────────

/** Entrada às 08:00 → meio das 12:00 às 14:00. */
export function janelaMeio(entradaEm: string | Date): { inicio: string; fim: string } {
  const base = (typeof entradaEm === 'string' ? new Date(entradaEm) : entradaEm).getTime()
  const inicio = base + HORAS_ATE_MEIO * H_MS
  return {
    inicio: new Date(inicio).toISOString(),
    fim: new Date(inicio + DURACAO_JANELA_MEIO_H * H_MS).toISOString(),
  }
}

// ─── Avaliação ───────────────────────────────────────────────────────────────

export type Veredito = { ok: true } | { ok: false; erro: string }

const hhmm = (iso: string) =>
  new Date(new Date(iso).getTime() - OFFSET_BRT_MS)
    .toISOString()
    .slice(11, 16)

/**
 * Estamos dentro de [inicio, fim]?
 *
 * A recusa diz o horário, não só "fora da janela": quem está no portão precisa
 * saber se falta meia hora ou se já passou.
 */
export function dentroDaJanela(
  inicio: string | null | undefined,
  fim: string | null | undefined,
  agora: Date,
  etapa: string
): Veredito {
  if (!inicio || !fim) return { ok: true } // sem horário configurado = sem trava
  const t = agora.getTime()
  if (t < new Date(inicio).getTime()) {
    return { ok: false, erro: `A ${etapa} de hoje abre às ${hhmm(inicio)}.` }
  }
  if (t > new Date(fim).getTime()) {
    return { ok: false, erro: `O horário de ${etapa} de hoje encerrou às ${hhmm(fim)}.` }
  }
  return { ok: true }
}

/**
 * Entrada ou saída podem ser registradas neste dia?
 *
 * Só duas coisas travam: estar fora do período do evento e, no dia principal,
 * estar fora da janela configurada. Em qualquer outro dia do período a etapa é
 * livre — que é exatamente a mudança pedida.
 */
export function avaliarEntradaSaida(
  evento: EventoJanelas,
  momento: 'entrada' | 'fim',
  dia: string,
  agora: Date
): Veredito {
  const periodo = periodoDoEvento(evento)
  const etapa = momento === 'entrada' ? 'entrada' : 'saída'

  if (!periodo) return { ok: false, erro: 'Este evento ainda não tem data definida.' }
  if (dia < periodo.primeiro) {
    return { ok: false, erro: `O evento só começa em ${diaBR(periodo.primeiro)}. Ainda não dá para registrar ${etapa}.` }
  }
  if (dia > periodo.ultimo) {
    return { ok: false, erro: `O evento terminou em ${diaBR(periodo.ultimo)}. Não é mais possível registrar ${etapa}.` }
  }

  if (!ehDiaPrincipal(evento, dia)) return { ok: true }

  return dentroDaJanela(
    evento[`janela_${momento}_inicio`],
    evento[`janela_${momento}_fim`],
    agora,
    etapa
  )
}

// ─── Horário ESPERADO de cada etapa ──────────────────────────────────────────
//
// Nada aqui trava registro nenhum: entrada e saída ficaram livres, e o meio é
// contado da entrada real. O que estas funções respondem é outra pergunta —
// "que horas era pra essa pessoa ter batido?" — e é ela que sustenta as listas
// de pendência do supervisor e o momento de disparar cada aviso.

/**
 * Até que horas ainda se espera a entrada, num dia sem horário configurado.
 *
 * Quem chega depois disso não é recusado (a entrada é livre); ele só entra na
 * lista de "previsto e não credenciado" que o supervisor recebe.
 */
export const LIMITE_PADRAO_ENTRADA = '12:00'

/** Idem para a saída. Fecha o dia operacional. */
export const LIMITE_PADRAO_SAIDA = '23:59'

/** Entrada presumida quando o dia não tem horário nenhum configurado. */
export const ENTRADA_PADRAO = '08:00'

export type DiaDaJornada = {
  entrada_inicio: string
  entrada_fim: string
  saida_inicio: string
  saida_fim: string
}

export type HorariosEsperados = {
  /** Quando se esperava a entrada. `null` = dia sem expectativa definida. */
  entrada: string | null
  /** Depois disto, quem não bateu vira pendência de entrada. */
  entradaLimite: string
  fim: string | null
  fimLimite: string
  /**
   * Quando faz sentido cobrar o meio do setor: seis horas depois da entrada
   * esperada, que é quando a janela de quem chegou no horário se fecha
   * (4h para abrir + 2h de duração). Quem chegou mais tarde ainda está dentro
   * da própria janela e por isso não aparece na lista — a conta é sempre
   * individual, esta é só a hora de olhar.
   */
  meioAlerta: string
}

/** "2026-09-10" + "08:00" → instante ISO em Brasília. */
function instanteBRT(dia: string, hora: string): string {
  return new Date(`${dia}T${hora}:00-03:00`).toISOString()
}

export function horariosEsperados(
  evento: EventoJanelas,
  dia: string,
  jornadaDia?: DiaDaJornada | null
): HorariosEsperados {
  // No dia principal a janela configurada continua sendo a referência — é o
  // único dia em que ela ainda trava, então também é o que se espera.
  const principal = ehDiaPrincipal(evento, dia)
  const doEvento = (campo: keyof EventoJanelas) => (principal ? (evento[campo] ?? null) : null)

  const entrada = jornadaDia?.entrada_inicio ?? doEvento('janela_entrada_inicio')
  const fim = jornadaDia?.saida_inicio ?? doEvento('janela_fim_inicio')

  return {
    entrada,
    entradaLimite: jornadaDia?.entrada_fim ?? doEvento('janela_entrada_fim') ?? instanteBRT(dia, LIMITE_PADRAO_ENTRADA),
    fim,
    fimLimite: jornadaDia?.saida_fim ?? doEvento('janela_fim_fim') ?? instanteBRT(dia, LIMITE_PADRAO_SAIDA),
    meioAlerta: new Date(
      new Date(entrada ?? instanteBRT(dia, ENTRADA_PADRAO)).getTime() +
      (HORAS_ATE_MEIO + DURACAO_JANELA_MEIO_H) * H_MS
    ).toISOString(),
  }
}

/** "2026-08-28" → "28/08". Só para as mensagens de recusa. */
function diaBR(dia: string): string {
  const [, mes, d] = dia.split('-')
  return `${d}/${mes}`
}
