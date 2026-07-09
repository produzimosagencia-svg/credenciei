// Fuso de Brasília (BRT). O Brasil não tem mais horário de verão desde 2019,
// então o offset é fixo em -03:00. Todos os horários que o ADMIN digita
// (datas do evento e janelas de presença) são interpretados neste fuso.
//
// Sem isto, um <input type="datetime-local"> (que é "wall clock" sem fuso)
// era gravado como se fosse UTC e reexibido com o fuso local do servidor —
// deslocando o horário (ex.: digita 08:00, aparece 05:00).

const OFFSET = '-03:00'
const OFFSET_MS = 3 * 60 * 60 * 1000

const p2 = (n: number) => String(n).padStart(2, '0')

/**
 * Converte "YYYY-MM-DDTHH:mm" (horário de Brasília) num ISO com offset,
 * pronto pra gravar em timestamptz. Retorna null se vazio.
 */
export function inputParaISO(naive: string | null | undefined): string | null {
  const s = (naive ?? '').trim()
  if (!s) return null
  // Já tem fuso (Z ou ±HH:mm)? mantém.
  if (/[Zz]$|[+-]\d{2}:?\d{2}$/.test(s)) return s
  const comSegundos = s.length === 16 ? `${s}:00` : s
  return `${comSegundos}${OFFSET}`
}

// Componentes de data/hora no fuso de Brasília, a partir de um instante ISO.
function brParts(iso: string) {
  const br = new Date(new Date(iso).getTime() - OFFSET_MS)
  return {
    ano: br.getUTCFullYear(),
    mes: br.getUTCMonth() + 1,
    dia: br.getUTCDate(),
    hora: br.getUTCHours(),
    min: br.getUTCMinutes(),
  }
}

/** Valor para <input type="datetime-local">: "YYYY-MM-DDTHH:mm" em BRT. */
export function isoParaInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const { ano, mes, dia, hora, min } = brParts(iso)
  return `${ano}-${p2(mes)}-${p2(dia)}T${p2(hora)}:${p2(min)}`
}

/** Exibição em BRT. Modos: 'completo' (dd/MM/yyyy HH:mm), 'data', 'hora', 'curto' (dd/MM HH:mm). */
export function formatarBR(iso: string | null | undefined, modo: 'completo' | 'data' | 'hora' | 'curto' = 'completo'): string {
  if (!iso) return ''
  const { ano, mes, dia, hora, min } = brParts(iso)
  const data = `${p2(dia)}/${p2(mes)}/${ano}`
  const dataCurta = `${p2(dia)}/${p2(mes)}`
  const horaStr = `${p2(hora)}:${p2(min)}`
  if (modo === 'data') return data
  if (modo === 'hora') return horaStr
  if (modo === 'curto') return `${dataCurta} ${horaStr}`
  return `${data} ${horaStr}`
}
