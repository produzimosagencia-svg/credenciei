'use client'
import Link from 'next/link'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, Trash2, Users, ExternalLink } from 'lucide-react'
import { deletarFornecedor } from '@/lib/actions'
import FornecedorModal from './FornecedorModal'
import ImportarFuncionarios from './ImportarFuncionarios'

type Fornecedor = {
  id: string
  nome: string
  token_formulario: string
  quantidade_estimada: number | null
  valor_combinado: number | null
  funcionarios: { count: number }[]
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function FornecedorCard({ fornecedor: f, eventoId }: { fornecedor: Fornecedor; eventoId: string }) {
  const [copied, setCopied] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const count = f.funcionarios?.[0]?.count ?? 0
  const estimado = f.quantidade_estimada ?? 0
  const pct = estimado > 0 ? Math.min(100, Math.round((count / estimado) * 100)) : null
  const valor = f.valor_combinado ?? null

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/form/${f.token_formulario}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDelete = () => {
    if (!confirm(`Excluir "${f.nome}" e todos os funcionários cadastrados?`)) return
    startTransition(async () => {
      await deletarFornecedor(f.id, eventoId)
      router.refresh()
    })
  }

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl p-4 shadow-sm transition-opacity ${isPending ? 'opacity-50' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-slate-800 font-semibold">{f.nome}</p>

          <div className="mt-2 space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Users className="w-3 h-3 text-slate-400" />
                <span className="text-slate-500 text-xs">
                  {count} cadastrado{count !== 1 ? 's' : ''}
                  {estimado > 0 && <span className="text-slate-300"> / {estimado} estimado{estimado !== 1 ? 's' : ''}</span>}
                </span>
              </div>
              {pct !== null && (
                <span className={`text-xs font-semibold ${pct >= 100 ? 'text-green-600' : pct >= 60 ? 'text-yellow-600' : 'text-slate-400'}`}>
                  {pct}%
                </span>
              )}
            </div>
            {pct !== null && (
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div
                  className={`h-1.5 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-brand-400'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
            {valor !== null && (
              <p className="text-slate-500 text-xs">
                {brl(valor)} / funcionário
                {count > 0 && <span className="text-slate-400"> • total {brl(valor * count)}</span>}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <FornecedorModal
            mode="editar"
            eventoId={eventoId}
            fornecedorId={f.id}
            nome={f.nome}
            quantidade_estimada={f.quantidade_estimada}
            valor_combinado={f.valor_combinado}
          />
          <button onClick={handleDelete} disabled={isPending} className="p-1.5 text-slate-300 hover:text-red-500 transition-colors disabled:opacity-50">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
        <div className="flex items-center gap-2">
          <button onClick={copyLink} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors font-medium">
            {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copiado!' : 'Link do formulário'}
          </button>
          <Link
            href={`/admin/eventos/${eventoId}/fornecedor/${f.id}`}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors font-medium"
          >
            <ExternalLink className="w-3 h-3" />
            Ver funcionários
          </Link>
        </div>
        <ImportarFuncionarios fornecedorId={f.id} />
      </div>
    </div>
  )
}
