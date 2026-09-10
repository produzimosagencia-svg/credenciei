'use client'

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import type { DadosGraficos } from '@/lib/gastos'

/**
 * Os gráficos do painel de Gastos — mesmo padrão de
 * `components/financeiro/graficos.tsx`: cores do tema via `var(--grafico-*)`,
 * tooltip própria (a do Recharts vem branca e some no tema escuro), client
 * component porque o Recharts mede o container no navegador.
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

// ─── Gastos por categoria ────────────────────────────────────────────────────

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

// ─── Gastos por dia ──────────────────────────────────────────────────────────

export function GastosPorDia({ dados }: { dados: DadosGraficos['porDia'] }) {
  if (!dados.length) return <Vazio texto="Nenhum gasto neste recorte" />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={dados} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
        <CartesianGrid stroke={COR.grade} vertical={false} />
        <XAxis dataKey="dia" tick={EIXO} tickLine={false} axisLine={false} tickFormatter={diaCurto} />
        <YAxis tick={EIXO} tickLine={false} axisLine={false} width={54} tickFormatter={brl} />
        <Tooltip
          cursor={{ fill: 'var(--grafico-grade)' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? <Caixa titulo={diaCurto(String(label))} valor={Number(payload[0]?.value ?? 0)} /> : null}
        />
        <Bar dataKey="total" fill={COR.barra} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Gastos por fornecedor ───────────────────────────────────────────────────

export function GastosPorFornecedor({ dados }: { dados: DadosGraficos['porFornecedor'] }) {
  if (!dados.length) return <Vazio texto="Nenhum fornecedor neste recorte" />
  const altura = Math.max(140, dados.length * 36 + 24)
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={12}>
        <CartesianGrid stroke={COR.grade} horizontal={false} />
        <XAxis type="number" tick={EIXO} tickLine={false} axisLine={false} tickFormatter={brl} />
        <YAxis type="category" dataKey="fornecedor" tick={{ ...EIXO, fill: COR.texto }} tickLine={false} axisLine={false} width={130} />
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

// ─── Evolução acumulada ──────────────────────────────────────────────────────

export function EvolucaoAcumulada({ dados }: { dados: DadosGraficos['acumulado'] }) {
  if (dados.length < 2) return <Vazio texto="Precisa de pelo menos dois dias com gasto pra desenhar a evolução" />
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={dados} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
        <defs>
          <linearGradient id="gastos-acum" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COR.linha} stopOpacity={0.35} />
            <stop offset="100%" stopColor={COR.linha} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke={COR.grade} vertical={false} />
        <XAxis dataKey="dia" tick={EIXO} tickLine={false} axisLine={false} tickFormatter={diaCurto} />
        <YAxis tick={EIXO} tickLine={false} axisLine={false} width={54} tickFormatter={brl} />
        <Tooltip
          cursor={{ stroke: COR.eixo, strokeWidth: 1, strokeDasharray: '3 3' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? <Caixa titulo={`Até ${diaCurto(String(label))}`} valor={Number(payload[0]?.value ?? 0)} /> : null}
        />
        <Area type="monotone" dataKey="total" stroke={COR.linha} strokeWidth={2.5} fill="url(#gastos-acum)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Distribuição percentual ─────────────────────────────────────────────────

const PALETA = ['#F59E0B', '#FF4A0F', '#22C55E', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#EAB308', '#64748B', '#F97316', '#06B6D4', '#A3A3A3']

/**
 * Donut de composição, desenhado à mão (SVG) — o mesmo desenho de
 * `DonutComposicao` em components/charts.tsx, redesenhado aqui só pra não
 * arrastar a legenda daquele componente, que não serve a este layout.
 */
export function DistribuicaoPercentual({ dados }: { dados: DadosGraficos['distribuicao'] }) {
  if (!dados.length) return <Vazio texto="Nenhum gasto neste recorte" />
  const total = dados.reduce((s, d) => s + d.total, 0)
  const R = 40
  const C = 2 * Math.PI * R
  const GAP = dados.length > 1 ? 2 : 0

  // Soma corrida ANTES do map — o offset de cada fatia é o total das
  // anteriores, sem mutar variável durante o render.
  const comprimentos = dados.map(d => (d.total / total) * C)
  const fatias = dados.map((d, i) => ({
    categoria: d.categoria,
    cor: PALETA[i % PALETA.length],
    dash: Math.max(comprimentos[i] - GAP, 0.5),
    offset: -comprimentos.slice(0, i).reduce((s, c) => s + c, 0),
    pct: (d.total / total) * 100,
  }))

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg width="128" height="128" viewBox="0 0 100 100" aria-hidden="true" className="shrink-0">
        <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-neutro-100)" strokeWidth="12" />
        {fatias.map((f, i) => (
          <circle
            key={i}
            cx="50" cy="50" r={R} fill="none"
            stroke={f.cor} strokeWidth="12"
            strokeDasharray={`${f.dash} ${C - f.dash}`}
            strokeDashoffset={f.offset}
            transform="rotate(-90 50 50)"
          />
        ))}
      </svg>
      <ul className="space-y-1.5 text-sm min-w-0">
        {fatias.map((f, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: f.cor }} />
            <span className="text-slate-600 truncate">{f.categoria}</span>
            <span className="text-slate-400 tabular-nums ml-auto pl-2">{f.pct.toFixed(0)}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
