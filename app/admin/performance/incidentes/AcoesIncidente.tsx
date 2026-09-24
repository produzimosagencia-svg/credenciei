'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, EyeOff } from 'lucide-react'
import { marcarIncidente } from '@/lib/actions-performance'

export default function AcoesIncidente({ incidenteId }: { incidenteId: string }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const mudar = (status: 'resolvido' | 'ignorado') => {
    setErro(null)
    startTransition(async () => {
      const r = await marcarIncidente(incidenteId, status)
      if (!r.ok) { setErro(r.erro); return }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1">
      {erro && <span className="text-red-600 text-2xs">{erro}</span>}
      <button onClick={() => mudar('resolvido')} disabled={pendente} className="btn-press p-1.5 text-slate-400 hover:text-green-600 rounded-lg" aria-label="Marcar como resolvido">
        <Check className="w-3.5 h-3.5" />
      </button>
      <button onClick={() => mudar('ignorado')} disabled={pendente} className="btn-press p-1.5 text-slate-400 hover:text-slate-600 rounded-lg" aria-label="Ignorar">
        <EyeOff className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
