'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, Pencil, X, Trash2, ArrowLeft, Search, ChevronRight } from 'lucide-react'
import { criarSupervisor, editarSupervisor, deletarUsuario } from '@/lib/actions'
import { NomeInput, CpfInput, TelefoneInput } from '@/components/inputs'
import ConfirmModal from '@/components/ConfirmModal'
import { exibirIdentificador } from '@/lib/usuario'
import { mensagemAmigavel } from '@/lib/erros'

type FuncionarioDoEvento = { id: string; nome: string; cpf: string; telefone: string }

type Props =
  | { mode: 'criar'; eventoId: string; fornecedorId: string; setorNome: string; funcionariosDoEvento?: FuncionarioDoEvento[] }
  | { mode: 'editar'; eventoId: string; podeExcluir?: boolean; supervisor: { id: string; nome: string; email: string; cpf: string | null; telefone: string | null; ativo: boolean } }

/** A partir de quantos nomes a lista de escolha ganha busca. */
const MINIMO_PARA_BUSCAR = 6

const formatCpf = (cpf: string) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')

export default function SupervisorModal(props: Props) {
  const [open, setOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  const isEditar = props.mode === 'editar'
  const opcoes = !isEditar ? (props.funcionariosDoEvento ?? []) : []

  /*
   * Quem vai virar supervisor.
   *
   * `null` = ainda escolhendo (só existe passo de escolha quando o setor já
   * tem gente credenciada); `'manual'` = formulário em branco, para um
   * supervisor que não é — e pode nunca vir a ser — funcionário deste setor;
   * um objeto = veio da lista, nome e CPF chegam prontos.
   */
  const [escolhido, setEscolhido] = useState<FuncionarioDoEvento | 'manual' | null>(null)
  const [busca, setBusca] = useState('')
  const mostrandoLista = !isEditar && opcoes.length > 0 && escolhido === null

  const abrir = () => {
    setErro(null)
    setBusca('')
    setEscolhido(opcoes.length > 0 ? null : 'manual')
    setOpen(true)
  }

  /*
   * `''.includes('')` é sempre true — sem a guarda de `digitosBusca`, buscar
   * por nome (sem número nenhum) fazia TODO CPF "bater" e a lista nunca
   * filtrava de verdade. Só compara CPF quando a busca realmente tem dígito.
   */
  const digitosBusca = busca.replace(/\D/g, '')
  const filtrados = busca.trim()
    ? opcoes.filter(o => o.nome.toLowerCase().includes(busca.trim().toLowerCase()) || (digitosBusca && o.cpf.includes(digitosBusca)))
    : opcoes

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

  // Chave do formulário: muda quando a escolha muda, para os inputs
  // (não-controlados por fora) remontarem com o novo defaultValue.
  const chaveForm = isEditar ? props.supervisor.id : (typeof escolhido === 'string' ? escolhido : escolhido?.id ?? 'vazio')
  const nomeInicial = isEditar ? props.supervisor.nome : (escolhido && escolhido !== 'manual' ? escolhido.nome : '')
  const cpfInicial = isEditar
    ? (props.supervisor.cpf ?? exibirIdentificador(props.supervisor.email))
    : (escolhido && escolhido !== 'manual' ? escolhido.cpf : '')
  const telefoneInicial = isEditar
    ? (props.supervisor.telefone ?? '')
    : (escolhido && escolhido !== 'manual' ? escolhido.telefone : '')
  const veioDaLista = !isEditar && escolhido !== null && escolhido !== 'manual'

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
          onClick={abrir}
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
              <div className="min-w-0">
                <h2 className="text-slate-800 font-bold">
                  {isEditar ? 'Editar supervisor' : mostrandoLista ? 'Quem vai supervisionar?' : 'Novo supervisor'}
                </h2>
                {!isEditar && <p className="text-slate-400 text-xs mt-0.5 truncate">Setor: {props.setorNome}</p>}
              </div>
              <button
                onClick={() => setOpen(false)}
                disabled={isPending}
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {mostrandoLista ? (
              /*
               * Passo 1: escolher entre quem já está credenciado no setor.
               *
               * Antes, "Criar Supervisor" sempre abria um formulário em
               * branco — pedindo de novo nome, CPF e telefone de alguém que
               * já tinha se cadastrado como funcionário. Além do retrabalho,
               * digitar o CPF uma segunda vez é a chance perfeita de um
               * dígito trocado criar um cadastro fantasma.
               */
              <div className="p-6 space-y-3">
                {opcoes.length >= MINIMO_PARA_BUSCAR && (
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      value={busca}
                      onChange={e => setBusca(e.target.value)}
                      placeholder="Buscar por nome ou CPF…"
                      autoFocus
                      className="input pl-9 text-sm"
                    />
                  </div>
                )}

                <div className="-mx-1 max-h-72 overflow-y-auto space-y-0.5">
                  {filtrados.length === 0 ? (
                    <p className="text-slate-400 text-sm px-1 py-2">Ninguém encontrado com “{busca}”.</p>
                  ) : filtrados.map(fu => (
                    <button
                      key={fu.id}
                      onClick={() => setEscolhido(fu)}
                      className="w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      <span className="min-w-0">
                        <span className="block text-slate-800 text-sm font-medium truncate">{fu.nome}</span>
                        <span className="block text-slate-400 text-xs font-mono tabular-nums">{formatCpf(fu.cpf)}</span>
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => setEscolhido('manual')}
                  className="w-full text-brand-600 text-sm font-semibold hover:underline text-center pt-1"
                >
                  A pessoa não está nesta lista — cadastrar manualmente
                </button>
              </div>
            ) : (
              <form key={chaveForm} action={handleSubmit} className="p-6 space-y-4">
                {veioDaLista && (
                  <button
                    type="button"
                    onClick={() => setEscolhido(null)}
                    className="flex items-center gap-1 text-slate-400 hover:text-slate-600 text-xs font-medium -mt-1"
                  >
                    <ArrowLeft className="w-3 h-3" /> Escolher outra pessoa
                  </button>
                )}

                <Field label="Nome completo *">
                  <NomeInput name="nome" required defaultValue={nomeInicial} readOnly={veioDaLista} placeholder="Nome do supervisor" className={`input ${veioDaLista ? 'bg-slate-50 text-slate-500' : ''}`} />
                </Field>
                <Field label="CPF *">
                  <CpfInput
                    name="cpf"
                    required
                    defaultValue={cpfInicial}
                    readOnly={veioDaLista}
                    placeholder="000.000.000-00"
                    className={`input ${veioDaLista ? 'bg-slate-50 text-slate-500' : ''}`}
                  />
                  <p className="text-slate-500 text-xs mt-1.5">
                    {veioDaLista
                      ? 'Nome e CPF vêm do cadastro já feito como funcionário — o credenciamento dela continua o mesmo.'
                      : 'O CPF identifica o cadastro e será usado no login. Supervisor novo recebe no WhatsApp um link individual para criar a própria senha.'}
                  </p>
                </Field>
                <Field label="WhatsApp *">
                  <TelefoneInput name="telefone" required defaultValue={telefoneInicial} placeholder="(11) 99999-9999" className="input" />
                  {veioDaLista && <p className="text-slate-500 text-xs mt-1.5">Confira se ainda é este o número — é para ele que vai o aviso da escala.</p>}
                </Field>
                {isEditar && <Field label="Nova senha (opcional)">
                  <input
                    name="senha"
                    type="password"
                    minLength={6}
                    placeholder="Deixe em branco para manter"
                    className="input"
                  />
                </Field>}
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
            )}
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
