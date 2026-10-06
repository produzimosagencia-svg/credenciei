'use client'
import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Pencil, Check } from 'lucide-react'
import { criarFornecedor, editarFornecedor, buscarSupervisorPorCpf, carregarTravasDoModal } from '@/lib/actions'
import { rotuloDoDia, ROTULO_FASE, type DiaDaEscala } from '@/lib/escala-regras'
import { NomeInput, CpfInput, TelefoneInput } from '@/components/inputs'
import { mensagemAmigavel } from '@/lib/erros'

type Subevento = { id: string; nome: string }

type Props =
  /**
   * `podeCriarSupervisor` — ver o bloco do supervisor no formulário.
   * `subeventoId` — fixo (sem seletor), quando o fornecedor nasce dentro da
   * página de um subevento (correção 30/09/2026: Evento → Subevento →
   * Fornecedor). Ausente = nasce direto no evento, como sempre foi.
   */
  | { mode: 'criar'; eventoId: string; podeCriarSupervisor?: boolean; subeventoId?: string }
  | {
      mode: 'editar'; eventoId: string; fornecedorId: string; nome: string; valor_combinado: number | null
      /** Cota/teto de pessoas nesta equipe — ver a trava de cota em Configurações. */
      quantidade_estimada?: number | null
      exige_meio?: boolean; entrada_qualquer_horario?: boolean
      /** Lista de subeventos do evento — vazia = evento não usa, sem seletor. */
      subeventos?: Subevento[]
      /** O subevento ATUAL deste fornecedor, se houver. */
      subevento_id?: string | null
    }

