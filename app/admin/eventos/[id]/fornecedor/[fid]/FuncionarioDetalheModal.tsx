'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X, Camera, MapPin, Minus, User, ScanLine, Check, ClipboardCheck, Loader2, AlertTriangle, Users, ShieldCheck, Pencil } from 'lucide-react'
import { atualizarValorReceber, alternarPagamento, obterHistoricoDoFuncionario, moverFuncionarioDeSetor, criarSupervisor, situacaoDoAcesso, editarCpfFuncionario } from '@/lib/actions'
import { formatarBR } from '@/lib/tz'
import { mensagemAmigavel } from '@/lib/erros'
import HistoricoBatidas from '@/components/HistoricoBatidas'
import type { HistoricoNoEvento } from '@/lib/historico'
import type { Presenca } from './FuncionarioTable'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Funcionario = {
  id: string
  nome: string
  cpf: string
  telefone: string
  empresa: string
  cargo: string
  valorReceber: number
  chavePix: string | null
  pago: boolean
  pagoEm: string | null
  fotoUrl: string | null
  entrada: Presenca
  meio: Presenca
  fim: Presenca
}

type Aba = 'dados' | 'historico'

export default function FuncionarioDetalheModal({
  funcionario: f,
  fornecedorId,
  eventoId,
  eventoNome,
  setorNome,
  valorCombinado,
  trigger,
  outrosSetores = [],
  podeMoverDeSetor = false,
  podeCriarSupervisor = false,
  podeEditarCpf = false,
}: {
  funcionario: Funcionario
  fornecedorId: string
  eventoId: string
  eventoNome: string
  setorNome: string
  valorCombinado: number | null
  trigger: React.ReactNode
  /** Os demais setores do evento — o cardápio de para onde mover. */
  outrosSetores?: { id: string; nome: string }[]
  /** Só admin/master: mover afeta a equipe de outro supervisor. */
  podeMoverDeSetor?: boolean
  /** Mesma permissão que `criarSupervisor` exige no servidor. */
  podeCriarSupervisor?: boolean
  /** Mesma permissão que `editarCpfFuncionario` exige no servidor — ver `podeEditarIdentidade`. */
  podeEditarCpf?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [aba, setAba] = useState<Aba>('dados')
  const [valor, setValor] = useState(String(f.valorReceber))
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isPendingPagamento, startTransitionPagamento] = useTransition()

  const router = useRouter()

  // ── Mover para outro setor ────────────────────────────────────────────────
  const [destino, setDestino] = useState('')
  const [confirmandoMover, setConfirmandoMover] = useState(false)
  const [erroMover, setErroMover] = useState<string | null>(null)
  const [isPendingMover, startTransitionMover] = useTransition()

  const moverPara = (novoFornecedorId: string) => {
    setErroMover(null)
    startTransitionMover(async () => {
      try {
        await moverFuncionarioDeSetor(f.id, eventoId, novoFornecedorId)
        /*
         * A pessoa some da lista deste setor assim que a página atualizar —
         * é o efeito esperado de mover, não um bug. Fechar o modal evita que
         * ele fique aberto sobre uma linha que já não pertence mais aqui.
         */
        router.refresh()
        setOpen(false)
      } catch (e: any) {
        setErroMover(mensagemAmigavel(e))
        setConfirmandoMover(false)
      }
    })
  }

  // ── Corrigir CPF ───────────────────────────────────────────────────────────
  /*
   * Só master, por enquanto — ver `podeEditarIdentidade`. Existe porque
   * "refazer o cadastro" perde QR, histórico e pagamento já vinculados ao
   * registro antigo; corrigir no mesmo registro preserva os três.
   */
  const [editandoCpf, setEditandoCpf] = useState(false)
  const [novoCpf, setNovoCpf] = useState(f.cpf)
  const [erroCpf, setErroCpf] = useState<string | null>(null)
  const [isPendingCpf, startTransitionCpf] = useTransition()

  const abrirEditarCpf = () => {
    setErroCpf(null)
    setNovoCpf(f.cpf)
    setEditandoCpf(true)
  }

  const salvarCpf = () => {
    setErroCpf(null)
    startTransitionCpf(async () => {
      try {
        /*
         * O erro vem como VALOR de retorno, não como exceção: mensagem
         * lançada de dentro de uma Server Action é apagada pelo Next em
         * produção e chega aqui como texto genérico em inglês. Ver o
         * comentário em `editarCpfFuncionario`. O `catch` fica só para a
         * falha de rede, que é a única exceção real possível aqui.
         */
        const r = await editarCpfFuncionario(f.id, fornecedorId, eventoId, novoCpf)
        if ('erro' in r) { setErroCpf(r.erro); return }
        router.refresh()
        setEditandoCpf(false)
      } catch (e: any) {
        setErroCpf(mensagemAmigavel(e))
      }
    })
  }

  // ── Tornar supervisor ─────────────────────────────────────────────────────
  /*
   * `criarSupervisor` já faz tudo: cria o login (Auth + `perfis`) se o CPF
   * for novo, ou reaproveita/realoca se já existir, e dispara a mensagem de
   * WhatsApp avisando a pessoa. `perfis` (login de supervisor) e
   * `funcionarios` (credenciamento/pagamento) são tabelas independentes — a
   * mesma pessoa pode estar nas duas, ligada só pelo CPF. Por isso este botão
   * não precisa de nenhuma lógica nova: só chama a action existente com os
   * dados que este funcionário já tem cadastrados.
   */
  const [telefoneSupervisor, setTelefoneSupervisor] = useState(f.telefone)
  const [confirmandoSupervisor, setConfirmandoSupervisor] = useState(false)
  const [erroSupervisor, setErroSupervisor] = useState<string | null>(null)
  const [okSupervisor, setOkSupervisor] = useState<string | null>(null)
  const [isPendingSupervisor, startTransitionSupervisor] = useTransition()
  /*
   * O conflito de acesso (CPF já é operador de portão, admin etc.) é
   * conferido ANTES de mostrar o formulário — não depois do "Confirmar".
   *
   * Sem isto, a pessoa preenchia telefone e clicava Confirmar pra só então
   * descobrir que o CPF já tinha outro tipo de acesso — passos perdidos por
   * um erro que já era sabido desde o primeiro clique. Foi o que aconteceu
   * de verdade com uma operadora de portão.
   *
   * `undefined` = ainda não verificado; `null` = verificado, sem conflito.
   */
  const [conflitoAcesso, setConflitoAcesso] = useState<string | null | undefined>(undefined)
  const [verificandoAcesso, setVerificandoAcesso] = useState(false)

  const abrirTornarSupervisor = () => {
    setOkSupervisor(null)
    setErroSupervisor(null)
    setConfirmandoSupervisor(true)
    setVerificandoAcesso(true)
    situacaoDoAcesso(f.cpf).then(r => {
      setConflitoAcesso(r.role && r.role !== 'supervisor' ? r.nomePapel : null)
    }).catch(() => {
      // Falhou a checagem prévia: não bloqueia o fluxo — o servidor confere
      // de novo no envio de qualquer forma, ver `criarSupervisor`.
      setConflitoAcesso(null)
    }).finally(() => setVerificandoAcesso(false))
  }

  const tornarSupervisor = () => {
    setErroSupervisor(null)
    const dados = new FormData()
    dados.set('nome', f.nome)
    dados.set('cpf', f.cpf)
    dados.set('telefone', telefoneSupervisor)
    dados.set('ativo', 'true')
    startTransitionSupervisor(async () => {
      try {
        const r = await criarSupervisor(fornecedorId, eventoId, dados)
        setConfirmandoSupervisor(false)
        setOkSupervisor(
          r.novo
            ? 'Supervisor criado e avisado por WhatsApp.'
            : r.avisado
              ? 'Login de supervisor associado a este setor e pessoa avisada por WhatsApp.'
              // Já era supervisora deste evento: nada de WhatsApp de novo — ela
              // troca de setor no próprio acesso, em "Meus setores".
              : 'Setor adicionado ao acesso dela. Não avisamos de novo por WhatsApp: ela já supervisiona este evento e troca de setor no próprio login.'
        )
        router.refresh()
      } catch (e: any) {
        setErroSupervisor(mensagemAmigavel(e))
      }
    })
  }

  /*
   * O histórico só é buscado quando a aba é aberta, e uma vez só.
   *
   * A lista de colaboradores pode ter dezenas de linhas; buscar o histórico
   * completo de todo mundo ao carregar a tela multiplicaria a consulta por
   * pessoa sem necessidade — a maioria dos cliques na lista nunca chega a
   * abrir esta aba. `undefined` é "ainda não pedido", diferente de `null`
   * (pedido, e deu erro) — a tela precisa diferenciar as duas coisas.
   */
  const [historico, setHistorico] = useState<HistoricoNoEvento | null | undefined>(undefined)
  const [erroHistorico, setErroHistorico] = useState<string | null>(null)
  const [carregandoHistorico, startCarregarHistorico] = useTransition()

  const abrirAba = (a: Aba) => {
    setAba(a)
    if (a === 'historico' && historico === undefined && !carregandoHistorico) {
      startCarregarHistorico(async () => {
        const r = await obterHistoricoDoFuncionario(f.id)
        if (r.historico) {
          setHistorico(r.historico)
        } else {
          setErroHistorico(r.error ?? 'Não foi possível carregar o histórico.')
          setHistorico(null)
        }
      })
    }
  }

  const handleSalvar = () => {
    setErro(null)
    const n = parseFloat(valor.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) {
      setErro('Valor inválido')
      return
    }
    startTransition(async () => {
      try {
        await atualizarValorReceber(f.id, fornecedorId, eventoId, n)
        router.refresh()
        setOpen(false)
      } catch (e: any) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  const handleAlternarPagamento = () => {
    startTransitionPagamento(async () => {
      try {
        await alternarPagamento(f.id, fornecedorId, eventoId, !f.pago)
        router.refresh()
      } catch (e: any) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-left">{trigger}</button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div
            /*
             * A aba "Histórico" precisa de mais largura que a de "Dados": a
             * tabela tem sete colunas, e num modal de 448px ela viraria uma
             * faixa amassada com rolagem lateral mesmo no notebook. A de
             * "Dados" continua estreita — ela é só rótulo e valor.
             *
             * No celular as duas ocupam a tela inteira (sem cantos
             * arredondados, sem margem): é a diferença entre modal e painel
             * que a tela pequena pede.
             */
            className={`modal-pop-in relative bg-white sm:rounded-2xl shadow-xl w-full h-full sm:h-auto
                        ${aba === 'historico' ? 'sm:max-w-3xl' : 'sm:max-w-md'}
                        sm:max-h-[90vh] overflow-y-auto transition-[max-width] duration-200`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-3 min-w-0">
                {f.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.fotoUrl} alt={f.nome} className="w-12 h-12 rounded-full object-cover border border-slate-200 shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                    <User className="w-6 h-6 text-slate-300" />
                  </div>
                )}
                <div className="min-w-0">
                  <h2 className="text-slate-800 font-bold truncate">{f.nome}</h2>
                  <p className="text-slate-400 text-xs mt-0.5 truncate">
                    {eventoNome}{setorNome ? ` · ${setorNome}` : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* As abas. "Dados" primeiro porque é o que se vem consultar mais
                vezes — valor, PIX, se já foi pago; o histórico é uma consulta
                mais rara, de fechamento. */}
            <div className="flex gap-1 px-6 pt-3 border-b border-slate-100 sticky top-[73px] bg-white z-10">
              {(['dados', 'historico'] as const).map(a => (
                <button
                  key={a}
                  onClick={() => abrirAba(a)}
                  className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                    aba === a
                      ? 'border-brand-500 text-brand-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {a === 'dados' ? 'Dados' : 'Histórico de batidas'}
                </button>
              ))}
            </div>

            {aba === 'dados' ? (
              <div className="p-6 space-y-5">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-400 text-xs">CPF</p>
                    {!editandoCpf ? (
                      <div className="flex items-center gap-1.5">
                        <p className="text-slate-700 font-medium font-mono tabular-nums">{f.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</p>
                        {podeEditarCpf && (
                          <button
                            onClick={abrirEditarCpf}
                            className="p-0.5 text-slate-300 hover:text-brand-500"
                            title="Corrigir CPF"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-700 font-medium font-mono tabular-nums">{f.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs">Telefone</p>
                    <p className="text-slate-700 font-medium tabular-nums">{f.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}</p>
                  </div>
                </div>

                {/*
                  * Corrigir CPF — separado do bloco acima (não inline no grid)
                  * porque o aviso e o formulário precisam da largura toda, e
                  * porque errar o CPF muda quem a pessoa É pro sistema: merece
                  * mais destaque que um campo qualquer.
                  */}
                {editandoCpf && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2.5 -mt-2">
                    <p className="text-amber-800 text-xs">
                      Corrige o CPF neste mesmo cadastro — o QR, o histórico de batidas e o pagamento continuam os mesmos, só o número muda.
                    </p>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={novoCpf}
                      onChange={e => setNovoCpf(e.target.value.replace(/\D/g, '').slice(0, 11))}
                      className="input text-sm font-mono tabular-nums"
                      placeholder="Só números"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={salvarCpf}
                        disabled={isPendingCpf || novoCpf.length !== 11}
                        className="btn btn-primario btn-sm disabled:opacity-50"
                      >
                        {isPendingCpf ? 'Salvando…' : 'Confirmar'}
                      </button>
                      <button
                        onClick={() => setEditandoCpf(false)}
                        disabled={isPendingCpf}
                        className="btn btn-secundario btn-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                    {erroCpf && <p className="text-red-500 text-xs">{erroCpf}</p>}
                  </div>
                )}

                {/*
                  * Mover para outro setor — só quem gerencia o evento inteiro.
                  *
                  * Existe para o admin resolver cadastro no setor errado
                  * sozinho, sem precisar pedir para alguém mexer direto no
                  * banco — foi exatamente isso que aconteceu com dois
                  * "Carregadores" duplicados neste mesmo evento.
                  */}
                {podeMoverDeSetor && outrosSetores.length > 0 && (
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Setor</p>
                    <p className="text-sm text-slate-700 mb-2">
                      Atualmente em <strong>{setorNome}</strong>
                    </p>

                    {!confirmandoMover ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={destino}
                          onChange={e => setDestino(e.target.value)}
                          className="input text-sm flex-1"
                        >
                          <option value="">Mover para…</option>
                          {outrosSetores.map(s => (
                            <option key={s.id} value={s.id}>{s.nome}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => destino && setConfirmandoMover(true)}
                          disabled={!destino}
                          className="btn btn-secundario shrink-0 disabled:opacity-50"
                        >
                          <Users className="w-3.5 h-3.5 shrink-0" /> Mover
                        </button>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2.5">
                        <p className="text-amber-800 text-xs">
                          {f.nome} passa a fazer parte de{' '}
                          <strong>{outrosSetores.find(s => s.id === destino)?.nome}</strong>.
                          O QR code, o CPF e as batidas já feitas continuam os mesmos — só o
                          setor muda.
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => moverPara(destino)}
                            disabled={isPendingMover}
                            className="btn btn-primario btn-sm disabled:opacity-50"
                          >
                            {isPendingMover ? 'Movendo…' : 'Confirmar'}
                          </button>
                          <button
                            onClick={() => setConfirmandoMover(false)}
                            disabled={isPendingMover}
                            className="btn btn-secundario btn-sm"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                    {erroMover && <p className="text-red-500 text-xs mt-1.5">{erroMover}</p>}
                  </div>
                )}

                {/*
                  * Tornar supervisor — reaproveita nome/CPF já credenciados;
                  * só o telefone fica editável, pra confirmar que é o WhatsApp
                  * certo antes de disparar o convite.
                  */}
                {podeCriarSupervisor && (
                  <div className="border-t border-slate-100 pt-4">
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Supervisor</p>

                    {!confirmandoSupervisor ? (
                      <button
                        onClick={abrirTornarSupervisor}
                        className="btn btn-secundario w-full"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> Tornar {f.nome.split(' ')[0]} supervisor(a) de {setorNome}
                      </button>
                    ) : verificandoAcesso ? (
                      <div className="flex items-center gap-2 text-slate-400 text-xs py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Conferindo o CPF…
                      </div>
                    ) : conflitoAcesso ? (
                      /*
                       * CPF já tem outro tipo de acesso — dito ANTES de pedir
                       * telefone, não depois de um "Confirmar" que ia falhar.
                       */
                      <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
                        <p className="text-red-700 text-xs">
                          {f.nome} já tem acesso ao sistema como <strong>{conflitoAcesso}</strong>, com este mesmo CPF.
                          Uma pessoa não pode ter dois tipos de acesso — desative o acesso atual dela antes de torná-la
                          supervisor(a), em <Link href="/admin/usuarios" className="underline font-medium">Acessos</Link>.
                        </p>
                        <button
                          onClick={() => setConfirmandoSupervisor(false)}
                          className="btn btn-secundario btn-sm"
                        >
                          Entendi
                        </button>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2.5">
                        <p className="text-amber-800 text-xs">
                          {f.nome} passa a ter login de supervisor(a) de <strong>{setorNome}</strong>, entrando com o CPF já
                          cadastrado. Ela recebe um WhatsApp avisando da escala e com um link para criar a senha. O
                          credenciamento dela como funcionária continua igual, para efeito de pagamento.
                        </p>
                        <div>
                          <p className="text-amber-700 text-2xs font-semibold uppercase tracking-wide mb-1">Telefone para o convite</p>
                          <input
                            type="tel"
                            value={telefoneSupervisor}
                            onChange={e => setTelefoneSupervisor(e.target.value.replace(/\D/g, ''))}
                            className="input text-sm"
                            placeholder="27999999999"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={tornarSupervisor}
                            disabled={isPendingSupervisor || telefoneSupervisor.replace(/\D/g, '').length < 10}
                            className="btn btn-primario btn-sm disabled:opacity-50"
                          >
                            {isPendingSupervisor ? 'Enviando…' : 'Confirmar'}
                          </button>
                          <button
                            onClick={() => setConfirmandoSupervisor(false)}
                            disabled={isPendingSupervisor}
                            className="btn btn-secundario btn-sm"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                    {erroSupervisor && <p className="text-red-500 text-xs mt-1.5">{erroSupervisor}</p>}
                    {okSupervisor && <p className="text-green-600 text-xs mt-1.5">{okSupervisor}</p>}
                  </div>
                )}

                <div>
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Presença hoje</p>
                  <div className="space-y-1.5">
                    <LinhaPresenca label="Entrada" p={f.entrada} />
                    <LinhaPresenca label="Meio" p={f.meio} />
                    <LinhaPresenca label="Fim" p={f.fim} />
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Financeiro</p>
                    <button
                      onClick={handleAlternarPagamento}
                      disabled={isPendingPagamento}
                      className={`btn-press flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg disabled:opacity-50 disabled:active:scale-100 ${
                        f.pago ? 'bg-green-500 text-white hover:bg-green-600' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                      title={f.pago && f.pagoEm ? `Pago em ${formatarBR(f.pagoEm, 'curto')} — clique para desfazer` : 'Marcar como pago'}
                    >
                      {f.pago ? <Check className="w-3.5 h-3.5" /> : null}
                      {isPendingPagamento ? 'Salvando...' : f.pago ? 'PAGO' : 'Marcar como pago'}
                    </button>
                  </div>
                  {valorCombinado != null && (
                    <div className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2">
                      <span className="text-slate-500">Valor combinado (setor)</span>
                      <span className="text-slate-700 font-semibold tabular-nums">{brl(valorCombinado)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm bg-slate-50 rounded-lg px-3 py-2 gap-2">
                    <span className="text-slate-500 shrink-0">Chave PIX</span>
                    <span className={`font-medium font-mono truncate ${f.chavePix ? 'text-slate-700' : 'text-slate-300'}`}>
                      {f.chavePix || 'Não informada'}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">Valor a receber do setor</p>
                  <p className="text-slate-400 text-xs mb-2">
                    Quanto este funcionário deve receber dos demais integrantes de {f.empresa || 'seu setor'}.
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={valor}
                        onChange={e => setValor(e.target.value.replace(/^0+(?=\d)/, ''))}
                        className="input pl-9 tabular-nums"
                      />
                    </div>
                    <button
                      onClick={handleSalvar}
                      disabled={isPending}
                      className="btn btn-primario shrink-0"
                    >
                      {isPending ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                  {erro && <p className="text-red-500 text-xs mt-1.5">{erro}</p>}
                </div>
              </div>
            ) : (
              <div className="p-6">
                {carregandoHistorico ? (
                  <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-16">
                    <Loader2 className="w-4 h-4 animate-spin" /> Carregando histórico…
                  </div>
                ) : erroHistorico ? (
                  <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-700 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {erroHistorico}
                  </div>
                ) : historico ? (
                  <HistoricoBatidas h={historico} />
                ) : null}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function LinhaPresenca({ label, p }: { label: string; p: Presenca }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2 space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">{label}</span>
        {!p ? (
          <span className="text-slate-300 flex items-center gap-1"><Minus className="w-3.5 h-3.5" /></span>
        ) : (
          <div className="flex items-center gap-1.5">
            <span className="text-green-600 text-xs font-semibold">{formatarBR(p.feitoEm, 'curto')}</span>
            {p.fotoUrl && (
              <a href={p.fotoUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-brand-500" title="Ver foto">
                <Camera className="w-3.5 h-3.5" />
              </a>
            )}
            {p.lat != null && p.lng != null && (
              <a href={`https://maps.google.com/?q=${p.lat},${p.lng}`} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-brand-500" title="Ver local">
                <MapPin className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        )}
      </div>
      {p?.enderecoAproximado && (
        <p className="text-slate-400 text-2xs flex items-center gap-1">
          <MapPin className="w-2.5 h-2.5 shrink-0" /> {p.enderecoAproximado}
        </p>
      )}
      {/* Batida regularizada pelo supervisor: destaca em laranja e mostra a
          trilha de auditoria (quem, por quê), porque não foi a própria pessoa. */}
      {p?.assistido ? (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 space-y-0.5">
          <p className="text-amber-700 text-2xs font-semibold flex items-center gap-1">
            <ClipboardCheck className="w-3 h-3 shrink-0" /> Batida registrada por supervisor
          </p>
          {p.registradoPor && <p className="text-amber-600 text-2xs">Responsável: {p.registradoPor}</p>}
          {p.justificativa && <p className="text-amber-600/80 text-2xs leading-snug">{p.justificativa}</p>}
        </div>
      ) : p?.registradoPor ? (
        <p className="text-slate-400 text-2xs flex items-center gap-1">
          <ScanLine className="w-2.5 h-2.5 shrink-0" /> Registrado por {p.registradoPor}
        </p>
      ) : null}
    </div>
  )
}
