'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, UserPlus, Pencil, X, Trash2, Copy, CheckCheck } from 'lucide-react'
import { criarOperadorPortaria, editarSupervisor, deletarUsuario } from '@/lib/actions'
import { NomeInput, CpfInput, TelefoneInput } from '@/components/inputs'
import { exibirIdentificador } from '@/lib/usuario'
import { mensagemAmigavel } from '@/lib/erros'
import ConfirmModal from '@/components/ConfirmModal'

type Operador = { id: string; nome: string; email: string; cpf: string | null; telefone: string | null; ativo: boolean }

/**
 * Operadores de portão — quem lê o QR e registra ponto manual sem precisar
 * de senha de admin. Reaproveita o login por CPF do supervisor
 * (`editarSupervisor`/`deletarUsuario` já são genéricos, não específicos de
 * um papel), só a criação é própria: `criarOperadorPortaria`.
 *
 * São da ORGANIZAÇÃO, não deste evento sozinho — ver o comentário na
 * consulta, em page.tsx.
 */
export default function OperadorPortariaCard({
  eventoId, operadores, podeExcluir = false,
}: {
  eventoId: string
  operadores: Operador[]
  /** Só o master exclui de verdade — ver `deletarUsuario` em lib/actions.ts. */
  podeExcluir?: boolean
}) {
  const [modalAberto, setModalAberto] = useState<'criar' | Operador | null>(null)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="flex items-center gap-1.5 text-slate-500 text-2xs font-semibold uppercase tracking-wide">
          <ShieldCheck className="w-3.5 h-3.5" /> Operadores de portão
        </p>
        <button onClick={() => setModalAberto('criar')} className="btn btn-secundario btn-sm">
          <UserPlus className="w-3 h-3" /> Criar operador
        </button>
      </div>

      <p className="text-slate-400 text-xs mb-2">
        Lê o QR e registra ponto manual no portão — sem acesso a editar evento, equipe ou usuários.
      </p>

      {!operadores.length ? (
        <p className="text-slate-400 text-xs">Nenhum operador cadastrado nesta organização.</p>
      ) : (
        <div className="-mx-1">
          {operadores.map(o => (
            <button
              key={o.id}
              onClick={() => setModalAberto(o)}
              className="w-full flex items-center gap-1.5 text-left text-sm px-2 py-1.5 rounded-lg text-slate-700 hover:text-brand-500 hover:bg-slate-50 transition-colors"
            >
              <span className="truncate flex-1">{o.nome}</span>
              {!o.ativo && <span className="text-2xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-semibold shrink-0">Inativo</span>}
              <Pencil className="w-3 h-3 text-slate-300 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {modalAberto && (
        <ModalOperador
          eventoId={eventoId}
          operador={modalAberto === 'criar' ? null : modalAberto}
          onFechar={() => setModalAberto(null)}
          podeExcluir={podeExcluir}
        />
      )}
    </div>
  )
}

function ModalOperador({
  eventoId, operador, onFechar, podeExcluir,
}: {
  eventoId: string
  operador: Operador | null
  onFechar: () => void
  podeExcluir: boolean
}) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [linkSenha, setLinkSenha] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const router = useRouter()
  const editando = !!operador

  const handleSubmit = (formData: FormData) => {
    setErro(null)
    startTransition(async () => {
      try {
        if (editando) {
          await editarSupervisor(operador!.id, formData)
          router.refresh()
          onFechar()
        } else {
          const r = await criarOperadorPortaria(eventoId, formData)
          setLinkSenha(r.linkSenha)
          router.refresh()
        }
      } catch (e: any) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  const copiarLink = async () => {
    if (!linkSenha) return
    try {
      await navigator.clipboard.writeText(linkSenha)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 4000)
    } catch {}
  }

  const confirmarExclusao = () => {
    setConfirmOpen(false)
    startTransition(async () => {
      try {
        await deletarUsuario(operador!.id)
        router.refresh()
        onFechar()
      } catch (e: any) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !isPending && onFechar()}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-slate-800 font-bold">{editando ? 'Editar operador' : 'Novo operador de portão'}</h2>
          <button onClick={onFechar} disabled={isPending} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {linkSenha ? (
          <div className="p-6 space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
              <ShieldCheck className="w-8 h-8 text-green-600 mx-auto" />
              <p className="text-green-800 font-bold mt-2">Operador criado!</p>
              <p className="text-green-700 text-sm mt-1">
                Copie o link abaixo e mande você mesmo por WhatsApp — ele é de uso único, vale 24h e leva
                direto pra tela de criar a senha (o login depois é pelo CPF).
              </p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
              <p className="text-slate-600 text-xs break-all font-mono">{linkSenha}</p>
            </div>
            <button onClick={copiarLink} className="btn btn-primario w-full">
              {copiado ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiado ? 'Link copiado!' : 'Copiar link'}
            </button>
            <button onClick={onFechar} className="btn btn-secundario w-full">Fechar</button>
          </div>
        ) : (
          <form action={handleSubmit} className="p-6 space-y-4">
            <Field label="Nome completo *">
              <NomeInput name="nome" required defaultValue={editando ? operador!.nome : ''} placeholder="Nome do operador" className="input" />
            </Field>
            <Field label="CPF *">
              <CpfInput
                name="cpf" required
                defaultValue={editando ? (operador!.cpf ?? exibirIdentificador(operador!.email)) : ''}
                placeholder="000.000.000-00" className="input"
              />
              <p className="text-slate-500 text-xs mt-1.5">
                É o login dela no sistema. {!editando && 'Depois de criar, você recebe um link de uso único pra repassar por WhatsApp.'}
              </p>
            </Field>
            <Field label="WhatsApp *">
              <TelefoneInput name="telefone" required defaultValue={editando ? (operador!.telefone ?? '') : ''} placeholder="(11) 99999-9999" className="input" />
            </Field>
            {editando && (
              <Field label="Nova senha (opcional)">
                <input name="senha" type="password" minLength={6} placeholder="Deixe em branco para manter" className="input" />
              </Field>
            )}
            <Field label="Status">
              <select name="ativo" defaultValue={editando ? String(operador!.ativo) : 'true'} className="input">
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
              </select>
            </Field>

            {erro && <p className="text-red-500 text-xs">{erro}</p>}

            <div className="flex items-center gap-2">
              <button type="submit" disabled={isPending} className="btn btn-primario btn-lg flex-1">
                {isPending ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar operador'}
              </button>
              {editando && podeExcluir && (
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  disabled={isPending}
                  className="btn-press w-12 h-12 flex items-center justify-center shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl disabled:opacity-50"
                  title="Excluir operador"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </form>
        )}
      </div>

      {editando && (
        <ConfirmModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={confirmarExclusao}
          isPending={isPending}
          zIndexClassName="z-[60]"
          mensagem={`Excluir o operador "${operador!.nome}"?`}
        />
      )}
    </div>
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
