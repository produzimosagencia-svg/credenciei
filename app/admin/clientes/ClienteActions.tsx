'use client'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Trash2 } from 'lucide-react'
import { deletarCliente } from '@/lib/actions'

export default function ClienteActions({ clienteId, clienteNome }: { clienteId: string; clienteNome: string }) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleDelete = () => {
    if (!confirm(`Excluir cliente "${clienteNome}"? Todos os eventos e dados serão removidos.`)) return
    setOpen(false)
    startTransition(async () => {
      await deletarCliente(clienteId)
      router.refresh()
    })
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} disabled={isPending} className="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-[#21262d] transition-colors">
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-8 bg-[#161b22] border border-[#30363d] rounded-xl shadow-2xl z-20 w-36 py-1">
            <button onClick={handleDelete} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 transition-colors">
              <Trash2 className="w-3.5 h-3.5" /> Excluir
            </button>
          </div>
        </>
      )}
    </div>
  )
}
