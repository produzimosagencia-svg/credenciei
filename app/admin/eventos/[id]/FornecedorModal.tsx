'use client'
import { useState, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Pencil, Upload, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react'
import { criarFornecedor, editarFornecedor } from '@/lib/actions'
import * as XLSX from 'xlsx'

type Props =
  | { mode: 'criar'; eventoId: string }
  | { mode: 'editar'; eventoId: string; fornecedorId: string; nome: string; email: string; quantidade_estimada: number | null }

type ImportStatus = { ok: boolean; total?: number; error?: string } | null

export default function FornecedorModal(props: Props) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [importStatus, setImportStatus] = useState<ImportStatus>(null)
  const [importLoading, setImportLoading] = useState(false)
  const [fornecedorCriadoId, setFornecedorCriadoId] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const isEditar = props.mode === 'editar'
  const defaultNome = isEditar ? (props as any).nome : ''
  const defaultEmail = isEditar ? (props as any).email ?? '' : ''
  const defaultQtd = isEditar ? (props as any).quantidade_estimada ?? '' : ''

  const handleAction = (formData: FormData) => {
    startTransition(async () => {
      if (isEditar) {
        await editarFornecedor((props as any).fornecedorId, props.eventoId, formData)
        setOpen(false)
        router.refresh()
      } else {
        formData.append('evento_id', props.eventoId)
        const res = await fetch('/api/fornecedor/criar', {
          method: 'POST',
          body: formData,
        })
        if (res.ok) {
          const { id } = await res.json()
          setFornecedorCriadoId(id)
          router.refresh()
        } else {
          await criarFornecedor(props.eventoId, formData)
          setOpen(false)
          router.refresh()
        }
      }
    })
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !fornecedorCriadoId) return

    setImportLoading(true)
    setImportStatus(null)

    try {
      const buffer = await file.arrayBuffer()
      const wb = XLSX.read(buffer, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' })

      // Mapeia colunas com flexibilidade de maiúsculas/minúsculas
      const funcionarios = rows.map(row => {
        const get = (keys: string[]) => {
          for (const k of keys) {
            const found = Object.keys(row).find(rk => rk.toLowerCase().trim() === k.toLowerCase())
            if (found) return String(row[found]).trim()
          }
          return ''
        }
        return {
          nome: get(['nome', 'name', 'nome completo']),
          cpf: get(['cpf']),
          telefone: get(['telefone', 'phone', 'celular', 'tel']),
          email: get(['email', 'e-mail']),
          empresa: get(['empresa', 'company']),
          cargo: get(['cargo', 'função', 'funcao', 'role']),
        }
      }).filter(f => f.nome)

      if (funcionarios.length === 0) {
        setImportStatus({ ok: false, error: 'Nenhum funcionário válido encontrado na planilha.' })
        setImportLoading(false)
        return
      }

      const res = await fetch('/api/import/funcionarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fornecedorId: fornecedorCriadoId, funcionarios }),
      })

      const json = await res.json()
      if (res.ok) {
        setImportStatus({ ok: true, total: json.total })
        router.refresh()
      } else {
        setImportStatus({ ok: false, error: json.error })
      }
    } catch {
      setImportStatus({ ok: false, error: 'Erro ao ler o arquivo.' })
    }

    setImportLoading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleClose = () => {
    setOpen(false)
    setFornecedorCriadoId(null)
    setImportStatus(null)
  }

  const downloadModelo = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nome', 'CPF', 'Telefone', 'E-mail', 'Empresa', 'Cargo'],
      ['João Silva', '12345678901', '11999999999', 'joao@email.com', 'Empresa ABC', 'Técnico'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Funcionários')
    XLSX.writeFile(wb, 'modelo-importacao.xlsx')
  }

  return (
    <>
      {isEditar ? (
        <button onClick={() => setOpen(true)} className="p-1.5 text-slate-400 hover:text-slate-600 transition-colors" title="Editar fornecedor">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 text-sm bg-orange-500 hover:bg-orange-600 text-white px-3 py-2 rounded-xl transition-all font-semibold shadow-sm shadow-orange-200">
          <Plus className="w-3.5 h-3.5" />
          Novo Fornecedor
        </button>
      )}

      {open && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleClose}>
          <div className="bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-800 font-bold text-base">{isEditar ? 'Editar Fornecedor' : 'Novo Fornecedor'}</h3>
              <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Step 1: dados do fornecedor */}
            {!fornecedorCriadoId ? (
              <form action={handleAction} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Nome da empresa *</label>
                  <input name="nome" required defaultValue={defaultNome} placeholder="Ex: Segurança Total Ltda" className="input" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">E-mail de contato</label>
                  <input name="email_contato" type="email" defaultValue={defaultEmail} placeholder="contato@empresa.com" className="input" />
                </div>
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">
                    Quantidade estimada
                    <span className="text-slate-400 font-normal ml-1">(apenas referência)</span>
                  </label>
                  <input name="quantidade_estimada" type="number" min="1" defaultValue={defaultQtd} placeholder="Ex: 20" className="input" />
                </div>
                <button type="submit" disabled={isPending} className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-semibold transition-all shadow-md shadow-orange-200">
                  {isPending ? 'Salvando...' : (isEditar ? 'Salvar alterações' : 'Cadastrar fornecedor →')}
                </button>
              </form>
            ) : (
              /* Step 2: importar planilha */
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
                  <p className="text-green-700 text-sm font-medium">Fornecedor criado! Agora importe os funcionários.</p>
                </div>

                {/* Área de upload */}
                <div
                  className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-orange-300 hover:bg-orange-50 transition-all cursor-pointer"
                  onClick={() => fileRef.current?.click()}
                >
                  <FileSpreadsheet className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-slate-600 text-sm font-medium">Clique para selecionar a planilha</p>
                  <p className="text-slate-400 text-xs mt-1">.xlsx ou .csv</p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleImport}
                  />
                </div>

                {importLoading && (
                  <div className="flex items-center justify-center gap-2 py-2">
                    <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-slate-500 text-sm">Importando funcionários...</span>
                  </div>
                )}

                {importStatus && (
                  <div className={`flex items-start gap-2 p-3 rounded-xl border ${importStatus.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    {importStatus.ok
                      ? <CheckCircle className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                      : <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    }
                    <p className={`text-sm font-medium ${importStatus.ok ? 'text-green-700' : 'text-red-600'}`}>
                      {importStatus.ok
                        ? `${importStatus.total} funcionário${importStatus.total !== 1 ? 's' : ''} importado${importStatus.total !== 1 ? 's' : ''} com sucesso!`
                        : importStatus.error
                      }
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={downloadModelo}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-all font-medium"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Baixar modelo
                  </button>
                  <button
                    onClick={handleClose}
                    className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-semibold transition-all"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
