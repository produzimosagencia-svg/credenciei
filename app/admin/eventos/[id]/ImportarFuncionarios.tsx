'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, CheckCircle, AlertCircle, Download } from 'lucide-react'
// xlsx é pesado e só é usado nestes dois handlers (importar/baixar modelo) —
// carregado sob demanda para não engordar o bundle inicial da página do evento.

type Status = { ok: boolean; total?: number; invalidos?: number; error?: string } | null

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
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' })

      const get = (row: Record<string, any>, keys: string[]) => {
        for (const k of keys) {
          const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase())
          if (found) return String(row[found]).trim()
        }
        return ''
      }

      const funcionarios = rows.map(row => ({
        nome: get(row, ['nome', 'name', 'nome completo']),
        cpf: get(row, ['cpf']),
        telefone: get(row, ['telefone', 'phone', 'celular', 'tel']),
        chavePix: get(row, ['chave pix', 'chave_pix', 'pix']),
        empresa: get(row, ['empresa/setor', 'empresa', 'setor', 'company', 'equipe']),
        cargo: get(row, ['cargo', 'função', 'funcao', 'role']),
        valor: get(row, ['valor', 'valor a receber', 'valor_receber']),
      })).filter(f => f.nome)

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
        setStatus({ ok: true, total: json.total, invalidos: json.invalidos })
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
      <div className="flex items-center gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 rounded-lg transition-colors font-medium disabled:opacity-50"
        >
          {loading
            ? <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            : <Upload className="w-3 h-3" />
          }
          {loading ? 'Importando...' : 'Importar planilha'}
        </button>
        <a
          href="/modelo-importacao.xlsx"
          download="modelo-importacao.xlsx"
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 rounded-lg transition-colors font-medium"
        >
          <Download className="w-3 h-3" />
          Modelo
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
        </div>
      )}
    </div>
  )
}
