'use client'

import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'

/**
 * Gráficos de verdade, com Recharts.
 *
 * O que havia antes eram barras de CSS: úteis pra mostrar proporção, mas
 * incapazes de mostrar o que mais importa aqui — COMO a coisa evolui. Numa
 * operação de credenciamento a pergunta do dia não é "quantos por cento",
 * é "o pico de chegada já passou?" e "qual setor está atrasado?". Isso pede
 * eixo do tempo e comparação lado a lado.
 *
 * Recharts já estava no package.json sem nenhum uso.
 *
 * Client component porque Recharts mede o container no navegador. Só recebe
 * arrays de dados — nada de componente vindo do servidor.
 */

const COR = {
  entrada: '#22c55e',
  meio: '#3b82f6',
  fim: '#f59e0b',
  eixo: '#6b7a90',
  grade: '#1e2634',
  superficie: '#171e2b',
  borda: '#212a3a',
  texto: '#e5e7eb',
}

const EIXO = { fontSize: 11, fill: COR.eixo }

/** Caixa do tooltip — a do Recharts vem branca e estoura no tema escuro. */
function Caixa({ titulo, linhas }: { titulo: string; linhas: { nome: string; valor: number; cor: string }[] }) {
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-lg"
      style={{ background: COR.superficie, borderColor: COR.borda }}
    >
      <p className="font-medium mb-1.5" style={{ color: COR.texto }}>{titulo}</p>
      <div className="space-y-1">
        {linhas.map(l => (
          <div key={l.nome} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5" style={{ color: COR.eixo }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: l.cor }} />
              {l.nome}
            </span>
            <span className="tabular-nums font-medium" style={{ color: COR.texto }}>{l.valor}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Fluxo ao longo do dia ───────────────────────────────────────────────────

export type PontoFluxo = { hora: string; entrada: number; meio: number; fim: number }

/**
 * Curva de registros por hora, uma área por etapa.
 *
 * NÃO empilhado de propósito. Empilhado, a linha de cima é o total, mas ela
 * tem a cor da última série — quem olhasse leria "a saída teve pico de 43 às
 * 13h" quando naquela hora a saída é zero. Sobrepostas, cada curva conta a
 * própria história, e as três ondas (chegada, meio, saída) aparecem separadas
 * no tempo, que é justamente o que se quer enxergar.
 */
export function FluxoDoDia({ dados, vazioTexto }: { dados: PontoFluxo[]; vazioTexto?: string }) {
  const vazio = !dados.length || dados.every(d => d.entrada + d.meio + d.fim === 0)
  if (vazio) {
    return (
      <p className="text-slate-500 text-sm text-center py-16">
        {vazioTexto ?? 'Nenhum registro nesta janela'}
      </p>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={dados} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <defs>
          {(['entrada', 'meio', 'fim'] as const).map(k => (
            <linearGradient key={k} id={`g-${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COR[k]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={COR[k]} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke={COR.grade} vertical={false} />
        <XAxis dataKey="hora" tick={EIXO} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
        <YAxis tick={EIXO} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip
          cursor={{ stroke: COR.eixo, strokeWidth: 1, strokeDasharray: '3 3' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Caixa
                /* O rótulo já vem formatado da página ("03h" ou "05/08 03h"),
                   porque só ela sabe se a janela atravessa mais de um dia. */
                titulo={String(label)}
                linhas={[
                  { nome: 'Entrada', valor: Number(payload.find(p => p.dataKey === 'entrada')?.value ?? 0), cor: COR.entrada },
                  { nome: 'Meio', valor: Number(payload.find(p => p.dataKey === 'meio')?.value ?? 0), cor: COR.meio },
                  { nome: 'Saída', valor: Number(payload.find(p => p.dataKey === 'fim')?.value ?? 0), cor: COR.fim },
                ]}
              />
            ) : null
          }
        />
        <Area type="monotone" dataKey="entrada" stroke={COR.entrada} strokeWidth={2} fill="url(#g-entrada)" />
        <Area type="monotone" dataKey="meio" stroke={COR.meio} strokeWidth={2} fill="url(#g-meio)" />
        <Area type="monotone" dataKey="fim" stroke={COR.fim} strokeWidth={2} fill="url(#g-fim)" />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ─── Presença por setor ──────────────────────────────────────────────────────

export type BarraSetor = { setor: string; presentes: number; faltam: number; total: number }

/**
 * Barra horizontal por setor: presentes e quem falta, na mesma barra. Ordena
 * pelo que falta — quem está mais atrasado sobe, que é a leitura útil quando
 * o evento está acontecendo.
 */
export function PresencaPorSetor({ dados }: { dados: BarraSetor[] }) {
  if (!dados.length) {
    return <p className="text-slate-500 text-sm text-center py-16">Nenhum setor com equipe cadastrada</p>
  }
  const altura = Math.max(160, dados.length * 38 + 24)
  return (
    <ResponsiveContainer width="100%" height={altura}>
      <BarChart data={dados} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barCategoryGap={12}>
        <CartesianGrid stroke={COR.grade} horizontal={false} />
        <XAxis type="number" tick={EIXO} tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="setor"
          tick={{ ...EIXO, fill: COR.texto }}
          tickLine={false}
          axisLine={false}
          width={110}
        />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.06)' }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <Caixa
                titulo={String(label)}
                linhas={[
                  { nome: 'Presentes', valor: Number(payload.find(p => p.dataKey === 'presentes')?.value ?? 0), cor: COR.entrada },
                  { nome: 'Faltam', valor: Number(payload.find(p => p.dataKey === 'faltam')?.value ?? 0), cor: COR.eixo },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="presentes" stackId="a" fill={COR.entrada} radius={[3, 0, 0, 3]} />
        <Bar dataKey="faltam" stackId="a" radius={[0, 3, 3, 0]}>
          {dados.map((d, i) => (
            // Setor completo não tem faixa cinza — a barra fica verde inteira.
            <Cell key={i} fill={d.faltam === 0 ? COR.entrada : 'rgba(148,163,184,0.18)'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
