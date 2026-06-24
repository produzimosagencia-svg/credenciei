'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, Trash2, QrCode, X } from 'lucide-react'
import { format } from 'date-fns'
import { deletarFuncionario } from '@/lib/actions'

type Funcionario = {
  id: string
  nome: string
  cpf: string
  email: string
  telefone: string
  empresa: string
  cargo: string
  qr_token: string
  status: 'dentro' | 'saiu' | 'ausente'
  ultimo_registro: string | null
}

const STATUS_LABELS = { dentro: 'Dentro', saiu: 'Saiu', ausente: 'Ausente' }
const STATUS_COLORS = {
  dentro: 'bg-green-100 text-green-700',
  saiu: 'bg-orange-100 text-orange-600',
  ausente: 'bg-slate-100 text-slate-400',
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
  const [filterStatus, setFilterStatus] = useState<string>('todos')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const filtered = funcionarios.filter(f => {
    const matchSearch = search === '' ||
      f.nome.toLowerCase().includes(search.toLowerCase()) ||
      f.cpf.includes(search) ||
      f.cargo.toLowerCase().includes(search.toLowerCase()) ||
      f.empresa.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'todos' || f.status === filterStatus
    return matchSearch && matchStatus
  })

  const handleDelete = (f: Funcionario) => {
    if (!confirm(`Remover "${f.nome}" do credenciamento?`)) return
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
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF, cargo..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-slate-700 text-sm outline-none focus:border-orange-400 placeholder:text-slate-400"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          {['todos', 'dentro', 'saiu', 'ausente'].map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`text-xs px-3 py-1.5 rounded-xl transition-all capitalize font-medium ${
                filterStatus === s
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {s === 'todos' ? 'Todos' : STATUS_LABELS[s as keyof typeof STATUS_LABELS]}
            </button>
          ))}
        </div>
        <p className="text-slate-400 text-xs ml-auto">{filtered.length} de {funcionarios.length}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {['Nome', 'CPF', 'Telefone', 'Cargo', 'Status', 'Último registro', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!filtered.length ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-slate-400 text-sm">
                  {search || filterStatus !== 'todos' ? 'Nenhum resultado para os filtros aplicados' : 'Nenhum funcionário cadastrado ainda'}
                </td>
              </tr>
            ) : (
              filtered.map(f => (
                <tr key={f.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="text-slate-800 text-sm font-semibold">{f.nome}</p>
                    <p className="text-slate-400 text-xs">{f.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-sm font-mono whitespace-nowrap">
                    {f.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-sm whitespace-nowrap">
                    {f.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-sm">{f.cargo}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${STATUS_COLORS[f.status]}`}>
                      {STATUS_LABELS[f.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs whitespace-nowrap">
                    {f.ultimo_registro ? format(new Date(f.ultimo_registro), "dd/MM HH:mm") : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/credential/${f.qr_token}`}
                        target="_blank"
                        className="p-1.5 text-slate-400 hover:text-orange-500 transition-colors"
                        title="Ver credencial"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        onClick={() => handleDelete(f)}
                        disabled={isPending}
                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        title="Remover"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
