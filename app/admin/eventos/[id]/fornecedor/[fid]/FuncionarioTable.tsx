'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Search, Trash2, X, Camera, MapPin, Minus } from 'lucide-react'
import { deletarFuncionario } from '@/lib/actions'
import { formatarBR } from '@/lib/tz'

const PAGE_SIZE = 25

export type Presenca = {
  feitoEm: string
  fotoUrl: string | null
  lat: number | null
  lng: number | null
} | null

type Funcionario = {
  id: string
  nome: string
  cpf: string
  telefone: string
  empresa: string
  cargo: string
  qr_token: string
  entrada: Presenca
  meio: Presenca
  fim: Presenca
}

export default function FuncionarioTable({
  funcionarios,
  fornecedorId,
  eventoId,
}: {
  funcionarios: Funcionario[]
  fornecedorId: string
  eventoId: string
}) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const filtered = useMemo(() => funcionarios.filter(f => {
    const s = search.toLowerCase()
    return s === '' ||
      f.nome.toLowerCase().includes(s) ||
      f.cpf.includes(search) ||
      f.empresa.toLowerCase().includes(s) ||
      f.cargo.toLowerCase().includes(s)
  }), [funcionarios, search])

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
      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => updateSearch(e.target.value)}
            placeholder="Buscar por nome, CPF, empresa..."
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

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Nome', 'CPF', 'Telefone', 'Entrada', 'Meio', 'Fim', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                  {search ? 'Nenhum resultado para a busca' : 'Nenhum funcionário cadastrado ainda'}
                </td>
              </tr>
            ) : (
              paginated.map(f => (
                <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-slate-800 text-sm font-semibold">{f.nome}</p>
                    <p className="text-slate-400 text-xs">{f.empresa}{f.cargo ? ` • ${f.cargo}` : ''}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-sm font-mono whitespace-nowrap">
                    {f.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-sm whitespace-nowrap">
                    {f.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}
                  </td>
                  <CelulaPresenca p={f.entrada} />
                  <CelulaPresenca p={f.meio} />
                  <CelulaPresenca p={f.fim} />
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

function CelulaPresenca({ p }: { p: Presenca }) {
  if (!p) {
    return (
      <td className="px-4 py-3">
        <span className="inline-flex items-center gap-1 text-slate-300 text-xs"><Minus className="w-3.5 h-3.5" /></span>
      </td>
    )
  }
  return (
    <td className="px-4 py-3 whitespace-nowrap">
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
    </td>
  )
}
