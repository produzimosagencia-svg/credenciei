'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Megaphone, Search, Check, Plus } from 'lucide-react'
import { criarAviso, editarAviso } from '@/lib/actions'
import { mensagemAmigavel } from '@/lib/erros'
import { chaveBusca, formatCpf } from '@/lib/format'
import DateTimePicker from '@/components/DateTimePicker'
import type { LinhaAviso } from './TabelaAvisos'

type FuncionarioDoEvento = { id: string; nome: string; cpf: string }
type Fornecedor = { id: string; nome: string }

type Props =
  | { mode: 'criar'; eventoId: string; fornecedores: Fornecedor[]; funcionarios: FuncionarioDoEvento[]; renderTrigger?: (abrir: () => void) => React.ReactNode }
  | { mode: 'editar'; eventoId: string; fornecedores: Fornecedor[]; funcionarios: FuncionarioDoEvento[]; aviso: LinhaAviso; renderTrigger?: (abrir: () => void) => React.ReactNode }

const PUBLICOS = [
  { valor: 'todos', label: 'Todos' },
  { valor: 'setores', label: 'Setores' },
  { valor: 'pessoa', label: 'Pessoa específica' },
  { valor: 'supervisores', label: 'Supervisores' },
] as const

/**
 * Criar/editar aviso — mesma anatomia de `SupervisorModal.tsx` (union
 * discriminada por `mode`, `useTransition`, `mensagemAmigavel` no catch).
 *
 * `renderTrigger` existe pro caso "editar" chamado de dentro do menu de
 * ações da linha (`AcoesAviso.tsx`) — o clique que abre este modal também
 * precisa fechar aquele menu, então quem abre é o pai, não este componente.
 * Sem `renderTrigger`, usa o próprio botão padrão (o caso "criar").
 */
