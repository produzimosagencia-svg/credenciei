'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Pencil } from 'lucide-react'
import { criarFornecedor, editarFornecedor } from '@/lib/actions'

type Props =
  | { mode: 'criar'; eventoId: string }
  | { mode: 'editar'; eventoId: string; fornecedorId: string; nome: string; quantidade_estimada: number | null; valor_combinado: number | null }

export default function FornecedorModal(props: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const isEditar = props.mode === 'editar'
  const defaultNome = isEditar ? (props as any).nome : ''
  const defaultQtd = isEditar ? (props as any).quantidade_estimada ?? '' : ''
  const defaultValor = isEditar ? (props as any).valor_combinado ?? '' : ''

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

  return (
    <>
      {isEditar ? (
        <button onClick={() => setOpen(true)} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors" title="Editar fornecedor">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm bg-brand-500 hover:bg-brand-600 text-white px-3 py-2 rounded-xl transition-all font-semibold shadow-sm shadow-brand-200">
          <Plus className="w-3.5 h-3.5" />
          Novo Fornecedor
        </button>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-800 font-bold text-base">{isEditar ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
              <button onClick={() => setOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form action={handleAction} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Nome da empresa / Setor *</label>
                <input name="nome" required defaultValue={defaultNome} placeholder="Ex: Segurança, Limpeza, Bar..." className="input" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Quantidade de funcionários</label>
                <input name="quantidade_estimada" type="number" min="1" defaultValue={defaultQtd} placeholder="Ex: 20" className="input" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Valor combinado por funcionário</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input name="valor_combinado" type="number" min="0" step="0.01" defaultValue={defaultValor} placeholder="0,00" className="input pl-9" />
                </div>
              </div>
              <button type="submit" disabled={isPending} className="w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-brand-200">
                {isPending ? 'Salvando...' : (isEditar ? 'Salvar alterações' : 'Cadastrar fornecedor')}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
