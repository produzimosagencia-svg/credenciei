'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search, Trash2, X, Camera, MapPin, Minus, User } from 'lucide-react'
import { deletarFuncionario } from '@/lib/actions'
import { formatarBR } from '@/lib/tz'
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
  fotoUrl: string | null
  entrada: Presenca
  meio: Presenca
  fim: Presenca
  statusEntrada: StatusEtapa
  statusMeio: StatusEtapa
  statusFim: StatusEtapa
}

type FiltroRapido = 'todos' | 'pendencias' | 'presentes' | 'ausentes'

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
  valorCombinado,
}: {
  funcionarios: Funcionario[]
  fornecedorId: string
  eventoId: string
  valorCombinado: number | null
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [filtroRapido, setFiltroRapido] = useState<FiltroRapido>('todos')
  const [statusEntrada, setStatusEntrada] = useState<StatusEtapa | 'todos'>('todos')
  const [statusMeio, setStatusMeio] = useState<StatusEtapa | 'todos'>('todos')
  const [statusFim, setStatusFim] = useState<StatusEtapa | 'todos'>('todos')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

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

    return true
  }), [funcionarios, search, filtroRapido, statusEntrada, statusMeio, statusFim])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  const updateSearch = (value: string) => { setSearch(value); setPage(1) }

  const handleDelete = (f: Funcionario) => {
    if (!confirm(`Remover "${f.nome}"?`)) return
    startTransition(async () => {
      await deletarFuncionario(f.id, fornecedorId, eventoId)
      router.refresh()
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
      {/* Filtros */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              value={search}
              onChange={e => updateSearch(e.target.value)}
              placeholder="Buscar por nome, CPF, empresa, cargo..."
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-slate-700 text-sm outline-none focus:border-brand-400 placeholder:text-slate-400"
            />
            {search && (
              <button onClick={() => updateSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <p className="text-slate-400 text-xs ml-auto">{filtered.length} de {funcionarios.length}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {([
            ['todos', 'Todos'],
            ['pendencias', 'Com pendências'],
            ['presentes', 'Presentes'],
            ['ausentes', 'Ausentes'],
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

          <div className="w-px h-5 bg-slate-200 mx-1" />

          <SelectStatus label="Entrada" value={statusEntrada} onChange={v => { setStatusEntrada(v); setPage(1) }} />
          <SelectStatus label="Meio" value={statusMeio} onChange={v => { setStatusMeio(v); setPage(1) }} />
          <SelectStatus label="Saída" value={statusFim} onChange={v => { setStatusFim(v); setPage(1) }} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Nome', 'CPF', 'Telefone', 'Valor a receber', 'Entrada', 'Meio', 'Fim', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400 text-sm">
                  {search || filtroRapido !== 'todos' ? 'Nenhum resultado para o filtro' : 'Nenhum funcionário cadastrado ainda'}
                </td>
              </tr>
            ) : (
              paginated.map(f => (
                <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <FuncionarioDetalheModal
                      funcionario={f}
                      fornecedorId={fornecedorId}
                      eventoId={eventoId}
                      valorCombinado={valorCombinado}
                      trigger={
                        <div className="flex items-center gap-2.5 hover:text-brand-600 transition-colors">
                          <Avatar url={f.fotoUrl} nome={f.nome} />
                          <div className="min-w-0">
                            <p className="text-slate-800 text-sm font-semibold truncate">{f.nome}</p>
                            <p className="text-slate-400 text-xs truncate">{f.empresa}{f.cargo ? ` • ${f.cargo}` : ''}</p>
                          </div>
                        </div>
                      }
                    />
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-sm font-mono whitespace-nowrap">
                    {f.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-sm whitespace-nowrap">
                    {f.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      {f.valorReceber > 0 ? (
                        <span className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-2 py-1 rounded-lg">
                          {brl(f.valorReceber)}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                      {f.pago && (
                        <span className="text-[10px] font-bold text-white bg-green-500 px-1.5 py-0.5 rounded-full">PAGO</span>
                      )}
                    </div>
                  </td>
                  <CelulaPresenca p={f.entrada} status={f.statusEntrada} />
                  <CelulaPresenca p={f.meio} status={f.statusMeio} />
                  <CelulaPresenca p={f.fim} status={f.statusFim} />
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleDelete(f)}
                      disabled={isPending}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                      title="Remover"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <p className="text-slate-400 text-xs">Página {currentPage} de {totalPages}</p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              aria-label="Página anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
              aria-label="Próxima página"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
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
