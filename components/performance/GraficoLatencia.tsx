'use client'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/** Mesmo padrão de cor/tooltip de components/charts-cliente.tsx — client component, Recharts mede o container no navegador. */
const COR = {
  linha: '#FF4A0F',
  eixo: 'var(--grafico-eixo)',
  grade: 'var(--grafico-grade)',
  superficie: 'var(--grafico-superficie)',
  borda: 'var(--grafico-borda)',
  texto: 'var(--grafico-texto)',
}
const EIXO = { fontSize: 11, fill: COR.eixo }

export type PontoLatencia = { hora: string; latenciaMs: number | null }

export function GraficoLatencia({ dados }: { dados: PontoLatencia[] }) {
  if (!dados.length) return <p className="text-slate-500 text-sm text-center py-16">Sem histórico ainda</p>
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={dados} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          <linearGradient id="g-latencia" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR.linha} stopOpacity={0.35} />
            <stop offset="100%" stopColor={COR.linha} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={COR.grade} vertical={false} />
        <XAxis dataKey="hora" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tick={EIXO} tickLine={false} axisLine={false} width={44} />
        <Tooltip
          cursor={{ stroke: COR.eixo, strokeWidth: 1, strokeDasharray: '3 3' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: COR.superficie, borderColor: COR.borda }}>
                <p className="font-medium" style={{ color: COR.texto }}>{String(label)}</p>
                <p className="tabular-nums" style={{ color: COR.texto }}>{payload[0]?.value ?? '—'}ms</p>
              </div>
            ) : null
          }
        />
        <Area type="monotone" dataKey="latenciaMs" stroke={COR.linha} strokeWidth={2.5} fill="url(#g-latencia)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}
