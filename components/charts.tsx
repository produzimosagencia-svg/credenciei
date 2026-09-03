// Gráficos do painel — HTML/SVG puro (server components, zero JS no cliente).
// Regras seguidas (skill dataviz): magnitude usa UM tom só (roxo da marca);
// identidade de etapa usa a paleta validada contra daltonismo
// (verde/azul/âmbar, todos os checks do validador passando); texto sempre em
// tons neutros (a cor fica na marca do gráfico, nunca no texto); números com
// tabular-nums; gap de 2px entre fatias; rótulo direto em tudo (sem depender
// de cor pra identificar nada). Marcas com gradiente sutil + brilho (glow) e
// entrada em cascata (stagger) pra dar mais vida, sem virar decoração vazia
// (skill UI wiki: stagger < 50ms/item, gradiente que "não dá pra perceber
// que é gradiente", sombra colorida pra profundidade).

/**
 * Cor de etapa. São as MESMAS três cores de status do sistema (sucesso,
 * acento, aviso) — não uma paleta paralela só pra gráfico. Continua
 * CVD-safe sobre fundo claro.
 */
export const COR_ETAPA = {
  entrada: '#FF4A0F',
  // Variáveis (globals.css) porque o "meio" é branco no tema escuro e
  // quase preto no claro — um valor fixo sumiria num dos dois.
  meio: 'var(--grafico-meio)',
  fim: 'var(--grafico-fim)',
} as const

const pct = (valor: number, total: number) => (total > 0 ? Math.round((valor / total) * 100) : 0)

/**
 * Lista de barras horizontais de magnitude (estilo "sales by countries" da
 * referência): rótulo à esquerda, barra fina, valor à direita.
 */
export function BarrasMagnitude({ itens }: { itens: { label: string; valor: number; total: number }[] }) {
  return (
    <div className="space-y-4">
      {itens.map((item, i) => (
        <div key={item.label}>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <p className="text-slate-700 text-sm font-medium truncate">{item.label}</p>
            <p className="text-slate-500 text-xs tabular-nums shrink-0">
              {item.valor}/{item.total} <span className="text-slate-400">· {pct(item.valor, item.total)}%</span>
            </p>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="barra-entrada h-full rounded-full"
              style={{
                width: `${pct(item.valor, item.total)}%`,
                background: 'var(--laranja)',
                animationDelay: `${Math.min(i, 8) * 45}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Trio de barras de progresso por etapa (Entrada/Meio/Saída), com a cor de
 * identidade de cada etapa. Usado nas telas de evento e de setor.
 */
export function ProgressoEtapas({ itens }: { itens: { label: string; valor: number; total: number; cor: string }[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5">
      {itens.map((item, i) => (
        <div key={item.label}>
          <div className="flex items-baseline justify-between gap-2 mb-1.5">
            <p className="flex items-center gap-1.5 text-slate-600 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: item.cor }} />
              {item.label}
            </p>
            <p className="text-slate-500 text-xs tabular-nums shrink-0">
              {item.valor}/{item.total} <span className="text-slate-400">· {pct(item.valor, item.total)}%</span>
            </p>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="barra-entrada h-full rounded-full"
              style={{
                width: `${pct(item.valor, item.total)}%`,
                background: item.cor,
                animationDelay: `${Math.min(i, 8) * 45}ms`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Distribuição em barras horizontais, com o total em cima.
 *
 * Substitui o donut que havia aqui. Comparar três valores num donut é
 * comparar ÂNGULO, que o olho faz mal; em barra é comparar comprimento a
 * partir de uma linha de base comum, que é a comparação mais fácil que
 * existe. Donut também obriga a legenda ao lado — dois lugares pra ler o
 * mesmo dado.
 */
export function DistribuicaoEtapas({ itens }: { itens: { label: string; valor: number; cor: string }[] }) {
  const total = itens.reduce((acc, i) => acc + i.valor, 0)
  return (
    <div className="space-y-3.5">
      <div className="flex items-baseline gap-1.5">
        <span className="text-slate-800 text-metrica font-semibold tabular-nums tracking-tight">
          {total}
        </span>
        <span className="text-slate-500 text-xs">registros no total</span>
      </div>
      <div className="space-y-2.5">
        {itens.map((item, i) => (
          <div key={item.label}>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <p className="flex items-center gap-1.5 text-slate-700 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: item.cor }} />
                {item.label}
              </p>
              <p className="text-slate-500 text-xs tabular-nums shrink-0">
                <span className="text-slate-800 font-medium">{item.valor}</span>
                <span className="text-slate-400"> · {pct(item.valor, total)}%</span>
              </p>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="barra-entrada h-full rounded-full"
                style={{
                  width: `${pct(item.valor, total)}%`,
                  background: item.cor,
                  animationDelay: `${Math.min(i, 8) * 45}ms`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Donut de composição — mantido porque outras telas podem usar, mas o
 * painel passou a usar DistribuicaoEtapas acima.
 */
export function DonutComposicao({
  dados,
  rotuloCentro,
}: {
  dados: { label: string; valor: number; cor: string }[]
  rotuloCentro: string
}) {
  const total = dados.reduce((acc, d) => acc + d.valor, 0)
  const R = 40
  const C = 2 * Math.PI * R
  const GAP = 2
  const comValor = dados.filter(d => d.valor > 0)

  let offsetAcumulado = 0
  const fatias = comValor.map(d => {
    const comprimento = (d.valor / total) * C
    const fatia = {
      cor: d.cor,
      // Fatia única não tem vizinha — sem gap; senão desconta o gap do traço
      dash: comValor.length > 1 ? Math.max(comprimento - GAP, 0.5) : comprimento,
      offset: -offsetAcumulado,
    }
    offsetAcumulado += comprimento
    return fatia
  })

  return (
    <div className="flex items-center gap-6 flex-wrap">
      <div className="relative shrink-0">
        <svg width="128" height="128" viewBox="0 0 100 100" aria-hidden="true">
          <circle cx="50" cy="50" r={R} fill="none" stroke="var(--color-neutro-100)" strokeWidth="12" />
          {total > 0 && fatias.map((f, i) => (
            <circle
              key={i}
              className="donut-fatia"
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={f.cor}
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${f.dash} ${C - f.dash}`}
              strokeDashoffset={f.offset}
              transform="rotate(-90 50 50)"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-slate-800 text-xl font-bold tabular-nums leading-none">{total}</p>
          <p className="text-slate-400 text-2xs mt-0.5">{rotuloCentro}</p>
        </div>
      </div>

      <div className="flex-1 min-w-36 space-y-2">
        {dados.map(d => (
          <div key={d.label} className="flex items-center justify-between gap-3 px-2 py-1 -mx-2 rounded-lg hover:bg-slate-50 transition-colors">
            <p className="flex items-center gap-2 text-slate-600 text-sm">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.cor }} />
              {d.label}
            </p>
            <p className="text-slate-700 text-sm font-semibold tabular-nums">
              {d.valor} <span className="text-slate-400 font-normal text-xs">· {pct(d.valor, total)}%</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
