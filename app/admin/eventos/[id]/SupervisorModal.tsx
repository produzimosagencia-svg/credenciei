'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Pencil, X, Trash2 } from 'lucide-react'
import { criarSupervisor, editarSupervisor, deletarUsuario } from '@/lib/actions'
import { NomeInput, TelefoneInput } from '@/components/inputs'
import ConfirmModal from '@/components/ConfirmModal'
import { exibirIdentificador } from '@/lib/usuario'
import { mensagemAmigavel } from '@/lib/erros'

type Props =
  | { mode: 'criar'; eventoId: string; fornecedorId: string; setorNome: string }
  | { mode: 'editar'; eventoId: string; podeExcluir?: boolean; supervisor: { id: string; nome: string; email: string; telefone: string | null; ativo: boolean } }

export default function SupervisorModal(props: Props) {
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
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
        setErro(mensagemAmigavel(e))
      }
    })
  }

  const handleDelete = () => {
    if (!isEditar) return
    setConfirmOpen(true)
  }

  const confirmarExclusao = () => {
    if (!isEditar) return
    setConfirmOpen(false)
    startTransition(async () => {
      try {
        await deletarUsuario(props.supervisor.id)
        setOpen(false)
        router.refresh()
      } catch (e: any) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <>
      {isEditar ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center gap-1.5 text-left text-sm px-2 py-1.5 rounded-lg text-slate-700 hover:text-brand-500 hover:bg-slate-50 transition-colors"
        >
          <span className="truncate flex-1">{props.supervisor.nome}</span>
          {!props.supervisor.ativo && (
            <span className="text-2xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-semibold shrink-0">Inativo</span>
          )}
          <Pencil className="w-3 h-3 text-slate-300 shrink-0" />
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="btn btn-secundario btn-sm"
        >
          <UserPlus className="w-3 h-3" />
          Criar Supervisor
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !isPending && setOpen(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div
            className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
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
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form action={handleSubmit} className="p-6 space-y-4">
              <Field label="Nome completo *">
                <NomeInput name="nome" required defaultValue={isEditar ? props.supervisor.nome : ''} placeholder="Nome do supervisor" className="input" />
              </Field>
              {/* Nome de usuário, não e-mail: quem trabalha no portão nem sempre
                  tem endereço à mão, e inventar um travava o cadastro quando o
                  endereço já existia na plataforma. */}
              <Field label="Nome de usuário *">
                <input
                  name="usuario"
                  required
                  minLength={3}
                  maxLength={32}
                  defaultValue={isEditar ? exibirIdentificador(props.supervisor.email) : ''}
                  placeholder="Ex: juan.bar"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="input"
                />
                <p className="text-slate-500 text-xs mt-1.5">
                  É com isto que o supervisor entra no sistema — sem e-mail. Letras, números e ponto.
                  Ele recebe o usuário e a senha pelo WhatsApp.
                </p>
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
                  className="btn btn-primario btn-lg flex-1"
                >
                  {isPending ? 'Salvando...' : isEditar ? 'Salvar alterações' : 'Criar supervisor'}
                </button>
                {/* Excluir supervisor apaga o acesso E o histórico dele. Desativar
                    bloqueia o login e preserva os registros — é o caminho do admin. */}
                {isEditar && props.podeExcluir && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isPending}
                    className="btn-press w-12 h-12 flex items-center justify-center shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl disabled:opacity-50 disabled:active:scale-100"
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
      {isEditar && (
        <ConfirmModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={confirmarExclusao}
          isPending={isPending}
          zIndexClassName="z-[60]"
          mensagem={`Excluir o supervisor "${props.supervisor.nome}"?`}
        />
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
