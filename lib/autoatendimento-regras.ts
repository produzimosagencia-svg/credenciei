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
 *   3. SÓ FICA LIBERADO quando as TRÊS coisas valem ao mesmo tempo: ligado no evento, ativado pelo operador, E o
 *      horário de agora dentro da janela — mesmo que alguém esqueça de desativar, passar da hora de fim já barra
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
 * `agora` está dentro da janela [inicio, fim)? Cruza a meia-noite quando `fim <= inicio` (18:00 às 07:00 do dia
 * seguinte: tudo que é "depois das 18:00" OU "antes das 07:00" está dentro). `inicio === fim` é a janela
 * inteira (24h) — mais fácil de entender do que "janela de zero minutos".
 */
export function dentroDaJanela(inicio: string | null, fim: string | null, agora: Date): boolean {
  const i = minutosDoHorario(inicio)
  const f = minutosDoHorario(fim)
  if (i == null || f == null) return false
  const minutosAgora = agora.getHours() * 60 + agora.getMinutes()
  if (i === f) return true
  return i < f ? minutosAgora >= i && minutosAgora < f : minutosAgora >= i || minutosAgora < f
}

/** Liberado AGORA: habilitado, ativado pelo operador, e dentro da janela — as três coisas, sempre reconferidas. */
export function liberadoAgora(cfg: ConfigAutoatendimento, agora: Date = new Date()): boolean {
  return cfg.habilitado && !!cfg.ativadoEm && dentroDaJanela(cfg.inicio, cfg.fim, agora)
}

/** "18:00 às 07:00" — para a tela. */
export function descreverJanela(cfg: ConfigAutoatendimento): string | null {
  if (!cfg.inicio || !cfg.fim) return null
  const curto = (h: string) => h.slice(0, 5)
  return `${curto(cfg.inicio)} às ${curto(cfg.fim)}`
}
