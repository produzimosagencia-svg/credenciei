'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Pencil } from 'lucide-react'
import { criarFornecedor, editarFornecedor } from '@/lib/actions'

type Props =
  | { mode: 'criar'; eventoId: string }
  | { mode: 'editar'; eventoId: string; fornecedorId: string; nome: string; email: string; quantidade_estimada: number | null }

export default function FornecedorModal(props: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const isEditar = props.mode === 'editar'
  const defaultNome = isEditar ? (props as any).nome : ''
  const defaultEmail = isEditar ? (props as any).email ?? '' : ''
  const defaultQtd = isEditar ? (props as any).quantidade_estimada ?? '' : ''

  const handleAction = (formData: FormData) => {
    startTransition(async () => {
      if (isEditar) {
        await editarFornecedor((props as any).fornecedorId, props.eventoId, formData)
      } else {
        await criarFornecedor(props.eventoId, formData)
      }
      setOpen(false)
      router.refresh()
    })
  }

  const inputClass = "w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-blue-500 placeholder:text-slate-600"

  return (
    <>
      {isEditar ? (
        <button onClick={() => setOpen(true)} className="p-1.5 text-slate-500 hover:text-slate-300 transition-colors" title="Editar fornecedor">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors">
          <Plus className="w-3.5 h-3.5" />
          Novo Fornecedor
        </button>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">{isEditar ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form action={handleAction} className="space-y-3">
              <div>
                <label className="text-sm text-slate-300 block mb-1.5">Nome da empresa *</label>
                <input name="nome" required defaultValue={defaultNome} placeholder="Ex: Segurança Total Ltda" className={inputClass} />
              </div>
              <div>
                <label className="text-sm text-slate-300 block mb-1.5">E-mail de contato</label>
                <input name="email_contato" type="email" defaultValue={defaultEmail} placeholder="contato@empresa.com" className={inputClass} />
              </div>
              <div>
                <label className="text-sm text-slate-300 block mb-1.5">Quantidade estimada de funcionários</label>
                <input
                  name="quantidade_estimada"
                  type="number"
                  min="1"
                  defaultValue={defaultQtd}
                  placeholder="Ex: 20"
                  className={inputClass}
                />
              </div>
              <button type="submit" disabled={isPending} className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">
                {isPending ? 'Salvando...' : (isEditar ? 'Salvar' : 'Cadastrar')}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
