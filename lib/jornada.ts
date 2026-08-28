import { inputParaISO, formatarBR } from '@/lib/tz'

/**
 * Jornadas recorrentes — o "despertador" do Credenciei.
 *
 * O responsável configura UMA vez (período + dias da semana + horários) e o
 * sistema materializa cada dia dentro do período. Este arquivo é a parte pura:
 * transforma a regra em dias. Quem grava no banco é `lib/actions.ts`.
 *
 * ⚠️ Os horários gerados aqui são EXPECTATIVA, não trava. Quem decide se uma
 * batida é aceita agora é `lib/janelas.ts`: entrada e saída ficaram livres em
 * todo dia do período (menos no dia principal do evento) e o meio passou a ser
 * contado a partir da entrada real de cada pessoa. O que estes dias respondem
 * é "que horas era pra essa pessoa ter chegado" — o horário esperado que
 * aparece nas listas de pendência e nos lembretes.
 *
 * Tudo em horário de Brasília, como o resto do sistema — o responsável digita
 * "08:00" pensando no relógio dele, não em UTC.
 */

/** 0 = domingo … 6 = sábado. Mesma numeração de Date#getDay. */
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6

export type Turno = {
  /** "08:00" */
  entrada: string
  /** "18:00" — menor que a entrada significa que vira a madrugada. */
  saida: string
}

export type BlocoJornada = {
  dias: DiaSemana[]
  turnos: Turno[]
}

export type Jornada = {
  dataInicio: string   // "2026-09-01"
  dataFim: string      // "2026-09-30"
  toleranciaMin: number
  blocos: BlocoJornada[]
}

export type DiaGerado = {
  data: string         // "2026-09-01"
  turno: number
  entradaInicio: string
  entradaFim: string
  saidaInicio: string
  saidaFim: string
}

export const NOMES_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'] as const
export const INICIAIS_DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'] as const

/** Teto de dias gerados. Um ano de operação diária já é bem mais que o real. */
export const MAX_DIAS_GERADOS = 400

const MIN_MS = 60 * 1000

// ─── Datas em BRT, sem depender do fuso do servidor ──────────────────────────

/** "2026-09-01" → { ano, mes, dia }, sem passar por Date (que aplicaria fuso). */
function partesData(iso: string) {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number)
  return { ano, mes, dia }
}

/** Dia da semana de "2026-09-01" em BRT. Meio-dia UTC evita virada de fuso. */
export function diaDaSemana(dataISO: string): DiaSemana {
  const { ano, mes, dia } = partesData(dataISO)
  return new Date(Date.UTC(ano, mes - 1, dia, 12)).getUTCDay() as DiaSemana
}

/** Soma dias a "2026-09-01" e devolve no mesmo formato. */
export function somarDias(dataISO: string, n: number): string {
  const { ano, mes, dia } = partesData(dataISO)
  const d = new Date(Date.UTC(ano, mes - 1, dia + n, 12))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** "2026-09-01" + "08:00" → ISO com offset de Brasília. */
function instante(dataISO: string, hora: string): string {
  return inputParaISO(`${dataISO}T${hora}`)!
}

// ─── A geração ───────────────────────────────────────────────────────────────

/**
 * Expande a regra nos dias concretos do período.
 *
 * Regras que valem a pena saber:
 * - Dia da semana não marcado não gera nada — o sistema não cobra registro num
 *   dia em que ninguém trabalha.
 * - Turno cuja saída é MENOR que a entrada (22:00 → 04:00) vira madrugada e a
 *   saída cai no dia seguinte, mas o dia de referência continua sendo o da
 *   entrada. É assim que a operação conta a noite.
 * - A janela de cada etapa é o horário mais ou menos a tolerância. Sem
 *   tolerância a janela seria um instante e ninguém conseguiria bater.
 */
export function gerarDias(jornada: Jornada): DiaGerado[] {
  const { dataInicio, dataFim, blocos } = jornada
  const tol = Math.max(0, jornada.toleranciaMin || 0) * MIN_MS
  if (!dataInicio || !dataFim || dataFim < dataInicio) return []

  // Um mapa dia-da-semana → turnos. Blocos que repetem o mesmo dia se somam,
  // em vez de o último silenciosamente vencer.
  const turnosPorDia = new Map<DiaSemana, Turno[]>()
  for (const bloco of blocos ?? []) {
    for (const d of bloco.dias ?? []) {
      const atuais = turnosPorDia.get(d) ?? []
      turnosPorDia.set(d, [...atuais, ...(bloco.turnos ?? []).filter(t => t.entrada && t.saida)])
    }
  }
  if (!turnosPorDia.size) return []

  const dias: DiaGerado[] = []
  let data = dataInicio.slice(0, 10)
  const fim = dataFim.slice(0, 10)

  for (let i = 0; data <= fim && i < MAX_DIAS_GERADOS; i++, data = somarDias(data, 1)) {
    const turnos = turnosPorDia.get(diaDaSemana(data))
    if (!turnos?.length) continue

    turnos.forEach((t, idx) => {
      const entrada = new Date(instante(data, t.entrada)).getTime()
      // Saída antes da entrada = vira o dia. Soma 24h em vez de trocar a data
      // pra não errar em mudança de mês.
      let saida = new Date(instante(data, t.saida)).getTime()
      if (saida <= entrada) saida += 24 * 60 * MIN_MS

      dias.push({
        data,
        turno: idx,
        entradaInicio: new Date(entrada - tol).toISOString(),
        entradaFim: new Date(entrada + tol).toISOString(),
        saidaInicio: new Date(saida - tol).toISOString(),
        saidaFim: new Date(saida + tol).toISOString(),
      })
    })
  }

  return dias
}

// ─── Resumo em texto ─────────────────────────────────────────────────────────

/** "Segunda a sexta" quando a sequência é contínua; senão "Seg, Qua, Sex". */
export function rotuloDias(dias: DiaSemana[]): string {
  const ordenados = [...new Set(dias)].sort((a, b) => a - b)
  if (!ordenados.length) return 'nenhum dia'
  if (ordenados.length === 7) return 'todos os dias'

  const contiguo = ordenados.every((d, i) => i === 0 || d === ordenados[i - 1] + 1)
  if (contiguo && ordenados.length > 2) {
    return `${NOMES_DIAS[ordenados[0]]} a ${NOMES_DIAS[ordenados[ordenados.length - 1]]}`
  }
  return ordenados.map(d => NOMES_DIAS[d].slice(0, 3)).join(', ')
}

/** Linha de resumo de um bloco, no formato do "despertador". */
export function resumoBloco(bloco: BlocoJornada): string {
  const horarios = (bloco.turnos ?? [])
    .filter(t => t.entrada && t.saida)
    .map(t => `${t.entrada} às ${t.saida}`)
    .join(' · ')
  return `${rotuloDias(bloco.dias ?? [])} — ${horarios || 'sem horário'}`
}

/** Texto curto do período, para o cabeçalho do resumo. */
export function resumoPeriodo(j: Pick<Jornada, 'dataInicio' | 'dataFim'>): string {
  if (!j.dataInicio || !j.dataFim) return ''
  const f = (d: string) => formatarBR(`${d}T12:00:00-03:00`, 'data')
  return `${f(j.dataInicio)} → ${f(j.dataFim)}`
}
