'use client'

import {
  Bar, BarChart, CartesianGrid, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { DadosGraficos } from '@/lib/gastos'

/**
 * Os dois gráficos do painel de Gastos, depois da simplificação (10/09/2026):
 * a EVOLUÇÃO (linha, por dia) e o POR CATEGORIA (barra). Os outros três
 * (por dia em barra, por fornecedor, acumulada, donut %) saíram — poluíam.
 *
 * Cores do tema via `var(--grafico-*)`, tooltip própria (a do Recharts vem
 * branca e some no tema escuro), client component porque o Recharts mede o
 * container no navegador.
 */

const COR = {
  barra: '#F59E0B',
  linha: 'var(--grafico-entrada, #FF4A0F)',
  eixo: 'var(--grafico-eixo)',
  grade: 'var(--grafico-grade)',
  superficie: 'var(--grafico-superficie)',
  borda: 'var(--grafico-borda)',
  texto: 'var(--grafico-texto)',
}

const EIXO = { fontSize: 11, fill: COR.eixo }
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const diaCurto = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`

function Caixa({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: COR.superficie, borderColor: COR.borda }}>
      <p className="font-medium mb-1" style={{ color: COR.texto }}>{titulo}</p>
      <p className="tabular-nums font-semibold" style={{ color: COR.texto }}>{brl(valor)}</p>
    </div>
  )
}

const Vazio = ({ texto }: { texto: string }) => (
  <p className="text-slate-500 text-sm text-center py-16">{texto}</p>
)

// ─── Evolução dos gastos (LINHA, por dia) ───────────────────────────────────

export function EvolucaoGastos({ dados }: { dados: DadosGraficos['porDia'] }) {
  if (dados.length < 2) return <Vazio texto="Precisa de pelo menos dois dias com gasto pra desenhar a evolução" />
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={dados} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={COR.grade} vertical={false} />
        <XAxis dataKey="dia" tick={EIXO} tickLine={false} axisLine={false} tickFormatter={diaCurto} minTickGap={24} />
        <YAxis tick={EIXO} tickLine={false} axisLine={false} width={54} tickFormatter={brl} />
        <Tooltip
          cursor={{ stroke: COR.eixo, strokeWidth: 1, strokeDasharray: '3 3' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? <Caixa titulo={diaCurto(String(label))} valor={Number(payload[0]?.value ?? 0)} /> : null}
        />
        <Line
          type="monotone"
          dataKey="total"
          stroke={COR.linha}
          strokeWidth={2.5}
          dot={{ r: 3, fill: COR.linha, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// ─── Gastos por categoria (barra horizontal) ────────────────────────────────

export function GastosPorCategoria({ dados }: { dados: DadosGraficos['porCategoria'] }) {
  if (!dados.length) return <Vazio texto="Nenhum gasto neste recorte" />
  const altura = Math.max(160, dados.length * 38 + 24)
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={12}>
        <CartesianGrid stroke={COR.grade} horizontal={false} />
        <XAxis type="number" tick={EIXO} tickLine={false} axisLine={false} tickFormatter={brl} />
        <YAxis type="category" dataKey="categoria" tick={{ ...EIXO, fill: COR.texto }} tickLine={false} axisLine={false} width={120} />
        <Tooltip
          cursor={{ fill: 'var(--grafico-grade)' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? <Caixa titulo={String(label)} valor={Number(payload[0]?.value ?? 0)} /> : null}
        />
        <Bar dataKey="total" fill={COR.barra} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
