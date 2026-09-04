'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, ChevronDown, Search, SlidersHorizontal, Trash2, X,
  Camera, MapPin, Minus, User, UserCheck, UserX, UserMinus, ClipboardCheck,
} from 'lucide-react'
import { deletarFuncionario, alternarAtivacao, descredenciarFuncionario, recredenciarFuncionario } from '@/lib/actions'
import ConfirmModal from '@/components/ConfirmModal'
import { formatarBR } from '@/lib/tz'
import { mensagemAmigavel } from '@/lib/erros'
import FuncionarioDetalheModal from './FuncionarioDetalheModal'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const PAGE_SIZE = 25

export type Presenca = {
  feitoEm: string
  fotoUrl: string | null
  lat: number | null
  lng: number | null
  enderecoAproximado: string | null
  registradoPor: string | null
  /** Batida regularizada pelo supervisor, não pela própria pessoa. */
  assistido: boolean
  justificativa: string | null
} | null

export type StatusEtapa = 'feito' | 'aberto' | 'fechado' | 'indefinido'

type Funcionario = {
  id: string
  nome: string
  cpf: string
  telefone: string
  empresa: string
  cargo: string
  qr_token: string
  valorReceber: number
  chavePix: string | null
  pago: boolean
  pagoEm: string | null
  ativo: boolean
  /** Carimbo de quando saiu do evento. `null` = está na equipe. */
  descredenciadoEm?: string | null
  fotoUrl: string | null
  entrada: Presenca
  meio: Presenca
  fim: Presenca
  statusEntrada: StatusEtapa
  statusMeio: StatusEtapa
  statusFim: StatusEtapa
}

type FiltroRapido = 'todos' | 'pendencias' | 'presentes' | 'ausentes' | 'nao_ativados'

const OPCOES_STATUS: { value: StatusEtapa | 'todos'; label: string }[] = [
  { value: 'todos', label: 'Qualquer status' },
  { value: 'feito', label: 'Registrado' },
  { value: 'aberto', label: 'Dentro do prazo' },
  { value: 'fechado', label: 'Não registrado (atrasado)' },
]

