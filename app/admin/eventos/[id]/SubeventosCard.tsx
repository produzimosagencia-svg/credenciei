'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Pencil, Trash2 } from 'lucide-react'
import { criarSubevento, editarSubevento, excluirSubevento } from '@/lib/actions'
import ConfirmModal from '@/components/ConfirmModal'

type Subevento = { id: string; nome: string }

/**
 * Subeventos do evento mãe (Vital, 30/09/2026) — portões/categorias de
 * acesso do MESMO evento (Camarote, Arquibancada, Geral…). Só aparece
 * quando a organização ligou "Subeventos" em Configurações (ver page.tsx).
 */
export default function SubeventosCard({ eventoId, subeventos }: { eventoId: string; subeventos: Subevento[] }) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 mb-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-slate-800 font-bold text-sm">Subeventos</p>
          <p className="text-slate-500 text-xs mt-0.5">Portões/categorias de acesso deste evento</p>
        </div>
        <SubeventoModal mode="criar" eventoId={eventoId} />
      </div>
      {subeventos.length === 0 ? (
        <p className="text-slate-400 text-xs">Nenhum subevento ainda — crie o primeiro acima.</p>
      ) : (
        <ul className="divide-y divide-slate-100 -mb-1">
          {subeventos.map(s => (
            <li key={s.id} className="flex items-center justify-between py-1.5">
              <span className="text-slate-700 text-sm">{s.nome}</span>
              <div className="flex items-center gap-0.5">
                <SubeventoModal mode="editar" eventoId={eventoId} subeventoId={s.id} nome={s.nome} />
                <ExcluirSubeventoButton eventoId={eventoId} subeventoId={s.id} nome={s.nome} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SubeventoModal(
  props: { mode: 'criar'; eventoId: string } | { mode: 'editar'; eventoId: string; subeventoId: string; nome: string },
) {
  const [open, setOpen] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const isEditar = props.mode === 'editar'

  const handleAction = (formData: FormData) => {
    setErro(null)
    startTransition(async () => {
      const r = isEditar
        ? await editarSubevento(props.subeventoId, props.eventoId, formData)
        : await criarSubevento(props.eventoId, formData)
      if (r?.error) { setErro(r.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      {isEditar ? (
        <button
          onClick={() => setOpen(true)}
          className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          title={`Editar ${props.nome}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="btn btn-secundario btn-sm shrink-0">
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Novo subevento</span>
          <span className="sm:hidden">Novo</span>
        </button>
      )}
      {open && (
        <div className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="modal-pop-in bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-800 font-bold text-base">{isEditar ? 'Editar subevento' : 'Novo subevento'}</h3>
              <button onClick={() => setOpen(false)} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form action={handleAction} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Nome *</label>
                <input name="nome" required defaultValue={isEditar ? props.nome : ''} placeholder="Ex: Camarote Navista" className="input" />
              </div>
              {erro && <p className="text-red-500 text-xs">{erro}</p>}
              <button type="submit" disabled={isPending} className="btn btn-primario w-full">
                {isPending ? 'Salvando...' : (isEditar ? 'Salvar alterações' : 'Criar subevento')}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function ExcluirSubeventoButton({ eventoId, subeventoId, nome }: { eventoId: string; subeventoId: string; nome: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const confirmar = () => {
    setErro(null)
    startTransition(async () => {
      const r = await excluirSubevento(subeventoId, eventoId)
      if (r?.error) { setConfirmOpen(false); setErro(r.error); return }
      setConfirmOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-erro-600 hover:bg-erro-50 disabled:opacity-50"
        title={`Excluir ${nome}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmar}
        isPending={isPending}
        mensagem={`Excluir o subevento "${nome}"?`}
      />
      {erro && <p className="text-red-500 text-2xs mt-1">{erro}</p>}
    </>
  )
}
