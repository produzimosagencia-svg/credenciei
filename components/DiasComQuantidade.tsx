'use client'
import SeletorDiasEscala, { LegendaFases } from '@/components/SeletorDiasEscala'
import { rotuloDoDia, type DiaDaEscala } from '@/lib/escala-regras'

/**
 * Dias de trabalho COM quantidade de pessoas em cada um — a grade de dias padrão do sistema
 * (`SeletorDiasEscala`, a mesma do cadastro da equipe e de Editar evento, com a cor de cada fase) e, para os dias
 * marcados, o número de pessoas. Usada no pedido de setor (formulário público e edição do admin).
 *
 * `valores` é "YYYY-MM-DD" → texto do campo; um dia está marcado quando tem chave. Ao marcar, o dia já vem com
 * `sugestao` (o total do setor), que é o caso mais comum — quem precisa ajusta só os diferentes.
 */
export default function DiasComQuantidade({
  dias, valores, onChange, sugestao = '', desabilitado = false,
}: {
  dias: DiaDaEscala[]
  valores: Record<string, string>
  onChange: (valores: Record<string, string>) => void
  sugestao?: string
  desabilitado?: boolean
}) {
  const marcados = dias.map(d => d.data).filter(d => d in valores)

  const alternar = (dia: string) => {
    const novo = { ...valores }
    if (dia in novo) delete novo[dia]
    else novo[dia] = sugestao
    onChange(novo)
  }

  return (
    <div className="space-y-3">
      <SeletorDiasEscala dias={dias} marcados={marcados} onAlternar={alternar} desabilitado={desabilitado} />
      {marcados.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-slate-500 text-xs">Pessoas em cada dia marcado:</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {marcados.map(dia => {
              const r = rotuloDoDia(dia)
              return (
                <label key={dia} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                  <span className="text-xs font-semibold text-slate-700 capitalize whitespace-nowrap">{r.semanaCurta} {r.curto}</span>
                  <input
                    type="number" inputMode="numeric" min={1} placeholder="Qtd" aria-label={`Pessoas em ${r.curto}`}
                    disabled={desabilitado}
                    className="input py-1 px-2 text-sm tabular-nums text-center min-w-0 w-full"
                    value={valores[dia]}
                    onChange={e => onChange({ ...valores, [dia]: e.target.value })}
                  />
                </label>
              )
            })}
          </div>
        </div>
      )}
      <LegendaFases />
    </div>
  )
}
