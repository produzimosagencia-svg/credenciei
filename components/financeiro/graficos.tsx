'use client'

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

/**
 * Os gráficos do dashboard Financeiro — mesmo padrão de `charts-cliente.tsx`
 * (cores do tema via `var()`, tooltip própria porque a do Recharts vem
 * branca e estoura no tema escuro). Client component: Recharts mede o
 * container no navegador.
 */

const COR = {
  faturamento: '#22C55E',
  custos: '#F59E0B',
  lucro: 'var(--grafico-entrada, #FF4A0F)',
  eixo: 'var(--grafico-eixo)',
  grade: 'var(--grafico-grade)',
  superficie: 'var(--grafico-superficie)',
  borda: 'var(--grafico-borda)',
  texto: 'var(--grafico-texto)',
}

const EIXO = { fontSize: 11, fill: COR.eixo }

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

function Caixa({ titulo, linhas }: { titulo: string; linhas: { nome: string; valor: number; cor: string }[] }) {
  return (
    <div className="rounded-lg border px-3 py-2 text-xs shadow-lg" style={{ background: COR.superficie, borderColor: COR.borda }}>
      <p className="font-medium mb-1.5" style={{ color: COR.texto }}>{titulo}</p>
      <div className="space-y-1">
        {linhas.map(l => (
          <div key={l.nome} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5" style={{ color: COR.eixo }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: l.cor }} />
              {l.nome}
            </span>
            <span className="tabular-nums font-medium" style={{ color: COR.texto }}>{brl(l.valor)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Faturamento × Custos × Lucro, por evento ────────────────────────────────

export type LinhaPorEvento = { evento: string; faturamento: number; custos: number; lucro: number }

/**
 * Uma barra por evento, três séries lado a lado. Cobre também "custos por
 * evento" do pedido — é a mesma informação, e duplicar o gráfico só pra
 * isolar uma das três séries não ajudaria ninguém a ler mais rápido.
 */
export function FaturamentoCustosLucroPorEvento({ dados }: { dados: LinhaPorEvento[] }) {
  if (!dados.length) {
    return <p className="text-slate-500 text-sm text-center py-16">Nenhum evento com faturamento ou custo neste recorte</p>
  }
  const altura = Math.max(180, dados.length * 46 + 24)
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={14}>
        <CartesianGrid stroke={COR.grade} horizontal={false} />
        <XAxis type="number" tick={EIXO} tickLine={false} axisLine={false} tickFormatter={brl} />
        <YAxis
          type="category" dataKey="evento"
          tick={{ ...EIXO, fill: COR.texto }} tickLine={false} axisLine={false}
          width={140}
        />
        <Tooltip
          cursor={{ fill: 'var(--grafico-grade)' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Caixa
                titulo={String(label)}
                linhas={[
                  { nome: 'Faturamento', valor: Number(payload.find(p => p.dataKey === 'faturamento')?.value ?? 0), cor: COR.faturamento },
                  { nome: 'Custos', valor: Number(payload.find(p => p.dataKey === 'custos')?.value ?? 0), cor: COR.custos },
                  { nome: 'Lucro', valor: Number(payload.find(p => p.dataKey === 'lucro')?.value ?? 0), cor: COR.lucro },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="faturamento" fill={COR.faturamento} radius={[0, 3, 3, 0]} />
        <Bar dataKey="custos" fill={COR.custos} radius={[0, 3, 3, 0]} />
        <Bar dataKey="lucro" fill={COR.lucro} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// ─── Evolução ao longo do tempo ──────────────────────────────────────────────

export type PontoEvolucao = { periodo: string; faturamento: number; custos: number; lucro: number }

/** Faturamento, custos e lucro por mês — as duas "evoluções" do pedido, na mesma linha do tempo. */
export function EvolucaoFinanceira({ dados }: { dados: PontoEvolucao[] }) {
  if (dados.length < 2) {
    return <p className="text-slate-500 text-sm text-center py-16">Precisa de pelo menos dois meses com movimento pra desenhar a evolução</p>
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={dados} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
        <defs>
          {(['faturamento', 'custos', 'lucro'] as const).map(k => (
            <linearGradient key={k} id={`fin-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COR[k]} stopOpacity={k === 'lucro' ? 0.4 : 0.12} />
              <stop offset="100%" stopColor={COR[k]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={COR.grade} vertical={false} />
        <XAxis dataKey="periodo" tick={EIXO} tickLine={false} axisLine={false} />
        <YAxis tick={EIXO} tickLine={false} axisLine={false} width={54} tickFormatter={brl} />
        <Tooltip
          cursor={{ stroke: COR.eixo, strokeWidth: 1, strokeDasharray: '3 3' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Caixa
                titulo={String(label)}
                linhas={[
                  { nome: 'Faturamento', valor: Number(payload.find(p => p.dataKey === 'faturamento')?.value ?? 0), cor: COR.faturamento },
                  { nome: 'Custos', valor: Number(payload.find(p => p.dataKey === 'custos')?.value ?? 0), cor: COR.custos },
                  { nome: 'Lucro', valor: Number(payload.find(p => p.dataKey === 'lucro')?.value ?? 0), cor: COR.lucro },
                ]}
              />
            ) : null
          }
        />
        <Area type="monotone" dataKey="faturamento" stroke={COR.faturamento} strokeWidth={2} fill="url(#fin-faturamento)" />
        <Area type="monotone" dataKey="custos" stroke={COR.custos} strokeWidth={2} strokeDasharray="4 3" fill="url(#fin-custos)" />
        <Area type="monotone" dataKey="lucro" stroke={COR.lucro} strokeWidth={2.5} fill="url(#fin-lucro)" className="neon-line" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Distribuição dos custos por categoria ───────────────────────────────────

export type FatiaCategoria = { categoria: string; total: number }

export function CustosPorCategoria({ dados }: { dados: FatiaCategoria[] }) {
  if (!dados.length) {
    return <p className="text-slate-500 text-sm text-center py-16">Nenhum custo lançado neste recorte</p>
  }
  const altura = Math.max(160, dados.length * 38 + 24)
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={12}>
        <CartesianGrid stroke={COR.grade} horizontal={false} />
        <XAxis type="number" tick={EIXO} tickLine={false} axisLine={false} tickFormatter={brl} />
        <YAxis
          type="category" dataKey="categoria"
          tick={{ ...EIXO, fill: COR.texto }} tickLine={false} axisLine={false}
          width={160}
        />
        <Tooltip
          cursor={{ fill: 'var(--grafico-grade)' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Caixa titulo={String(label)} linhas={[{ nome: 'Total', valor: Number(payload[0]?.value ?? 0), cor: COR.custos }]} />
            ) : null
          }
        />
        <Bar dataKey="total" fill={COR.custos} radius={[0, 3, 3, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
