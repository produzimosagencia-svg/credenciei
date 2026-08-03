'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Power, Trash2, Pencil, X, Camera } from 'lucide-react'
import { toggleAtivoOrganizacao, deletarOrganizacao, editarOrganizacao } from '@/lib/actions'
import { NomeInput, CpfCnpjInput } from '@/components/inputs'
import ConfirmModal from '@/components/ConfirmModal'
import { FormLoadingOverlay } from '@/components/LoadingOverlay'
import OrganizacaoAvatar from './OrganizacaoAvatar'

type Org = {
  id: string
  nome: string
  documento: string | null
  responsavel_nome: string | null
  limite_eventos: number
  valor_cobrado: number | null
  ativo: boolean
  fotoUrl: string | null
}

export default function OrganizacaoActions({ org }: { org: Org }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const handleToggle = () => {
    setOpen(false)
    startTransition(() => toggleAtivoOrganizacao(org.id, org.ativo))
  }

  const handleDelete = () => {
    setOpen(false)
    setConfirmOpen(true)
  }

  const confirmarExclusao = () => {
    setConfirmOpen(false)
    startTransition(() => deletarOrganizacao(org.id))
  }

  const handleSave = (formData: FormData) => {
    startTransition(async () => {
      await editarOrganizacao(org.id, formData)
      setEditing(false)
      router.refresh()
    })
  }

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        disabled={isPending}
        className="btn-press w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-50"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 w-52 py-1.5 overflow-hidden">
            <button
              onClick={() => { setEditing(true); setOpen(false) }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar organização
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

      {editing && <ModalEditar org={org} isPending={isPending} onSave={handleSave} onClose={() => setEditing(false)} />}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmarExclusao}
        isPending={isPending}
        zIndexClassName="z-[60]"
        mensagem={`Excluir "${org.nome}"? Isso remove o admin, a equipe e TODOS os eventos da organização. Não dá pra desfazer.`}
      />
    </div>
  )
}

function ModalEditar({
  org,
  isPending,
  onSave,
  onClose,
}: {
  org: Org
  isPending: boolean
  onSave: (formData: FormData) => void
  onClose: () => void
}) {
  const [preview, setPreview] = useState<string | null>(null)
  const [removerFoto, setRemoverFoto] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fotoExibida = removerFoto ? null : preview ?? org.fotoUrl

  const onEscolherFoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPreview(URL.createObjectURL(file))
    setRemoverFoto(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !isPending && onClose()}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div
        className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-slate-800 font-bold">Editar organização</h2>
          <button
            onClick={onClose}
            disabled={isPending}
            className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form action={onSave} className="p-6 space-y-4">
          <input type="hidden" name="remover_foto" value={removerFoto ? 'true' : 'false'} />

          <div className="flex items-center gap-4">
            <div className="relative shrink-0">
              <OrganizacaoAvatar url={fotoExibida} nome={org.nome} size={64} />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="btn-press absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-brand-500 hover:bg-brand-600 text-white flex items-center justify-center border-2 border-white"
                title="Trocar foto"
              >
                <Camera className="w-3 h-3" />
              </button>
              <input ref={fileRef} type="file" name="foto" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={onEscolherFoto} />
            </div>
            <div className="space-y-1">
              <p className="text-slate-500 text-xs">Foto de perfil</p>
              {fotoExibida ? (
                <button
                  type="button"
                  onClick={() => { setRemoverFoto(true); setPreview(null); if (fileRef.current) fileRef.current.value = '' }}
                  className="text-red-500 hover:underline text-xs font-medium"
                >
                  Remover foto
                </button>
              ) : (
                <p className="text-slate-300 text-xs">Mostrando iniciais</p>
              )}
            </div>
          </div>

          <Field label="Nome da organização *">
            <NomeInput name="org_nome" required defaultValue={org.nome} placeholder="Nome" className="input" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CPF ou CNPJ">
              <CpfCnpjInput name="documento" defaultValue={org.documento ?? ''} placeholder="CPF ou CNPJ" className="input" />
            </Field>
            <Field label="Limite de eventos">
              <input name="limite_eventos" type="number" min={1} required defaultValue={org.limite_eventos} className="input" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Responsável">
              <NomeInput name="responsavel_nome" defaultValue={org.responsavel_nome ?? ''} placeholder="Responsável" className="input" />
            </Field>
            <Field label="Valor cobrado (mensal)">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                <input name="valor_cobrado" type="number" min="0" step="0.01" defaultValue={org.valor_cobrado ?? ''} placeholder="0,00" className="input pl-9" />
              </div>
            </Field>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="btn-press w-full bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:active:scale-100 text-white py-2.5 rounded-xl font-semibold text-sm shadow-md shadow-brand-200"
          >
            Salvar alterações
          </button>
          <FormLoadingOverlay mensagem="Salvando organização..." />
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-500">{label}</label>
      {children}
    </div>
  )
}
