/**
 * Autoatendimento fora do horário da portaria — as REGRAS, sem banco (mesmo espírito de lib/escala-regras.ts e
 * lib/pedido-setor-regras.ts): testável sozinha (testes/autoatendimento.mjs) e usada tanto pelo servidor
 * (lib/autoatendimento.ts, que lê o banco) quanto, se precisar, pela tela.
 *
 * Pedido do Juan, 08/10/2026, depois do VITAL: a equipe do credenciamento vai embora num horário combinado, mas
 * colaboradores continuam trabalhando sem ninguém pra bater o QR deles. A régua:
 *
 *   1. PARAMETRIZADO por evento, em Editar evento: liga a função e define a janela de horário (início e fim — o
 *      fim pode ser no dia seguinte, ex. 18:00 às 07:00). Sozinho, não libera nada.
 *   2. O OPERADOR ativa na hora de ir embora ("Estou indo embora", em /scan) — um botão só, sem escolher
 *      horário (quem define é o admin, lá em cima).
 *   3. SÓ FICA LIBERADO quando as TRÊS coisas valem ao mesmo tempo: ligado no evento, ativado pelo operador PARA
 *      ESTA janela (vale uma noite; a ativação de ontem não vale hoje), E o horário de agora (de Brasília) dentro da janela — mesmo que alguém esqueça de desativar, passar da hora de fim já barra
 *      sozinho de novo. É a trava final contra "ficou ligado para sempre".
 */

export type ConfigAutoatendimento = {
  habilitado: boolean
  inicio: string | null // "HH:MM:SS" ou "HH:MM"
  fim: string | null
  ativadoEm: string | null
  ativadoPor: string | null
}

/** Minutos desde a meia-noite — "08:30" → 510, "08:30:00" → 510. `null`/formato estranho ⇒ `null`. */
function minutosDoHorario(h: string | null): number | null {
  const m = (h ?? '').match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (hh > 23 || mm > 59) return null
  return hh * 60 + mm
}

/**
 * Data e minutos do dia NO HORÁRIO DE BRASÍLIA. O servidor roda em UTC (Vercel): ler `agora.getHours()` deslocava
 * a janela 3 horas — às 00:15 daqui o servidor via 03:15 e recusava uma janela até 00:25 (achado do Juan,
 * 09/10/2026). O Brasil não tem horário de verão desde 2019: -03:00 fixo.
 */
const FUSO_BRT_MS = -3 * 60 * 60 * 1000

export function partesBRT(agora: Date): { dia: string; minutos: number } {
  const local = new Date(agora.getTime() + FUSO_BRT_MS)
  return {
    dia: local.toISOString().slice(0, 10),
    minutos: local.getUTCHours() * 60 + local.getUTCMinutes(),
  }
}

