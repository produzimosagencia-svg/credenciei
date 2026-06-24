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
      className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl transition-all disabled:opacity-50 font-medium border ${
        ativo
          ? 'bg-red-50 hover:bg-red-100 text-red-600 border-red-200'
          : 'bg-green-50 hover:bg-green-100 text-green-600 border-green-200'
      }`}
    >
      <Power className="w-3.5 h-3.5" />
      {ativo ? 'Encerrar' : 'Reativar'}
    </button>
  )
}
