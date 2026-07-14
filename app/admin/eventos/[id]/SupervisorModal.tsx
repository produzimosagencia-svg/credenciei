'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Pencil, X, Trash2 } from 'lucide-react'
import { criarSupervisor, editarSupervisor, deletarUsuario } from '@/lib/actions'
import { NomeInput, TelefoneInput } from '@/components/inputs'

type Props =
  | { mode: 'criar'; eventoId: string; fornecedorId: string; setorNome: string }
  | { mode: 'editar'; eventoId: string; supervisor: { id: string; nome: string; email: string; telefone: string | null; ativo: boolean } }

export default function SupervisorModal(props: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  const isEditar = props.mode === 'editar'

  const handleSubmit = (formData: FormData) => {
    setErro(null)
    startTransition(async () => {
      try {
        if (isEditar) {
          await editarSupervisor(props.supervisor.id, formData)
        } else {
          await criarSupervisor(props.fornecedorId, props.eventoId, formData)
        }
        setOpen(false)
        router.refresh()
      } catch (e: any) {
        setErro(e?.message ?? 'Erro ao salvar supervisor')
      }
    })
  }

  const handleDelete = () => {
    if (!isEditar) return
    if (!confirm(`Excluir o supervisor "${props.supervisor.nome}"?`)) return
    startTransition(async () => {
      try {
        await deletarUsuario(props.supervisor.id)
        setOpen(false)
        router.refresh()
      } catch (e: any) {
        setErro(e?.message ?? 'Erro ao excluir supervisor')
      }
    })
  }

  return (
    <>
      {isEditar ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-1.5 text-left px-2 py-1 rounded-lg text-slate-600 hover:text-brand-600 hover:bg-slate-50 transition-colors"
        >
          <span className="truncate flex-1">{props.supervisor.nome}</span>
          {!props.supervisor.ativo && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-semibold shrink-0">Inativo</span>
          )}
          <Pencil className="w-3 h-3 text-slate-300 shrink-0" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors font-medium"
        >
          <UserPlus className="w-3 h-3" />
          Criar Supervisor
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !isPending && setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-slate-800 font-bold">{isEditar ? 'Editar supervisor' : 'Novo supervisor'}</h2>
                {!isEditar && <p className="text-slate-400 text-xs mt-0.5">Setor: {props.setorNome}</p>}
              </div>
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form action={handleSubmit} className="p-6 space-y-4">
              <Field label="Nome completo *">
                <NomeInput name="nome" required defaultValue={isEditar ? props.supervisor.nome : ''} placeholder="Nome do supervisor" className="input" />
              </Field>
              <Field label="E-mail *">
                <input name="email" type="email" required defaultValue={isEditar ? props.supervisor.email : ''} placeholder="email@exemplo.com" className="input" />
              </Field>
              <Field label="Telefone">
                <TelefoneInput name="telefone" defaultValue={isEditar ? (props.supervisor.telefone ?? '') : ''} placeholder="(11) 99999-9999" className="input" />
              </Field>
              <Field label={isEditar ? 'Nova senha (opcional)' : 'Senha de acesso *'}>
                <input
                  name="senha"
                  type="password"
                  required={!isEditar}
                  minLength={6}
                  placeholder={isEditar ? 'Deixe em branco para manter' : 'Mín. 6 caracteres'}
                  className="input"
                />
              </Field>
              <Field label="Status">
                <select name="ativo" defaultValue={isEditar ? String(props.supervisor.ativo) : 'true'} className="input">
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </Field>

              {erro && <p className="text-red-500 text-xs">{erro}</p>}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-all text-sm shadow-md shadow-brand-200"
                >
                  {isPending ? 'Salvando...' : isEditar ? 'Salvar alterações' : 'Criar supervisor'}
                </button>
                {isEditar && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isPending}
                    className="p-3 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50"
                    title="Excluir supervisor"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  )
}
