'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Pencil, Trash2, Power } from 'lucide-react'
import { toggleAtivoEvento, deletarEvento } from '@/lib/actions'
import Link from 'next/link'

export default function EventoActions({ eventoId, ativo }: { eventoId: string; ativo: boolean }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleToggle = () => {
    setOpen(false)
    startTransition(() => toggleAtivoEvento(eventoId, ativo))
  }

  const handleDelete = () => {
    if (!confirm('Tem certeza? Isso vai apagar o evento e todos os dados relacionados.')) return
    setOpen(false)
    startTransition(() => deletarEvento(eventoId))
  }

  return (
    <div className="relative">
      <button
        onClick={e => { e.preventDefault(); setOpen(o => !o) }}
        disabled={isPending}
        className="p-2 rounded-lg hover:bg-[#21262d] text-slate-400 hover:text-white transition-colors disabled:opacity-50"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl z-20 w-44 py-1 overflow-hidden">
            <Link
              href={`/admin/eventos/${eventoId}/editar`}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-[#21262d] hover:text-white transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </Link>
            <button
              onClick={handleToggle}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-slate-300 hover:bg-[#21262d] hover:text-white transition-colors"
            >
              <Power className="w-3.5 h-3.5" />
              {ativo ? 'Encerrar' : 'Reativar'}
            </button>
            <div className="border-t border-[#30363d] my-1" />
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          </div>
        </>
      )}
    </div>
  )
}
