'use client'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { deletarUsuario } from '@/lib/actions'

export default function UsuarioActions({ usuarioId, usuarioNome }: { usuarioId: string; usuarioNome: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    if (!confirm(`Excluir usuário "${usuarioNome}"? Todos os eventos e dados vinculados a ele serão removidos.`)) return
    setOpen(false)
    startTransition(async () => {
      await deletarUsuario(usuarioId)
      router.refresh()
    })
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} disabled={isPending} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 w-36 py-1.5">
            <button onClick={handleDelete} className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          </div>
        </>
      )}
    </div>
  )
}
