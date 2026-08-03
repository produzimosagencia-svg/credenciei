'use client'
import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { PERIODOS_COBRANCA as PERIODOS, sufixoPeriodo, type PeriodoCobranca } from '@/lib/cobranca'

function formatarReal(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function ValorCobradoPicker({
  name, periodoName, defaultValor, defaultPeriodo = 'mensal', placeholder = 'Valor cobrado (opcional)',
}: {
  name: string
  periodoName: string
  defaultValor?: number | null
  defaultPeriodo?: PeriodoCobranca
  placeholder?: string
}) {
  const [valor, setValor] = useState<number | null>(defaultValor ?? null)
  const [periodo, setPeriodo] = useState<PeriodoCobranca>(defaultPeriodo)
  const [open, setOpen] = useState(false)
  const [rascunhoValor, setRascunhoValor] = useState('')
  const [rascunhoPeriodo, setRascunhoPeriodo] = useState<PeriodoCobranca>('mensal')

  const abrir = () => {
    setRascunhoValor(valor != null ? String(valor).replace('.', ',') : '')
    setRascunhoPeriodo(periodo)
    setOpen(true)
  }

  const aplicar = () => {
    const n = parseFloat(rascunhoValor.replace(',', '.'))
    if (Number.isFinite(n) && n > 0) {
      setValor(n)
      setPeriodo(rascunhoPeriodo)
    } else {
      setValor(null)
    }
    setOpen(false)
  }

  const limpar = () => {
    setValor(null)
    setOpen(false)
  }

  const exibicao = valor != null ? `${formatarReal(valor)}${sufixoPeriodo(periodo)}` : ''

  return (
    <>
      <input type="hidden" name={name} value={valor ?? ''} />
      <input type="hidden" name={periodoName} value={periodo} />
      <button
        type="button"
        onClick={abrir}
        className="input flex items-center justify-between text-left"
      >
        <span className={`tabular-nums ${exibicao ? 'text-slate-800' : 'text-slate-400'}`}>{exibicao || placeholder}</span>
        <Wallet className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div
            className="modal-pop-in relative bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 space-y-5">
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Valor</p>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input
                    autoFocus
                    type="text"
                    inputMode="decimal"
                    value={rascunhoValor}
                    onChange={e => setRascunhoValor(e.target.value.replace(/[^\d,]/g, ''))}
                    placeholder="0,00"
                    // .input define padding no globals.css e vence o pl-* do Tailwind
                    style={{ paddingLeft: 42 }}
                    className="input text-lg font-semibold tabular-nums"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Cobrança</p>
                <div className="grid grid-cols-2 gap-2">
                  {PERIODOS.map(p => (
                    <button
                      key={p.valor}
                      type="button"
                      onClick={() => setRascunhoPeriodo(p.valor)}
                      className={`text-sm font-medium py-2.5 rounded-xl border transition-colors ${
                        rascunhoPeriodo === p.valor
                          ? 'bg-brand-500 border-brand-500 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4 bg-slate-50">
              <button type="button" onClick={limpar} className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors">
                Limpar
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 transition-colors">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={aplicar}
                  className="btn-press bg-brand-500 hover:bg-brand-600 text-white text-sm font-semibold px-5 py-2 rounded-xl"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
