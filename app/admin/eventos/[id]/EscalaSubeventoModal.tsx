'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarRange, X } from 'lucide-react'
import { salvarEscalasDoFornecedor } from '@/lib/actions'

type Subevento = { id: string; nome: string }
type Escala = { subevento_id: string; cota: number | null }

/**
 * "Ele só vê os subeventos em que foi escalado" (Vital, 30/09/2026) — um
 * checkbox por subevento + cota própria da escala (vazio = sem limite).
 * Só existe quando o evento já tem pelo menos 1 subevento cadastrado.
 */
export default function EscalaSubeventoModal({
  fornecedorId, eventoId, fornecedorNome, subeventos, escalasAtuais,
}: {
  fornecedorId: string
  eventoId: string
  fornecedorNome: string
  subeventos: Subevento[]
  escalasAtuais: Escala[]
}) {
  const [open, setOpen] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const mapaAtual = new Map(escalasAtuais.map(e => [e.subevento_id, e.cota]))
  const [marcados, setMarcados] = useState<Record<string, boolean>>(
    () => Object.fromEntries(subeventos.map(s => [s.id, mapaAtual.has(s.id)])),
  )
  const [cotas, setCotas] = useState<Record<string, string>>(
    () => Object.fromEntries(subeventos.map(s => [s.id, mapaAtual.get(s.id) != null ? String(mapaAtual.get(s.id)) : ''])),
  )

  const salvar = () => {
    setErro(null)
    startTransition(async () => {
      const escalas = subeventos.map(s => ({
        subeventoId: s.id,
        escalado: !!marcados[s.id],
        cota: cotas[s.id]?.trim() ? Number(cotas[s.id]) : null,
      }))
      const r = await salvarEscalasDoFornecedor(fornecedorId, eventoId, escalas)
      if (r?.error) { setErro(r.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  if (!subeventos.length) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        title="Escalar em subeventos"
      >
        <CalendarRange className="w-3.5 h-3.5" />
      </button>
      {open && (
        <div className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="modal-pop-in bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-slate-800 font-bold text-base">Escalar {fornecedorNome}</h3>
              <button onClick={() => setOpen(false)} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-500 text-xs mb-3">
              Em quais subeventos esta equipe trabalha, e a cota de cada um (vazio = sem limite).
            </p>
            <div className="space-y-2.5 max-h-80 overflow-y-auto">
              {subeventos.map(s => (
                <div key={s.id} className="flex items-center gap-2.5 bg-slate-50 rounded-xl p-2.5">
                  <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!marcados[s.id]}
                      onChange={e => setMarcados(m => ({ ...m, [s.id]: e.target.checked }))}
                      className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400 shrink-0"
                    />
                    <span className="text-sm text-slate-700 truncate">{s.nome}</span>
                  </label>
                  {marcados[s.id] && (
                    <input
                      type="number"
                      min="0"
                      placeholder="Sem limite"
                      value={cotas[s.id] ?? ''}
                      onChange={e => setCotas(c => ({ ...c, [s.id]: e.target.value }))}
                      className="input w-24 text-sm tabular-nums shrink-0"
                    />
                  )}
                </div>
              ))}
            </div>
            {erro && <p className="text-red-500 text-xs mt-3">{erro}</p>}
            <button onClick={salvar} disabled={isPending} className="btn btn-primario w-full mt-4">
              {isPending ? 'Salvando...' : 'Salvar escalas'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