export default function AvisoFormModal(props: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  const isEditar = props.mode === 'editar'
  const aviso = isEditar ? props.aviso : null

  const [publico, setPublico] = useState<typeof PUBLICOS[number]['valor']>(aviso?.publico ?? 'todos')
  const [setoresEscolhidos, setSetoresEscolhidos] = useState<Set<string>>(new Set(aviso?.fornecedorIds ?? []))
  const [buscaPessoa, setBuscaPessoa] = useState('')
  const [pessoaEscolhida, setPessoaEscolhida] = useState<FuncionarioDoEvento | null>(() => {
    if (!aviso?.cpfPessoa) return null
    return props.funcionarios.find(f => f.cpf === aviso.cpfPessoa) ?? { id: '', nome: 'Pessoa fora da lista atual', cpf: aviso.cpfPessoa }
  })

  const abrir = () => {
    setErro(null)
    setPublico(aviso?.publico ?? 'todos')
    setSetoresEscolhidos(new Set(aviso?.fornecedorIds ?? []))
    setBuscaPessoa('')
    setOpen(true)
  }

  const digitosBusca = buscaPessoa.replace(/\D/g, '')
  const pessoasFiltradas = useMemo(() => {
    const t = chaveBusca(buscaPessoa)
    if (!t) return props.funcionarios.slice(0, 20)
    return props.funcionarios
      .filter(f => chaveBusca(f.nome).includes(t) || (digitosBusca.length >= 3 && f.cpf.includes(digitosBusca)))
      .slice(0, 20)
  }, [props.funcionarios, buscaPessoa, digitosBusca])

  const toggleSetor = (id: string) => {
    setSetoresEscolhidos(atual => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })
  }

  const handleSubmit = (formData: FormData) => {
    setErro(null)
    if (publico === 'pessoa' && pessoaEscolhida) formData.set('cpf_pessoa', pessoaEscolhida.cpf)
    startTransition(async () => {
      try {
        if (isEditar) await editarAviso(props.aviso.id, props.eventoId, formData)
        else await criarAviso(props.eventoId, formData)
        setOpen(false)
        router.refresh()
      } catch (e: any) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <>
      {props.renderTrigger
        ? props.renderTrigger(abrir)
        : (
          <button onClick={abrir} className="btn btn-primario">
            <Plus className="w-3.5 h-3.5 shrink-0" /> Novo aviso
          </button>
        )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !isPending && setOpen(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div
            className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="text-slate-800 font-bold flex items-center gap-2">
                <Megaphone className="w-4 h-4 text-brand-500" /> {isEditar ? 'Editar aviso' : 'Novo aviso'}
              </h2>
              <button onClick={() => setOpen(false)} disabled={isPending} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form action={handleSubmit} className="p-6 space-y-4">
              <Field label="Título *">
                <input name="titulo" required defaultValue={aviso?.titulo ?? ''} placeholder="Ex.: Mudança na entrada de sábado" className="input" />
              </Field>
              <Field label="Mensagem *">
                <textarea name="mensagem" required rows={3} defaultValue={aviso?.mensagem ?? ''} placeholder="O que a equipe precisa saber" className="input resize-none" />
              </Field>

              <Field label="Quem recebe *">
                <div className="grid grid-cols-2 gap-2">
                  {PUBLICOS.map(p => (
                    <label
                      key={p.valor}
                      className={`flex items-center justify-center gap-1.5 cursor-pointer rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                        publico === p.valor ? 'border-brand-300 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <input
                        type="radio" name="publico" value={p.valor} checked={publico === p.valor}
                        onChange={() => setPublico(p.valor)} className="hidden"
                      />
                      {publico === p.valor && <Check className="w-3.5 h-3.5 shrink-0" />}
                      {p.label}
                    </label>
                  ))}
                </div>
              </Field>

              {publico === 'setores' && (
                <Field label="Setores *">
                  {!props.fornecedores.length ? (
                    <p className="text-slate-400 text-xs">Este evento ainda não tem setores cadastrados.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto -mx-1 px-1">
                      {props.fornecedores.map(f => {
                        const marcado = setoresEscolhidos.has(f.id)
                        return (
                          <label key={f.id} className={`flex items-center gap-2 cursor-pointer rounded-lg border px-2.5 py-1.5 text-sm transition-colors ${marcado ? 'border-brand-300 bg-brand-50' : 'border-slate-200'}`}>
                            <input type="checkbox" name="fornecedor_id" value={f.id} checked={marcado} onChange={() => toggleSetor(f.id)} className="h-3.5 w-3.5 accent-brand-500 shrink-0" />
                            <span className="truncate">{f.nome}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                </Field>
              )}

              {publico === 'pessoa' && (
                <Field label="Pessoa *">
                  {pessoaEscolhida ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-800 truncate">{pessoaEscolhida.nome}</span>
                        <span className="block text-slate-400 text-xs font-mono tabular-nums">{formatCpf(pessoaEscolhida.cpf)}</span>
                      </span>
                      <button type="button" onClick={() => setPessoaEscolhida(null)} className="text-brand-600 text-xs font-semibold hover:underline shrink-0">Trocar</button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input value={buscaPessoa} onChange={e => setBuscaPessoa(e.target.value)} placeholder="Buscar por nome ou CPF…" className="input pl-9 text-sm" />
                      </div>
                      <div className="max-h-40 overflow-y-auto -mx-1 space-y-0.5">
                        {pessoasFiltradas.length === 0 ? (
                          <p className="text-slate-400 text-xs px-1 py-2">Ninguém encontrado.</p>
                        ) : pessoasFiltradas.map(f => (
                          <button key={f.id} type="button" onClick={() => setPessoaEscolhida(f)} className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                            <span className="min-w-0">
                              <span className="block text-slate-800 text-sm truncate">{f.nome}</span>
                              <span className="block text-slate-400 text-xs font-mono tabular-nums">{formatCpf(f.cpf)}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </Field>
              )}

              <div className="grid grid-cols-2 gap-3">
                <Field label="Início">
                  <DateTimePicker modo="data" name="data_inicio" defaultValue={aviso?.dataInicio} />
                </Field>
                <Field label="Término (opcional)">
                  <DateTimePicker modo="data" name="data_fim" defaultValue={aviso?.dataFim ?? undefined} />
                </Field>
              </div>

              <div className="flex items-center gap-5">
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" name="ativo" defaultChecked={aviso?.ativo ?? true} className="h-4 w-4 accent-brand-500" /> Ativo
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input type="checkbox" name="recorrente" defaultChecked={aviso?.recorrente ?? false} className="h-4 w-4 accent-brand-500" /> Mostrar sempre (não só uma vez)
                </label>
              </div>

              {erro && <p className="text-red-500 text-xs">{erro}</p>}

              <button type="submit" disabled={isPending || (publico === 'pessoa' && !pessoaEscolhida)} className="btn btn-primario btn-lg w-full disabled:opacity-50">
                {isPending ? 'Salvando…' : isEditar ? 'Salvar alterações' : 'Criar aviso'}
              </button>
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
