/**
 * Cartão de indicador.
 *
 * Segue a referência que o Juan mandou: fundo com gradiente sutil no tom do
 * indicador, ícone colorido num bloco arredondado à direita, rótulo em cima
 * e número grande embaixo. O tom vem do SIGNIFICADO do número (o que precisa
 * de atenção é âmbar, o que está bem é verde), não de uma cor por posição.
 */

const TONS = {
  neutro: {
    fundo: 'linear-gradient(135deg, rgba(148,163,184,0.10), rgba(148,163,184,0) 60%)',
    borda: 'var(--linha, #e5e7eb)',
    icone: 'text-slate-400',
    bloco: 'rgba(148,163,184,0.14)',
    numero: 'text-slate-800',
  },
  acento: {
    fundo: 'linear-gradient(135deg, rgba(59,130,246,0.16), rgba(59,130,246,0) 60%)',
    borda: 'rgba(59,130,246,0.28)',
    icone: 'text-brand-400',
    bloco: 'rgba(59,130,246,0.18)',
    numero: 'text-slate-800',
  },
  sucesso: {
    fundo: 'linear-gradient(135deg, rgba(34,197,94,0.16), rgba(34,197,94,0) 60%)',
    borda: 'rgba(34,197,94,0.28)',
    icone: 'text-sucesso-600',
    bloco: 'rgba(34,197,94,0.18)',
    numero: 'text-slate-800',
  },
  aviso: {
    fundo: 'linear-gradient(135deg, rgba(245,158,11,0.16), rgba(245,158,11,0) 60%)',
    borda: 'rgba(245,158,11,0.30)',
    icone: 'text-aviso-600',
    bloco: 'rgba(245,158,11,0.18)',
    numero: 'text-slate-800',
  },
  erro: {
    fundo: 'linear-gradient(135deg, rgba(239,68,68,0.16), rgba(239,68,68,0) 60%)',
    borda: 'rgba(239,68,68,0.30)',
    icone: 'text-erro-600',
    bloco: 'rgba(239,68,68,0.18)',
    numero: 'text-slate-800',
  },
} as const

export type TomStat = keyof typeof TONS

export default function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tom = 'neutro',
  small,
}: {
  label: string
  value: string | number
  sub?: string
  icon?: React.ElementType
  tom?: TomStat
  /** Aceitos por compatibilidade com as chamadas antigas — o tom manda agora. */
  color?: string
  bg?: string
  border?: string
  small?: boolean
}) {
  const t = TONS[tom]
  return (
    <div
      className="rounded-2xl px-4 py-4 border"
      style={{ background: t.fundo, borderColor: t.borda, backgroundColor: 'var(--sup-1, #ffffff)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-slate-500 text-2xs font-semibold uppercase tracking-wide truncate">{label}</p>
          <p className={`${small ? 'text-xl' : 'text-metrica'} font-semibold tabular-nums tracking-tight mt-1.5 ${t.numero}`}>
            {value}
          </p>
          {sub && <p className="text-slate-500 text-xs mt-0.5">{sub}</p>}
        </div>
        {Icon && (
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: t.bloco }}
          >
            <Icon className={`w-4 h-4 ${t.icone}`} />
          </div>
        )}
      </div>
    </div>
  )
}
