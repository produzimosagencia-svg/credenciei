// Periodicidade da cobrança de uma organização. Fica fora do componente de UI
// porque server components (listagem) e client components (picker) precisam
// dos dois usarem a mesma tabela.

export type PeriodoCobranca = 'diario' | 'semanal' | 'mensal' | 'evento'

export const PERIODOS_COBRANCA: { valor: PeriodoCobranca; label: string; sufixo: string }[] = [
  { valor: 'diario', label: 'Diário', sufixo: '/dia' },
  { valor: 'semanal', label: 'Semanal', sufixo: '/semana' },
  { valor: 'mensal', label: 'Mensal', sufixo: '/mês' },
  { valor: 'evento', label: 'Por evento', sufixo: '/evento' },
]

export function sufixoPeriodo(periodo: string | null): string {
  return PERIODOS_COBRANCA.find(p => p.valor === periodo)?.sufixo ?? ''
}