export default function FornecedorModal(props: Props) {
  const [open, setOpen] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const isEditar = props.mode === 'editar'

  /*
   * Trava de pessoas POR DIA (pedido do Juan, 06/10/2026 — antes só a
   * planilha de estrutura gravava). Busca ao abrir: os dias e a trava atual
   * vêm do servidor, e a seção só existe quando o evento usa dias de
   * trabalho por pessoa. Evento sem isso: o modal é exatamente o de sempre.
   */
  const [travas, setTravas] = useState<{ dias: DiaDaEscala[]; atuais: Record<string, number> } | null>(null)
  const eventoIdDoModal = props.eventoId
  const fornecedorIdDoModal = props.mode === 'editar' ? props.fornecedorId : undefined
  useEffect(() => {
    if (!open) return
    let vivo = true
    carregarTravasDoModal(eventoIdDoModal, fornecedorIdDoModal)
      .then(r => { if (vivo && r.usaEscala && r.dias.length) setTravas({ dias: r.dias, atuais: r.travas }) })
      .catch(() => { /* sem a seção — o resto do modal segue */ })
    return () => { vivo = false }
  }, [open, eventoIdDoModal, fornecedorIdDoModal])
  const defaultNome = isEditar ? (props as any).nome : ''
  const defaultValor = isEditar ? (props as any).valor_combinado ?? '' : ''
  const defaultQuantidade = isEditar ? (props as any).quantidade_estimada ?? '' : ''
  // Setor novo nasce SEM o meio, a pedido: ele só importa em equipe paga por
  // pessoa, que é a minoria. Quem precisa liga — e paga o WhatsApp só ali.
  const defaultExigeMeio = isEditar ? (props as any).exige_meio === true : false
  const defaultEntradaQualquerHorario = isEditar ? (props as any).entrada_qualquer_horario === true : false
  const subeventosDoEditar: Subevento[] = isEditar ? ((props as any).subeventos ?? []) : []
  const defaultSubeventoId = isEditar ? ((props as any).subevento_id ?? '') : ''
  // Um id por instância: a tela mostra vários destes modais ao mesmo tempo
  // (um por setor), e `htmlFor` repetido faria o clique cair no cartão errado.
  const sufixoId = isEditar ? (props as any).fornecedorId : 'novo'
  const idExigeMeio = `exige_meio_${sufixoId}`
  const idEntradaQualquerHorario = `entrada_qualquer_horario_${sufixoId}`

  /*
   * Achar supervisor existente pelo CPF (pedido do Juan, 02/10/2026): quem
   * já é supervisor aqui não devia ter que digitar de novo nome e WhatsApp
   * que o sistema já tem. `nome`/`telefone` ficam vazios até o CPF completar
   * 11 dígitos E achar alguém — aí preenchem sozinhos via `key` (força os
   * inputs formatados a remontar com o novo `defaultValue`, já que eles só
   * leem `defaultValue` na montagem).
   */
  const [supervisorEncontrado, setSupervisorEncontrado] = useState<{ nome: string; telefone: string | null } | null>(null)
  const [buscandoSupervisor, setBuscandoSupervisor] = useState(false)
  const aoDigitarSupervisorCpf = (cpfFormatado: string) => {
    setSupervisorEncontrado(null)
    const digitos = cpfFormatado.replace(/\D/g, '')
    if (digitos.length !== 11) return
    setBuscandoSupervisor(true)
    buscarSupervisorPorCpf(digitos)
      .then(r => setSupervisorEncontrado(r))
      .finally(() => setBuscandoSupervisor(false))
  }

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
          const r = await criarFornecedor(props.eventoId, formData)
          if (r?.error) { setErro(r.error); return }
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
        <button onClick={() => setOpen(true)} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100" title="Editar fornecedor">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="btn btn-primario btn-sm">
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Novo Fornecedor</span>
          <span className="sm:hidden">Novo</span>
        </button>
      )}

      {open && (
        <div className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="modal-pop-in bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-800 font-bold text-base">{isEditar ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
              <button onClick={() => setOpen(false)} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form action={handleAction} className="space-y-4">
              {/* Nasce dentro de um subevento, fixo — sem pergunta nenhuma. */}
              {!isEditar && props.subeventoId && (
                <input type="hidden" name="subevento_id" value={props.subeventoId} />
              )}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Nome da empresa / Fornecedor *</label>
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
                * Cota da equipe — a trava de cota (Vital, item 3) lê esse
                * número pra bloquear cadastro acima do teto, mas até agora só
                * dava pra preencher via planilha. Em branco = sem teto (só
                * referência nenhuma, nem bloqueia nem mostra progresso).
                */}
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Quantidade de colaboradores</label>
                <input
                  name="quantidade_estimada"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={defaultQuantidade}
                  placeholder="Ex: 20"
                  className="input tabular-nums"
                />
                <p className="text-slate-500 text-xs mt-1">
                  Teto da equipe. Com a trava de cota ligada (Configurações → Funcionalidade do
                  Sistema), cadastro por link ou planilha acima deste número é bloqueado.
                </p>
              </div>

              {/* Limite por dia — só em evento com dias de trabalho por pessoa. Em branco = sem limite naquele dia. */}
              {travas && (
                <div>
                  <input type="hidden" name="trava_presente" value="1" />
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Limite de pessoas por dia</label>
                  <div className="grid grid-cols-2 gap-2">
                    {travas.dias.map(d => {
                      const r = rotuloDoDia(d.data)
                      return (
                        <label key={d.data} className="block">
                          <span className="block text-xs text-slate-500 mb-1">
                            {r.semanaCurta} {r.curto} <span className="opacity-60">· {ROTULO_FASE[d.fase]}</span>
                          </span>
                          <input
                            name={`trava_${d.data}`} type="number" min="1" step="1"
                            defaultValue={travas.atuais[d.data] ?? ''} placeholder="Sem limite"
                            className="input tabular-nums"
                          />
                        </label>
                      )
                    })}
                  </div>
                  <p className="text-slate-500 text-xs mt-1">
                    Quantas pessoas este setor aceita em cada dia. Quando o dia enche, ele aparece como
                    &quot;lotado&quot; no formulário do funcionário e o supervisor não consegue aprovar mais.
                    Em branco = sem limite.
                  </p>
                </div>
              )}

              {/*
                * Mover/atribuir subevento — só no editar, e só quando o evento
                * tem subeventos cadastrados (correção 30/09/2026). Vazio =
                * "Nenhum" — tira o fornecedor de dentro de um subevento, volta
                * a ficar direto no evento.
                */}
              {isEditar && !!subeventosDoEditar.length && (
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Subevento</label>
                  <select name="subevento_id" defaultValue={defaultSubeventoId ?? ''} className="input">
                    <option value="">Nenhum (direto no evento)</option>
                    {subeventosDoEditar.map(s => (
                      <option key={s.id} value={s.id}>{s.nome}</option>
                    ))}
                  </select>
                </div>
              )}

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
                  className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-brand-500 shrink-0"
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
                * Entrada em qualquer horário (Vital, item 5) — isenta ESTE
                * fornecedor da janela de horário do evento, mesmo que o
                * evento não tenha "batida livre" ligada. Pra quem foge da
                * escala combinada (banda, postura e afins).
                */}
              <label
                htmlFor={idEntradaQualquerHorario}
                className="flex items-start gap-2.5 cursor-pointer bg-slate-50 rounded-xl p-3"
              >
                <input
                  type="checkbox"
                  id={idEntradaQualquerHorario}
                  name="entrada_qualquer_horario"
                  defaultChecked={defaultEntradaQualquerHorario}
                  className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-brand-500 shrink-0"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-700">Entrada em qualquer horário</span>
                  <span className="block text-slate-500 text-xs mt-0.5">
                    Esta equipe não segue o horário de entrada configurado no evento — pra quem
                    foge da escala combinada (banda, postura, atrações e afins).
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
                      pessoa já for supervisora aqui, digite o CPF dela — o sistema acha
                      sozinho e completa nome e WhatsApp, sem criar login novo.
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">CPF *</label>
                    <CpfInput
                      name="supervisor_cpf"
                      required
                      placeholder="000.000.000-00"
                      className="input"
                      onValueChange={aoDigitarSupervisorCpf}
                    />
                    {buscandoSupervisor ? (
                      <p className="text-slate-500 text-xs mt-1">Procurando...</p>
                    ) : supervisorEncontrado ? (
                      <p className="text-sucesso-700 text-xs mt-1 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5 shrink-0" /> Já é supervisor(a) aqui — nome e WhatsApp preenchidos.
                      </p>
                    ) : (
                      <p className="text-slate-500 text-xs mt-1">É com ele que o supervisor entra no sistema.</p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Nome *</label>
                    <NomeInput
                      key={supervisorEncontrado?.nome ?? 'vazio'}
                      name="supervisor_nome"
                      required
                      defaultValue={supervisorEncontrado?.nome ?? ''}
                      placeholder="Nome da pessoa"
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">WhatsApp *</label>
                    <TelefoneInput
                      key={supervisorEncontrado?.telefone ?? 'vazio'}
                      name="supervisor_telefone"
                      required
                      defaultValue={supervisorEncontrado?.telefone ?? ''}
                      placeholder="(11) 99999-9999"
                      className="input"
                    />
                  </div>
                </div>
              )}

              {erro && <p className="text-red-500 text-xs">{erro}</p>}

              <button type="submit" disabled={isPending} className="btn btn-primario w-full">
                {isPending ? 'Salvando...' : (isEditar ? 'Salvar alterações' : 'Cadastrar fornecedor')}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