export default function FuncionarioTable({
  funcionarios,
  fornecedorId,
  eventoId,
  eventoNome,
  setorNome,
  valorCombinado,
  podeExcluir = false,
  outrosSetores = [],
  podeMoverDeSetor = false,
  podeCriarSupervisor = false,
  podeEditarCpf = false,
  podeEditarPonto = false,
  role,
}: {
  funcionarios: Funcionario[]
  fornecedorId: string
  eventoId: string
  /** Só para o cabeçalho do modal do funcionário — não muda nenhuma consulta. */
  eventoNome: string
  setorNome: string
  valorCombinado: number | null
  /** Os demais setores do evento, para o "mover para outro setor" do modal. */
  outrosSetores?: { id: string; nome: string }[]
  /** Só admin/master: mover afeta a equipe de outro supervisor. */
  podeMoverDeSetor?: boolean
  /** Mesma permissão que `criarSupervisor` exige no servidor. */
  podeCriarSupervisor?: boolean
  /**
   * Só o master exclui. Para o supervisor/admin, DESATIVAR resolve o mesmo
   * problema do dia (a pessoa para de registrar presença) sem apagar as
   * batidas que já aconteceram — que é justamente o que se precisa provar
   * depois, se alguém contestar pagamento.
   */
  podeExcluir?: boolean
  /** Mesma permissão que `editarCpfFuncionario` exige no servidor — ver `podeEditarIdentidade`. */
  podeEditarCpf?: boolean
  /** Mesma permissão que `lancarPontoManual` exige no servidor — clique-pra-editar no Histórico. */
  podeEditarPonto?: boolean
  /** Ver o mesmo prop em FuncionarioDetalheModal — decide se motivo é obrigatório. */
  role?: string
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('todos')
  const [statusEntrada, setStatusEntrada] = useState<StatusEtapa | 'todos'>('todos')
  const [statusMeio, setStatusMeio] = useState<StatusEtapa | 'todos'>('todos')
  const [statusFim, setStatusFim] = useState<StatusEtapa | 'todos'>('todos')
  // Os três seletores por etapa são o filtro fino, usado bem menos que a
  // busca e os atalhos — ficam escondidos atrás de "Mais filtros" pra não
  // competir visualmente com o que a maioria usa o tempo todo.
  const [maisFiltros, setMaisFiltros] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const filtrosAvancadosAtivos = [statusEntrada, statusMeio, statusFim].filter(v => v !== 'todos').length

  const filtered = useMemo(() => funcionarios.filter(f => {
    const s = search.toLowerCase()
    const bateBusca = s === '' ||
      f.nome.toLowerCase().includes(s) ||
      f.cpf.includes(search) ||
      f.empresa.toLowerCase().includes(s) ||
      f.cargo.toLowerCase().includes(s)
    if (!bateBusca) return false

    if (statusEntrada !== 'todos' && f.statusEntrada !== statusEntrada) return false
    if (statusMeio !== 'todos' && f.statusMeio !== statusMeio) return false
    if (statusFim !== 'todos' && f.statusFim !== statusFim) return false

    if (filtroRapido === 'presentes' && !(f.entrada && !f.fim)) return false
    if (filtroRapido === 'ausentes' && f.entrada) return false
    if (filtroRapido === 'pendencias' && !(f.statusEntrada === 'fechado' || f.statusMeio === 'fechado' || f.statusFim === 'fechado')) return false
    if (filtroRapido === 'nao_ativados' && f.ativo) return false

    return true
  }), [funcionarios, search, filtroRapido, statusEntrada, statusMeio, statusFim])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const updateSearch = (value: string) => { setSearch(value); setPage(1) }

  const [paraExcluir, setParaExcluir] = useState<Funcionario | null>(null)
  /*
   * Tirar da equipe = DESCREDENCIAR, não apagar.
   *
   * Apagar cascateia no banco e leva junto as batidas de ponto (que
   * sustentam o pagamento) — decisão do Juan em 04/09/2026. Descredenciar
   * tira a pessoa das listas do evento e invalida o QR dela ali, sem
   * destruir nada, e tem volta pelo mesmo botão.
   */
  const [paraTirar, setParaTirar] = useState<Funcionario | null>(null)
  const [erroAtivacao, setErroAtivacao] = useState<string | null>(null)

  const handleDelete = (f: Funcionario) => setParaExcluir(f)

  const handleAtivacao = (f: Funcionario) => {
    startTransition(async () => {
      try {
        await alternarAtivacao(f.id, fornecedorId, eventoId, !f.ativo)
        router.refresh()
      } catch (e) {
        setErroAtivacao(mensagemAmigavel(e))
      }
    })
  }

  const confirmarTirarDaEquipe = () => {
    if (!paraTirar) return
    const f = paraTirar
    startTransition(async () => {
      try {
        await descredenciarFuncionario(f.id, fornecedorId, eventoId)
        router.refresh()
        setParaTirar(null)
      } catch (e) {
        setErroAtivacao(mensagemAmigavel(e))
        setParaTirar(null)
      }
    })
  }

  const voltarParaEquipe = (f: Funcionario) => {
    startTransition(async () => {
      try {
        await recredenciarFuncionario(f.id, fornecedorId, eventoId)
        router.refresh()
      } catch (e) {
        setErroAtivacao(mensagemAmigavel(e))
      }
    })
  }

  const confirmarExclusao = () => {
    if (!paraExcluir) return
    const f = paraExcluir
    startTransition(async () => {
      await deletarFuncionario(f.id, fornecedorId, eventoId)
      router.refresh()
      setParaExcluir(null)
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {erroAtivacao && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border-b border-amber-200 px-4 py-2.5">
          <p className="text-amber-800 text-xs font-medium">{erroAtivacao}</p>
          <button onClick={() => setErroAtivacao(null)} className="text-amber-500 hover:text-amber-700 shrink-0">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {/* Filtros */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => updateSearch(e.target.value)}
              placeholder="Buscar por nome, CPF, empresa, cargo..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-8 py-2 text-slate-700 text-sm outline-none focus:border-brand-400 placeholder:text-slate-400"
            />
            {search && (
              <button onClick={() => updateSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Limpar busca">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <p className="text-slate-400 text-xs shrink-0 hidden sm:block">{filtered.length} de {funcionarios.length}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {([
            ['todos', 'Todos'],
            ['pendencias', 'Com pendências'],
            ['presentes', 'Presentes'],
            ['ausentes', 'Ausentes'],
            ['nao_ativados', 'Não ativados'],
          ] as [FiltroRapido, string][]).map(([value, label]) => (
            <button
              key={value}
              onClick={() => { setFiltroRapido(value); setPage(1) }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                filtroRapido === value ? 'bg-brand-500 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {label}
            </button>
          ))}

          <button
            onClick={() => setMaisFiltros(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ml-auto ${
              maisFiltros || filtrosAvancadosAtivos ? 'bg-brand-50 text-brand-600' : 'text-slate-500 hover:bg-slate-100'
            }`}
            aria-expanded={maisFiltros}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Por etapa
            {filtrosAvancadosAtivos > 0 && (
              <span className="w-4 h-4 flex items-center justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold">
                {filtrosAvancadosAtivos}
              </span>
            )}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${maisFiltros ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Filtro fino por etapa: separado dos atalhos de cima porque é usado
            bem menos e três selects de largura variável ao lado dos pills
            deixava a barra pesada em qualquer tela. */}
        {maisFiltros && (
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
            <SelectStatus label="Entrada" value={statusEntrada} onChange={v => { setStatusEntrada(v); setPage(1) }} />
            <SelectStatus label="Meio" value={statusMeio} onChange={v => { setStatusMeio(v); setPage(1) }} />
            <SelectStatus label="Saída" value={statusFim} onChange={v => { setStatusFim(v); setPage(1) }} />
            {filtrosAvancadosAtivos > 0 && (
              <button
                onClick={() => { setStatusEntrada('todos'); setStatusMeio('todos'); setStatusFim('todos'); setPage(1) }}
                className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2"
              >
                Limpar
              </button>
            )}
          </div>
        )}

        <p className="text-slate-400 text-xs sm:hidden">{filtered.length} de {funcionarios.length}</p>
      </div>

      {!filtered.length ? (
        <p className="text-center py-12 text-slate-400 text-sm">
          {search || filtroRapido !== 'todos' ? 'Nenhum resultado para o filtro' : 'Nenhum funcionário cadastrado ainda'}
        </p>
      ) : (
        <>
          {/* Celular: cartão por pessoa. A tabela tem 8 colunas — arrastar de
              lado pra ler é pior do que ler um cartão de cima pra baixo. */}
          <div className="md:hidden divide-y divide-slate-100">
            {paginated.map(f => (
              <div key={f.id} className="p-4 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <FuncionarioDetalheModal
                    funcionario={f}
                    fornecedorId={fornecedorId}
                    eventoId={eventoId}
                    eventoNome={eventoNome}
                    setorNome={setorNome}
                    valorCombinado={valorCombinado}
                    outrosSetores={outrosSetores}
                    podeMoverDeSetor={podeMoverDeSetor}
                    podeCriarSupervisor={podeCriarSupervisor}
                    podeEditarCpf={podeEditarCpf}
                    podeEditarPonto={podeEditarPonto}
                    role={role}
                    trigger={
                      <div className="flex items-center gap-2.5 min-w-0 text-left">
                        <Avatar url={f.fotoUrl} nome={f.nome} />
                        <div className="min-w-0">
                          <p className={`text-sm font-semibold truncate ${f.ativo ? 'text-slate-800' : 'text-slate-400'}`}>{f.nome}</p>
                          <p className="text-slate-400 text-xs truncate">{f.empresa}{f.cargo ? ` • ${f.cargo}` : ''}</p>
                        </div>
                      </div>
                    }
                  />
                  <div className="shrink-0 flex items-center gap-1 -mr-1">
                    <button
                      onClick={() => handleAtivacao(f)}
                      disabled={isPending}
                      className={`btn-press w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-50 disabled:active:scale-100 ${f.ativo ? 'text-green-500 hover:text-amber-600 hover:bg-amber-50' : 'text-amber-500 hover:text-green-600 hover:bg-green-50'}`}
                      aria-label={f.ativo ? 'Ativado — toque para desativar' : 'Não ativado — toque para ativar'}
                    >
                      {f.ativo ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                    </button>
                    {/*
                      * Tirar da equipe (descredenciar) — a ação que o
                      * supervisor tem. Reversível: descredenciado, o mesmo
                      * lugar oferece trazer de volta.
                      */}
                    {f.descredenciadoEm ? (
                      <button
                        onClick={() => voltarParaEquipe(f)}
                        disabled={isPending}
                        className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 disabled:opacity-50 disabled:active:scale-100"
                        aria-label={`Trazer ${f.nome} de volta para a equipe`}
                        title="Trazer de volta para a equipe"
                      >
                        <UserCheck className="w-4 h-4" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setParaTirar(f)}
                        disabled={isPending}
                        className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-50 disabled:active:scale-100"
                        aria-label={`Tirar ${f.nome} da equipe`}
                        title="Tirar da equipe"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                    {podeExcluir && (
                      <button
                        onClick={() => handleDelete(f)}
                        disabled={isPending}
                        className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 disabled:active:scale-100"
                        aria-label="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {f.descredenciadoEm && (
                    <span className="text-2xs font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">FORA DA EQUIPE</span>
                  )}
                  {!f.ativo && (
                    <span className="text-2xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">NÃO ATIVADO</span>
                  )}
                  <EtapaChip label="Entrada" p={f.entrada} status={f.statusEntrada} />
                  <EtapaChip label="Meio" p={f.meio} status={f.statusMeio} />
                  <EtapaChip label="Saída" p={f.fim} status={f.statusFim} />
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="tabular-nums">{f.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}</span>
                  {f.valorReceber > 0 && (
                    <span className="font-semibold tabular-nums text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-lg">
                      {brl(f.valorReceber)}
                    </span>
                  )}
                  {f.pago && (
                    <span className="text-2xs font-bold text-white bg-green-500 px-1.5 py-0.5 rounded-full shrink-0">PAGO</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Nome', 'CPF', 'Telefone', 'Valor a receber', 'Entrada', 'Meio', 'Fim', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginated.map(f => (
                <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <FuncionarioDetalheModal
                      funcionario={f}
                      fornecedorId={fornecedorId}
                      eventoId={eventoId}
                      eventoNome={eventoNome}
                      setorNome={setorNome}
                      valorCombinado={valorCombinado}
                      outrosSetores={outrosSetores}
                      podeMoverDeSetor={podeMoverDeSetor}
                      podeCriarSupervisor={podeCriarSupervisor}
                      podeEditarCpf={podeEditarCpf}
                      podeEditarPonto={podeEditarPonto}
                      role={role}
                      trigger={
                        <div className="flex items-center gap-2.5 hover:text-brand-600 transition-colors max-w-[15rem]">
                          <Avatar url={f.fotoUrl} nome={f.nome} />
                          <div className="min-w-0">
                            <p className={`text-sm font-semibold truncate ${f.ativo ? 'text-slate-800' : 'text-slate-400'}`}>{f.nome}</p>
                            <div className="flex items-center gap-1 min-w-0">
                              {!f.ativo && (
                                <span className="shrink-0 text-2xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">NÃO ATIVADO</span>
                              )}
                              <p className="text-slate-400 text-xs truncate">{f.empresa}{f.cargo ? ` • ${f.cargo}` : ''}</p>
                            </div>
                          </div>
                        </div>
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-sm font-mono tabular-nums whitespace-nowrap">
                    {f.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-sm tabular-nums whitespace-nowrap">
                    {f.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {f.valorReceber > 0 ? (
                        <span className="text-xs font-semibold tabular-nums text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg">
                          {brl(f.valorReceber)}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                      {f.pago && (
                        <span className="text-2xs font-bold text-white bg-green-500 px-1.5 py-0.5 rounded-full">PAGO</span>
                      )}
                    </div>
                  </td>
                  <CelulaPresenca p={f.entrada} status={f.statusEntrada} />
                  <CelulaPresenca p={f.meio} status={f.statusMeio} />
                  <CelulaPresenca p={f.fim} status={f.statusFim} />
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleAtivacao(f)}
                        disabled={isPending}
                        className={`btn-press w-8 h-8 flex items-center justify-center rounded-lg disabled:opacity-50 disabled:active:scale-100 ${f.ativo ? 'text-green-500 hover:text-amber-600 hover:bg-amber-50' : 'text-amber-500 hover:text-green-600 hover:bg-green-50'}`}
                        title={f.ativo ? 'Ativado — clique para desativar' : 'Não ativado — clique para ativar'}
                      >
                        {f.ativo ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                      </button>
                      {podeExcluir && (
                        <button
                          onClick={() => handleDelete(f)}
                          disabled={isPending}
                          className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 disabled:opacity-50 disabled:active:scale-100"
                          title="Remover"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <p className="text-slate-400 text-xs">Página {currentPage} de {totalPages}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:active:scale-100 disabled:hover:bg-transparent"
              aria-label="Página anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:active:scale-100 disabled:hover:bg-transparent"
              aria-label="Próxima página"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <ConfirmModal
        open={!!paraTirar}
        onClose={() => setParaTirar(null)}
        onConfirm={confirmarTirarDaEquipe}
        isPending={isPending}
        titulo="Tirar da equipe"
        mensagem={paraTirar
          ? `Tem certeza que deseja tirar "${paraTirar.nome}" da equipe deste setor? A pessoa sai das listas do evento e o QR dela deixa de ser aceito. O histórico de batidas dela não é apagado, e dá pra trazer de volta depois.`
          : ''}
      />

      <ConfirmModal
        open={!!paraExcluir}
        onClose={() => setParaExcluir(null)}
        onConfirm={confirmarExclusao}
        isPending={isPending}
        mensagem={paraExcluir ? `Remover "${paraExcluir.nome}"?` : ''}
      />
    </div>
  )
}

function SelectStatus({ label, value, onChange }: { label: string; value: StatusEtapa | 'todos'; onChange: (v: StatusEtapa | 'todos') => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as StatusEtapa | 'todos')}
      className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 outline-none focus:border-brand-400"
    >
      {OPCOES_STATUS.map(o => (
        <option key={o.value} value={o.value}>{label}: {o.label}</option>
      ))}
    </select>
  )
}

function Avatar({ url, nome }: { url: string | null; nome: string }) {
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={nome} className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0" />
  }
  return (
    <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
      <User className="w-4 h-4 text-slate-300" />
    </div>
  )
}

const SEMAFORO: Record<StatusEtapa, { dot: string; title: string }> = {
  feito: { dot: 'bg-green-500', title: 'Registrado' },
  aberto: { dot: 'bg-yellow-400', title: 'Dentro do prazo' },
  fechado: { dot: 'bg-red-500', title: 'Não registrado — prazo encerrado' },
  indefinido: { dot: 'bg-slate-300', title: 'Horário não definido' },
}

/** Versão em pílula do semáforo, pro cartão mobile — mesma informação da
    célula da tabela, sem foto/mapa (isso mora dentro do modal de detalhe). */
function EtapaChip({ label, p, status }: { label: string; p: Presenca; status: StatusEtapa }) {
  const sem = SEMAFORO[status]
  return (
    <span
      className="inline-flex items-center gap-1.5 text-2xs bg-slate-50 border border-slate-200 px-2 py-1 rounded-full"
      title={sem.title}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${sem.dot}`} />
      <span className="text-slate-500 font-medium">{label}</span>
      {p && <span className="text-green-600 font-semibold">{formatarBR(p.feitoEm, 'curto')}</span>}
      {p?.assistido && <ClipboardCheck className="w-3 h-3 text-amber-500 shrink-0" />}
    </span>
  )
}

function CelulaPresenca({ p, status }: { p: Presenca; status: StatusEtapa }) {
  const sem = SEMAFORO[status]
  if (!p) {
    return (
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1.5 text-slate-300 text-xs" title={sem.title}>
          <span className={`w-2 h-2 rounded-full shrink-0 ${sem.dot}`} />
          <Minus className="w-3.5 h-3.5" />
        </span>
      </td>
    )
  }
  return (
    <td className="px-4 py-3 whitespace-nowrap">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full shrink-0 ${sem.dot}`} title={sem.title} />
        <span className="text-green-600 text-xs font-semibold">{formatarBR(p.feitoEm, 'curto')}</span>
        {p.assistido && (
          <span
            className="shrink-0 text-amber-500"
            title={`Batida registrada por supervisor${p.registradoPor ? ` (${p.registradoPor})` : ''}`}
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
          </span>
        )}
        {p.fotoUrl && (
          <a href={p.fotoUrl} target="_blank" rel="noopener noreferrer" className="p-1 text-slate-400 hover:text-brand-500" title="Ver foto">
            <Camera className="w-3.5 h-3.5" />
          </a>
        )}
        {p.lat != null && p.lng != null && (
          <a
            href={`https://maps.google.com/?q=${p.lat},${p.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 text-slate-400 hover:text-brand-500"
            title={p.enderecoAproximado ?? 'Ver local'}
          >
            <MapPin className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </td>
  )
}
