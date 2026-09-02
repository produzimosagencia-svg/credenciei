'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X, Pencil, Trash2 } from 'lucide-react'
import { criarSuporte, editarSuporte, revogarSuporte } from '@/lib/actions'
import { NomeInput, CpfInput, TelefoneInput } from '@/components/inputs'
import { mensagemAmigavel } from '@/lib/erros'
import ConfirmModal from '@/components/ConfirmModal'

type Organizacao = { id: string; nome: string }
type Evento = { id: string; nome: string; organizacaoNome: string }

type Props =
  | { mode: 'criar'; organizacoes: Organizacao[]; eventos: Evento[] }
  | {
      mode: 'editar'
      organizacoes: Organizacao[]
      eventos: Evento[]
      suporte: {
        id: string; nome: string; telefone: string | null; ativo: boolean
        acessoExpiraEm: string | null
        escopoOrganizacoes: string[]; escopoEventos: string[]
      }
    }

/**
 * Criar/editar um acesso de suporte — mesma anatomia de `SupervisorModal.tsx`
 * (union por `mode`, `useTransition`, `mensagemAmigavel` no catch), com o que
 * é próprio do suporte: escopo (organizações e/ou eventos, checkboxes — mesmo
 * padrão de `AvisoFormModal` pros setores) e a data de expiração.
 */
export default function SuporteModal(props: Props) {
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()
  const isEditar = props.mode === 'editar'

  const [orgsEscolhidas, setOrgsEscolhidas] = useState<Set<string>>(
    () => new Set(isEditar ? props.suporte.escopoOrganizacoes : []),
  )
  const [eventosEscolhidos, setEventosEscolhidos] = useState<Set<string>>(
    () => new Set(isEditar ? props.suporte.escopoEventos : []),
  )

  const abrir = () => { setErro(null); setOpen(true) }

  const alternar = (set: Set<string>, id: string) => {
    const proximo = new Set(set)
    if (proximo.has(id)) proximo.delete(id)
    else proximo.add(id)
    return proximo
  }

  const handleSubmit = (formData: FormData) => {
    setErro(null)
    for (const id of orgsEscolhidas) formData.append('escopo_organizacao_id', id)
    for (const id of eventosEscolhidos) formData.append('escopo_evento_id', id)
    startTransition(async () => {
      try {
        if (isEditar) await editarSuporte(props.suporte.id, formData)
        else await criarSuporte(formData)
        setOpen(false)
        router.refresh()
      } catch (e: any) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  const confirmarRevogacao = () => {
    if (!isEditar) return
    setConfirmOpen(false)
    startTransition(async () => {
      try {
        await revogarSuporte(props.suporte.id)
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
        <button onClick={abrir} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-500 hover:bg-slate-100">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button onClick={abrir} className="btn btn-primario">
          <UserPlus className="w-3.5 h-3.5" /> Novo suporte
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !isPending && setOpen(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-slate-800 font-bold">{isEditar ? 'Editar suporte' : 'Novo acesso de suporte'}</h2>
              <button onClick={() => setOpen(false)} disabled={isPending} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form action={handleSubmit} className="p-6 space-y-4">
              <Field label="Nome completo *">
                <NomeInput name="nome" required defaultValue={isEditar ? props.suporte.nome : ''} placeholder="Nome da pessoa" className="input" />
              </Field>
              {!isEditar && (
                <Field label="CPF *">
                  <CpfInput name="cpf" required placeholder="000.000.000-00" className="input" />
                  <p className="text-slate-500 text-xs mt-1.5">É o login dela — entra com CPF e senha, mesmo padrão de supervisor.</p>
                </Field>
              )}
              <Field label="WhatsApp *">
                <TelefoneInput name="telefone" required defaultValue={isEditar ? (props.suporte.telefone ?? '') : ''} placeholder="(11) 99999-9999" className="input" />
              </Field>

              <Field label="Atende quais organizações e/ou eventos? *">
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {props.organizacoes.map(o => {
                    const marcado = orgsEscolhidas.has(o.id)
                    return (
                      <label key={o.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${marcado ? 'bg-brand-50' : ''}`}>
                        <input type="checkbox" checked={marcado} onChange={() => setOrgsEscolhidas(a => alternar(a, o.id))} className="h-3.5 w-3.5 accent-brand-500 shrink-0" />
                        <span className="truncate">{o.nome} <span className="text-slate-400 text-2xs">(organização inteira)</span></span>
                      </label>
                    )
                  })}
                  {props.eventos.map(e => {
                    const marcado = eventosEscolhidos.has(e.id)
                    return (
                      <label key={e.id} className={`flex items-center gap-2 px-3 py-2 cursor-pointer text-sm ${marcado ? 'bg-brand-50' : ''}`}>
                        <input type="checkbox" checked={marcado} onChange={() => setEventosEscolhidos(a => alternar(a, e.id))} className="h-3.5 w-3.5 accent-brand-500 shrink-0" />
                        <span className="truncate">{e.nome} <span className="text-slate-400 text-2xs">· {e.organizacaoNome}</span></span>
                      </label>
                    )
                  })}
                </div>
                <p className="text-slate-500 text-xs mt-1.5">
                  Organização inteira dá acesso a todos os eventos dela, atuais e futuros. Evento avulso limita a só aquele.
                </p>
              </Field>

              <Field label="Acesso válido até (opcional)">
                <input
                  type="date" name="acesso_expira_em"
                  defaultValue={isEditar && props.suporte.acessoExpiraEm ? props.suporte.acessoExpiraEm.slice(0, 10) : ''}
                  className="input"
                />
                <p className="text-slate-500 text-xs mt-1.5">Passada essa data, o acesso para de funcionar sozinho. Em branco, não expira.</p>
              </Field>

              <Field label="Status">
                <select name="ativo" defaultValue={isEditar ? String(props.suporte.ativo) : 'true'} className="input">
                  <option value="true">Ativo</option>
                  <option value="false">Inativo</option>
                </select>
              </Field>

              {erro && <p className="text-red-500 text-xs">{erro}</p>}

              <div className="flex items-center gap-2">
                <button type="submit" disabled={isPending} className="btn btn-primario btn-lg flex-1">
                  {isPending ? 'Salvando...' : isEditar ? 'Salvar alterações' : 'Criar acesso'}
                </button>
                {isEditar && (
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    disabled={isPending}
                    className="btn-press w-12 h-12 flex items-center justify-center shrink-0 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-xl disabled:opacity-50"
                    title="Revogar acesso agora"
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
          onConfirm={confirmarRevogacao}
          isPending={isPending}
          titulo="Revogar acesso"
          zIndexClassName="z-[60]"
          mensagem={`Revogar o acesso de "${props.suporte.nome}" agora? O login para de funcionar imediatamente — diferente de excluir, o histórico do que ela fez continua na Auditoria.`}
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
