'use client'
import { useState, useTransition } from 'react'
import { MoreHorizontal, Power, Trash2, Save, X } from 'lucide-react'
import { toggleAtivoOrganizacao, deletarOrganizacao, editarOrganizacao } from '@/lib/actions'

type Org = {
  id: string
  nome: string
  documento: string | null
  responsavel_nome: string | null
  limite_eventos: number
  ativo: boolean
}

export default function OrganizacaoActions({ org }: { org: Org }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [isPending, startTransition] = useTransition()

  const handleToggle = () => {
    setOpen(false)
    startTransition(() => toggleAtivoOrganizacao(org.id, org.ativo))
  }

  const handleDelete = () => {
    if (!confirm(`Excluir "${org.nome}"? Isso remove o admin, a equipe e TODOS os eventos da organização. Não dá pra desfazer.`)) return
    setOpen(false)
    startTransition(() => deletarOrganizacao(org.id))
  }

  const handleSave = (formData: FormData) => {
    startTransition(async () => {
      await editarOrganizacao(org.id, formData)
      setEditing(false)
    })
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={isPending}
        className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && !editing && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 w-52 py-1.5 overflow-hidden">
            <button
              onClick={() => { setEditing(true); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Save className="w-3.5 h-3.5" /> Editar / limite de eventos
            </button>
            <button
              onClick={handleToggle}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Power className="w-3.5 h-3.5" />
              {org.ativo ? 'Suspender acesso' : 'Reativar acesso'}
            </button>
            <div className="border-t border-slate-100 my-1" />
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Excluir organização
            </button>
          </div>
        </>
      )}

      {editing && (
        <>
          <div className="fixed inset-0 z-10 bg-black/20" onClick={() => setEditing(false)} />
          <div className="absolute right-0 top-9 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 w-72 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-700">Editar organização</p>
              <button onClick={() => setEditing(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form action={handleSave} className="space-y-2.5">
              <input name="org_nome" required defaultValue={org.nome} placeholder="Nome" className="input" />
              <input name="documento" defaultValue={org.documento ?? ''} placeholder="CPF ou CNPJ" className="input" />
              <input name="responsavel_nome" defaultValue={org.responsavel_nome ?? ''} placeholder="Responsável" className="input" />
              <label className="block text-xs font-medium text-slate-500">Limite de eventos</label>
              <input name="limite_eventos" type="number" min={1} required defaultValue={org.limite_eventos} className="input" />
              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-brand-500 hover:bg-brand-600 text-white py-2 rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
              >
                Salvar
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  )
}