function somarDia(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** O instante (UTC) de `dia` às `minutos` no horário de Brasília. */
function instanteBRT(dia: string, minutos: number): Date {
  return new Date(new Date(`${dia}T00:00:00Z`).getTime() + minutos * 60_000 - FUSO_BRT_MS)
}

export type JanelaAtual = {
  /**
   * O DIA em que esta janela começou — é ele que precisa estar marcado em "Em quais dias". Uma janela das 18:00
   * às 00:25 é a NOITE do dia em que começou: às 00:10 do dia seguinte, o dia ainda é o anterior (pedido do Juan,
   * 09/10/2026: "é um horário de um dia que passa de meia-noite").
   */
  diaInicio: string
  comecouEm: Date
  terminaEm: Date
}

/**
 * A janela que vale AGORA, ou `null` se estamos fora dela. `fim <= inicio` cruza a meia-noite (18:00 às 07:00:
 * das 18:00 de um dia às 07:00 do dia seguinte). `inicio === fim` é uma janela de 24h.
 */
export function janelaAtual(inicio: string | null, fim: string | null, agora: Date): JanelaAtual | null {
  const i = minutosDoHorario(inicio)
  const f = minutosDoHorario(fim)
  if (i == null || f == null) return null
  const { dia, minutos } = partesBRT(agora)
  const duracao = i < f ? f - i : f - i + 24 * 60
  let diaInicio: string | null = null
  if (i < f) diaInicio = minutos >= i && minutos < f ? dia : null
  else diaInicio = minutos >= i ? dia : minutos < f || i === f ? somarDia(dia, -1) : null
  if (!diaInicio) return null
  const comecouEm = instanteBRT(diaInicio, i)
  return { diaInicio, comecouEm, terminaEm: new Date(comecouEm.getTime() + duracao * 60_000) }
}

/** `agora` está dentro da janela [inicio, fim)? — ver `janelaAtual`. */
export function dentroDaJanela(inicio: string | null, fim: string | null, agora: Date): boolean {
  return janelaAtual(inicio, fim, agora) !== null
}

/**
 * A ativação do operador vale para a janela de AGORA? Vale se "Estou indo embora" foi apertado depois do FIM da
 * janela anterior — inclusive um pouco antes desta começar (quem sai às 17:30 numa janela das 18:00). Sem isto,
 * uma ativação esquecida ontem liberava sozinha a janela de hoje à noite, sem operador nenhum apertar nada.
 */
export function ativacaoValeParaJanela(ativadoEm: string | null, janela: JanelaAtual): boolean {
  if (!ativadoEm) return false
  const duracaoMs = janela.terminaEm.getTime() - janela.comecouEm.getTime()
  const fimDaAnterior = janela.comecouEm.getTime() - (24 * 60 * 60 * 1000 - duracaoMs)
  return new Date(ativadoEm).getTime() >= fimDaAnterior
}

/**
 * Liberado AGORA (sem o dia marcado, que é do banco — ver `autoatendimentoLiberadoAgora`): habilitado, dentro da
 * janela, e ativado pelo operador PARA ESTA janela. Devolve a janela (para o chamador conferir o dia) ou `null`.
 */
export function janelaLiberada(cfg: ConfigAutoatendimento, agora: Date = new Date()): JanelaAtual | null {
  if (!cfg.habilitado) return null
  const janela = janelaAtual(cfg.inicio, cfg.fim, agora)
  if (!janela || !ativacaoValeParaJanela(cfg.ativadoEm, janela)) return null
  return janela
}

/** Liberado AGORA: habilitado, ativado pelo operador para esta janela, e dentro da janela. */
export function liberadoAgora(cfg: ConfigAutoatendimento, agora: Date = new Date()): boolean {
  return janelaLiberada(cfg, agora) !== null
}

/**
 * Para qual DIA vale uma ativação apertada AGORA: o da janela em andamento, ou — fora dela (ex.: o operador sai às
 * 17:30 numa janela das 18:00) — o de hoje, cuja janela ainda vai começar.
 */
export function diaDaAtivacao(cfg: ConfigAutoatendimento, agora: Date = new Date()): string {
  return janelaAtual(cfg.inicio, cfg.fim, agora)?.diaInicio ?? partesBRT(agora).dia
}

/** A janela cruza a meia-noite (o fim é no dia seguinte)? */
export function cruzaMeiaNoite(inicio: string | null, fim: string | null): boolean {
  const i = minutosDoHorario(inicio)
  const f = minutosDoHorario(fim)
  return i != null && f != null && f <= i
}

/** "18:00 às 07:00" — para a tela. */
export function descreverJanela(cfg: ConfigAutoatendimento): string | null {
  if (!cfg.inicio || !cfg.fim) return null
  const curto = (h: string) => h.slice(0, 5)
  return `${curto(cfg.inicio)} às ${curto(cfg.fim)}${cruzaMeiaNoite(cfg.inicio, cfg.fim) ? ' do dia seguinte' : ''}`
}
