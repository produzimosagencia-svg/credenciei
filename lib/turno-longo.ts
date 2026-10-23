/*
 * SAÍDA COM HORA IMPOSSÍVEL (Juan, 23/10/2026): no LUAN, 4 saídas foram lançadas ANTES da entrada (a hora da madrugada
 * no dia errado: entrada 11:38, saída 01:10 do mesmo dia — horas zeradas no relatório) e 35 turnos passaram de 18h (a saída
 * do dia anterior batida na manhã seguinte). O "Corrigir no histórico" e o "Lançar ponto" aceitavam tudo isso em silêncio.
 *
 * Agora o servidor (`lancarPontoManual`) pergunta antes de salvar: "é a madrugada do dia seguinte?" e "esse turno de 23h
 * está certo?". Sem importações: as regras são testadas no Node (testes/turno-longo.mjs).
 */

/** Acima disto o turno pede confirmação — o mesmo teto em que os relatórios põem a saída em laranja ("conferir"). O dia do show chega a 17h de verdade. */
export const TURNO_LONGO_H = 18
export const TURNO_LONGO_MS = TURNO_LONGO_H * 3_600_000

export type PerguntaDeHorario =
  /** A saída ficaria antes da entrada: provavelmente é a madrugada do dia seguinte. `sugeridoLocal` = o mesmo horário, um dia depois. */
  | { tipo: 'dia_seguinte'; sugeridoLocal: string; texto: string }
  /** O turno ficaria acima de 18h: confirma antes de salvar. */
  | { tipo: 'turno_longo'; horas: number; texto: string }

/** O mesmo horário, um dia depois: 'AAAA-MM-DDTHH:mm' → 'AAAA-MM-DD+1THH:mm' (Brasília não tem horário de verão desde 2019). */
export function maisUmDia(quandoLocal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2})$/.exec(quandoLocal ?? '')
  if (!m) return quandoLocal
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}T${m[4]}`
}

export type AvaliacaoDaSaida =
  | { tipo: 'ok' }
  | { tipo: 'antes_da_entrada'; sugeridoLocal: string | null }
  | { tipo: 'turno_longo'; horas: number }

/**
 * A saída faz sentido para esta entrada? `saidaLocal` é o horário digitado ('AAAA-MM-DDTHH:mm', Brasília).
 * Antes (ou junto) da entrada: nunca vale, e se um dia depois ficar dentro de um turno possível (acima de zero e até 18h),
 * sugere esse horário. Acima de 18h: pede confirmação.
 */
export function avaliarSaida(entradaISO: string, saidaISO: string, saidaLocal: string): AvaliacaoDaSaida {
  const entrada = Date.parse(entradaISO)
  const saida = Date.parse(saidaISO)
  if (!Number.isFinite(entrada) || !Number.isFinite(saida)) return { tipo: 'ok' }
  const duracao = saida - entrada
  if (duracao <= 0) {
    const depoisDeUmDia = duracao + 24 * 3_600_000
    return { tipo: 'antes_da_entrada', sugeridoLocal: depoisDeUmDia > 0 && depoisDeUmDia <= TURNO_LONGO_MS ? maisUmDia(saidaLocal) : null }
  }
  if (duracao > TURNO_LONGO_MS) return { tipo: 'turno_longo', horas: Math.floor(duracao / 3_600_000) }
  return { tipo: 'ok' }
}
