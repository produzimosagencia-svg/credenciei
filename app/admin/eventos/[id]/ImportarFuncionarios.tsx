'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, CheckCircle, AlertCircle, Download, Sparkles } from 'lucide-react'
import { LoadingOverlay } from '@/components/LoadingOverlay'
import { lerPlanilhaDeEquipe } from '@/lib/planilha'
// xlsx é pesado e só é usado no download do modelo aqui (a leitura mora em
// lib/planilha) — carregado sob demanda pra não engordar o bundle da página.

type Status = { ok: boolean; total?: number; invalidos?: number; duplicados?: number; reaproveitados?: number; error?: string } | null

export default function ImportarFuncionarios({ fornecedorId }: { fornecedorId: string }) {
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    setStatus(null)

    try {
      const funcionarios = await lerPlanilhaDeEquipe(file)

      if (funcionarios.length === 0) {
        setStatus({ ok: false, error: 'Nenhum funcionário encontrado. Verifique se a planilha tem as colunas corretas.' })
        setLoading(false)
        return
      }

      const res = await fetch('/api/import/funcionarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fornecedorId, funcionarios }),
      })

      const json = await res.json()
      if (res.ok) {
        setStatus({ ok: true, total: json.total, invalidos: json.invalidos, duplicados: json.duplicados, reaproveitados: json.reaproveitados })
        router.refresh()
      } else {
        setStatus({ ok: false, error: json.error ?? 'Erro ao importar.' })
      }
    } catch {
      setStatus({ ok: false, error: 'Erro ao ler o arquivo.' })
    }

    setLoading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="flex flex-col gap-2">
      {loading && <LoadingOverlay mensagem="Importando funcionários..." />}
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="btn btn-secundario btn-sm"
        >
          {loading
            ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin shrink-0" />
            : <Upload className="w-3.5 h-3.5 shrink-0" />
          }
          {loading ? 'Importando...' : 'Importar planilha'}
        </button>
        <a
          href="/modelo-importacao.xlsx"
          download="modelo-importacao.xlsx"
          className="btn btn-secundario btn-sm"
        >
          <Download className="w-3.5 h-3.5 shrink-0" />
          Baixar modelo
        </a>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
      </div>

      {status && (
        <div className="space-y-1">
          <div className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${status.ok ? 'text-green-600' : 'text-red-500'}`}>
            {status.ok
              ? <><CheckCircle className="w-3 h-3 shrink-0" /> {status.total} funcionário{status.total !== 1 ? 's' : ''} importado{status.total !== 1 ? 's' : ''}!</>
              : <><AlertCircle className="w-3 h-3 shrink-0" /> {status.error}</>
            }
          </div>
          {status.ok && !!status.invalidos && (
            <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg text-amber-600">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {status.invalidos} linha{status.invalidos !== 1 ? 's' : ''} com CPF inválido {status.invalidos !== 1 ? 'foram ignoradas' : 'foi ignorada'}. Corrija na planilha e importe de novo.
            </div>
          )}
          {status.ok && !!status.reaproveitados && (
            <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg text-brand-600">
              <Sparkles className="w-3 h-3 shrink-0" />
              {status.reaproveitados} já {status.reaproveitados !== 1 ? 'estavam' : 'estava'} na nossa base — completamos telefone, cargo e PIX que faltavam na planilha.
            </div>
          )}
          {status.ok && !!status.duplicados && (
            <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg text-amber-600">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {status.duplicados} CPF{status.duplicados !== 1 ? 's' : ''} já cadastrado{status.duplicados !== 1 ? 's' : ''} neste evento {status.duplicados !== 1 ? 'foram ignorados' : 'foi ignorado'} (sem duplicar ninguém).
            </div>
          )}
        </div>
      )}
    </div>
  )
}
