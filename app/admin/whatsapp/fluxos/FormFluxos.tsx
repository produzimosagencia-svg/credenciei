'use client'
import { useState, useTransition } from 'react'
import { Save, Check, AlertCircle } from 'lucide-react'
import { salvarFluxos } from '@/lib/actions-whatsapp'

export default function FormFluxos({
  fluxos, ativos,
}: {
  fluxos: { chave: string; titulo: string; descricao: string; quando: string }[]
  ativos: Record<string, boolean>
}) {
  const [estado, setEstado] = useState(ativos)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState(false)
  const [pendente, startTransition] = useTransition()

  const salvar = () => {
    setErro(null); setFeito(false)
    startTransition(async () => {
      try { await salvarFluxos(estado); setFeito(true) }
      catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar.') }
    })
  }

  return (
    <div className="space-y-3">
      {fluxos.map(f => (
        <label key={f.chave} className="flex items-start gap-3 border border-slate-200 rounded-xl p-3 cursor-pointer hover:border-brand-300 transition-colors">
          <input
            type="checkbox"
            checked={estado[f.chave] !== false}
            onChange={e => { setEstado(a => ({ ...a, [f.chave]: e.target.checked })); setFeito(false) }}
            className="mt-0.5 w-4 h-4 shrink-0 accent-brand-500"
          />
          <span className="min-w-0">
            <span className="block text-slate-800 text-sm font-medium">{f.titulo}</span>
            <span className="block text-slate-500 text-xs mt-0.5">{f.descricao}</span>
            <span className="block text-slate-400 text-2xs mt-0.5">Dispara: {f.quando}</span>
          </span>
        </label>
      ))}

      {erro && <p className="flex items-start gap-1.5 text-erro-600 text-xs"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}</p>}
      {feito && <p className="flex items-center gap-1.5 text-green-700 text-xs"><Check className="w-3.5 h-3.5" /> Salvo.</p>}

      <button onClick={salvar} disabled={pendente} className="btn btn-primario">
        <Save className="w-4 h-4 shrink-0" /> {pendente ? 'Salvando…' : 'Salvar'}
      </button>
    </div>
  )
}
