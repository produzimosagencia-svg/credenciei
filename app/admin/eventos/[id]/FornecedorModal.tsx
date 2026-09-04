'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Pencil } from 'lucide-react'
import { criarFornecedor, editarFornecedor } from '@/lib/actions'
import { NomeInput, CpfInput, TelefoneInput } from '@/components/inputs'
import { mensagemAmigavel } from '@/lib/erros'

type Props =
  /** `podeCriarSupervisor` — ver o bloco do supervisor no formulário. */
  | { mode: 'criar'; eventoId: string; podeCriarSupervisor?: boolean }
  | { mode: 'editar'; eventoId: string; fornecedorId: string; nome: string; valor_combinado: number | null; exige_meio?: boolean }

export default function FornecedorModal(props: Props) {
  const [open, setOpen] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const isEditar = props.mode === 'editar'
  const defaultNome = isEditar ? (props as any).nome : ''
  const defaultValor = isEditar ? (props as any).valor_combinado ?? '' : ''
  // Setor novo nasce SEM o meio, a pedido: ele só importa em equipe paga por
  // pessoa, que é a minoria. Quem precisa liga — e paga o WhatsApp só ali.
  const defaultExigeMeio = isEditar ? (props as any).exige_meio === true : false
  // Um id por instância: a tela mostra vários destes modais ao mesmo tempo
  // (um por setor), e `htmlFor` repetido faria o clique cair no cartão errado.
  const idExigeMeio = `exige_meio_${isEditar ? (props as any).fornecedorId : 'novo'}`

  /*
   * O erro do servidor precisa aparecer no formulário.
   *
   * Agora o cadastro pode ser recusado por causa do supervisor (CPF que já
   * é de outro tipo de acesso, telefone curto). Sem isto o modal fechava e o
   * setor simplesmente não aparecia na lista, sem dizer por quê.
   */
  const handleAction = (formData: FormData) => {
    setErro(null)
    startTransition(async () => {
      try {
        if (isEditar) {
          await editarFornecedor((props as any).fornecedorId, props.eventoId, formData)
        } else {
          await criarFornecedor(props.eventoId, formData)
        }
        setOpen(false)
        router.refresh()
      } catch (e) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <>
      {isEditar ? (
        <button onClick={() => setOpen(true)} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="Editar fornecedor/setor">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="btn btn-primario btn-sm">
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Novo Fornecedor/Setor</span>
          <span className="sm:hidden">Novo</span>
        </button>
      )}

      {open && (
        <div className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="modal-pop-in bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-800 font-bold text-base">{isEditar ? 'Editar Fornecedor/Setor' : 'Novo Fornecedor/Setor'}</h3>
              <button onClick={() => setOpen(false)} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form action={handleAction} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Nome da empresa / Setor *</label>
                <NomeInput name="nome" required defaultValue={defaultNome} placeholder="Ex: Segurança, Limpeza, Bar..." className="input" />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Valor combinado por funcionário</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input name="valor_combinado" type="number" min="0" step="0.01" defaultValue={defaultValor} placeholder="0,00" className="input pl-9 tabular-nums" />
                </div>
              </div>

              {/*
                * Confirmação do meio — só faz sentido em equipe paga POR PESSOA.
                *
                * Para fornecedor de pacote fechado ela não muda pagamento
                * nenhum: só gera mensagem de WhatsApp (cobrada) que ninguém
                * precisava receber. Fica aqui, no setor, porque o mesmo evento
                * tem os dois tipos ao mesmo tempo.
                */}
              <label
                htmlFor={idExigeMeio}
                className="flex items-start gap-2.5 cursor-pointer bg-slate-50 rounded-xl p-3"
              >
                <input
                  type="checkbox"
                  id={idExigeMeio}
                  name="exige_meio"
                  defaultChecked={defaultExigeMeio}
                  className="w-4 h-4 mt-0.5 rounded border-slate-300 text-brand-500 focus:ring-brand-400 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-700">Pedir confirmação no meio do turno</span>
                  <span className="block text-slate-500 text-xs mt-0.5">
                    A selfie que comprova que a pessoa ficou no posto. Vem desligado: ligue só
                    em equipe paga por pessoa (segurança, limpeza, carregadores, bar…). Em
                    fornecedor de pacote fechado não muda pagamento e só gasta WhatsApp.
                  </span>
                </span>
              </label>

              {/*
                * O SUPERVISOR VEM JUNTO, NÃO DEPOIS.
                *
                * Era outra tela, em outro menu — e por isso ficava pra depois:
                * o setor nascia com link de cadastro aberto e ninguém
                * responsável por conferir quem entrava. Agora o setor só
                * existe com alguém respondendo por ele.
                *
                * Só no cadastro: em "editar" o setor já tem supervisor, e
                * trocar quem responde por uma equipe é outra decisão, que
                * mora em Acessos.
                */}
              {props.mode === 'criar' && props.podeCriarSupervisor !== false && (
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div>
                    <p className="text-slate-800 text-sm font-semibold">Supervisor responsável *</p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      Ele recebe o acesso por WhatsApp e passa a cuidar desta equipe. Se a
                      pessoa já for supervisora aqui, digite o mesmo CPF — este setor entra
                      nos dela, sem criar login novo.
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Nome *</label>
                    <NomeInput name="supervisor_nome" required placeholder="Nome da pessoa" className="input" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">CPF *</label>
                    <CpfInput name="supervisor_cpf" required placeholder="000.000.000-00" className="input" />
                    <p className="text-slate-500 text-xs mt-1">É com ele que o supervisor entra no sistema.</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">WhatsApp *</label>
                    <TelefoneInput name="supervisor_telefone" required placeholder="(11) 99999-9999" className="input" />
                  </div>
                </div>
              )}

              {erro && <p className="text-red-500 text-xs">{erro}</p>}

              <button type="submit" disabled={isPending} className="btn btn-primario w-full">
                {isPending ? 'Salvando...' : (isEditar ? 'Salvar alterações' : 'Cadastrar fornecedor/setor')}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
