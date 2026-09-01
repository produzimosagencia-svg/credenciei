'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, UserPlus, Pencil, X, Trash2, Copy, CheckCheck, Search, ChevronRight, ArrowLeft } from 'lucide-react'
import { criarOperadorPortaria, editarSupervisor, deletarUsuario } from '@/lib/actions'
import { NomeInput, CpfInput, TelefoneInput } from '@/components/inputs'
import { exibirIdentificador } from '@/lib/usuario'
import { mensagemAmigavel } from '@/lib/erros'
import ConfirmModal from '@/components/ConfirmModal'

type Operador = { id: string; nome: string; email: string; cpf: string | null; telefone: string | null; ativo: boolean }
type FuncionarioDoEvento = { id: string; nome: string; cpf: string; telefone: string }

/** A partir de quantos nomes a lista de escolha ganha busca. */
const MINIMO_PARA_BUSCAR = 6

const formatCpf = (cpf: string) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')

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
  eventoId, operadores, funcionariosDoEvento = [], podeExcluir = false,
}: {
  eventoId: string
  operadores: Operador[]
  /** Quem já está credenciado neste evento — "Criar operador" busca aqui em vez de um formulário em branco. */
  funcionariosDoEvento?: FuncionarioDoEvento[]
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
          funcionariosDoEvento={funcionariosDoEvento}
          onFechar={() => setModalAberto(null)}
          podeExcluir={podeExcluir}
        />
      )}
    </div>
  )
}

function ModalOperador({
  eventoId, operador, funcionariosDoEvento, onFechar, podeExcluir,
}: {
  eventoId: string
  operador: Operador | null
  funcionariosDoEvento: FuncionarioDoEvento[]
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

  /*
   * Escolher entre quem já está credenciado no evento — como já é feito no
   * "Tornar supervisor". Repetível: nada aqui impede criar mais de um
   * operador, um de cada vez, cada um passando pelo mesmo fluxo.
   */
  const [escolhido, setEscolhido] = useState<FuncionarioDoEvento | 'manual' | null>(
    () => (!editando && funcionariosDoEvento.length > 0 ? null : 'manual')
  )
  const [busca, setBusca] = useState('')
  const mostrandoLista = !editando && escolhido === null

  /*
   * `''.includes('')` é sempre true — sem a guarda de `digitos`, buscar por
   * nome (sem número nenhum) fazia TODO CPF "bater" e a lista nunca filtrava
   * de verdade. Só compara CPF quando a busca realmente tem dígito.
   */
  const digitosBusca = busca.replace(/\D/g, '')
  const filtrados = busca.trim()
    ? funcionariosDoEvento.filter(f =>
        f.nome.toLowerCase().includes(busca.trim().toLowerCase()) || (digitosBusca && f.cpf.includes(digitosBusca)))
    : funcionariosDoEvento

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

  const chaveForm = editando ? operador!.id : (typeof escolhido === 'string' ? escolhido : escolhido?.id ?? 'vazio')
  const nomeInicial = editando ? operador!.nome : (escolhido && escolhido !== 'manual' ? escolhido.nome : '')
  const cpfInicial = editando
    ? (operador!.cpf ?? exibirIdentificador(operador!.email))
    : (escolhido && escolhido !== 'manual' ? escolhido.cpf : '')
  const telefoneInicial = editando
    ? (operador!.telefone ?? '')
    : (escolhido && escolhido !== 'manual' ? escolhido.telefone : '')
  const veioDaLista = !editando && escolhido !== null && escolhido !== 'manual'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !isPending && onFechar()}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-slate-800 font-bold">
            {editando ? 'Editar operador' : mostrandoLista ? 'Quem vai ser operador de portão?' : 'Novo operador de portão'}
          </h2>
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
                O WhatsApp com o link de criar senha já foi enviado (o login depois é pelo CPF). Se não
                chegar, copie o link abaixo e mande você mesmo — é de uso único e vale 24h.
              </p>
              <p className="text-amber-700 text-2xs mt-2">
                A mensagem reaproveita o texto de supervisor — ela vai dizer “supervisor” em vez de
                “operador de portão”. Não muda nada no acesso da pessoa, só o texto.
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
        ) : mostrandoLista ? (
          /*
           * Passo 1: escolher entre quem já está credenciado no evento.
           *
           * Mesmo motivo do "Tornar supervisor": pedir de novo nome e CPF de
           * alguém que já se cadastrou é retrabalho e risco de digitar um
           * dígito errado — o suficiente pra criar um cadastro fantasma.
           */
          <div className="p-6 space-y-3">
            {funcionariosDoEvento.length >= MINIMO_PARA_BUSCAR && (
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
              ) : filtrados.map(f => (
                <button
                  key={f.id}
                  onClick={() => setEscolhido(f)}
                  className="w-full flex items-center justify-between gap-2 text-left px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
                >
                  <span className="min-w-0">
                    <span className="block text-slate-800 text-sm font-medium truncate">{f.nome}</span>
                    <span className="block text-slate-400 text-xs font-mono tabular-nums">{formatCpf(f.cpf)}</span>
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
              <NomeInput name="nome" required defaultValue={nomeInicial} readOnly={veioDaLista} placeholder="Nome do operador" className={`input ${veioDaLista ? 'bg-slate-50 text-slate-500' : ''}`} />
            </Field>
            <Field label="CPF *">
              <CpfInput
                name="cpf" required
                defaultValue={cpfInicial}
                readOnly={veioDaLista}
                placeholder="000.000.000-00" className={`input ${veioDaLista ? 'bg-slate-50 text-slate-500' : ''}`}
              />
              <p className="text-slate-500 text-xs mt-1.5">
                {veioDaLista
                  ? 'Nome e CPF vêm do cadastro já feito — o credenciamento dela continua o mesmo.'
                  : 'É o login dela no sistema.'}
                {' '}{!editando && 'Depois de criar, a pessoa recebe automaticamente por WhatsApp o link de criar senha.'}
              </p>
            </Field>
            <Field label="WhatsApp *">
              <TelefoneInput name="telefone" required defaultValue={telefoneInicial} placeholder="(11) 99999-9999" className="input" />
              {veioDaLista && <p className="text-slate-500 text-xs mt-1.5">Confira se ainda é este o número.</p>}
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
