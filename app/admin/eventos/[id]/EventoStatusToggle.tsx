'use client'
import { useTransition } from 'react'
import { toggleAtivoEvento } from '@/lib/actions'
import { Power } from 'lucide-react'

export default function EventoStatusToggle({ eventoId, ativo }: { eventoId: string; ativo: boolean }) {
  const [isPending, startTransition] = useTransition()
  return (
    <button
      onClick={() => startTransition(() => toggleAtivoEvento(eventoId, ativo))}
      disabled={isPending}
      className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg transition-colors disabled:opacity-50 ${
        ativo ? 'bg-yellow-900/30 hover:bg-yellow-900/50 text-yellow-400' : 'bg-green-900/30 hover:bg-green-900/50 text-green-400'
      }`}
    >
      <Power className="w-3.5 h-3.5" />
      {ativo ? 'Encerrar' : 'Reativar'}
    </button>
  )
}
