'use client'
import { useState } from 'react'
import { FileDown, AlertCircle } from 'lucide-react'
import { exportarFuncionariosDoSetor } from '@/lib/actions'
import { exportarPlanilhaDeEquipe } from '@/lib/planilha'
import { mensagemAmigavel } from '@/lib/erros'

export default function ExportarEquipe({ fornecedorId, eventoId }: { fornecedorId: string; eventoId: string }) {
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const exportar = async () => {
    setLoading(true)
    setErro(null)
    try {
      const { setorNome, eventoNome, funcionarios } = await exportarFuncionariosDoSetor(fornecedorId, eventoId)
      if (!funcionarios.length) {
        setErro('Este setor ainda não tem ninguém cadastrado.')
        return
      }
      await exportarPlanilhaDeEquipe(eventoNome, setorNome, funcionarios)
    } catch (e: any) {
      setErro(mensagemAmigavel(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button onClick={exportar} disabled={loading} className="btn btn-secundario btn-sm">
        {loading
          ? <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-transparent rounded-full animate-spin shrink-0" />
          : <FileDown className="w-3.5 h-3.5 shrink-0" />
        }
        {loading ? 'Gerando...' : 'Exportar planilha'}
      </button>
      {erro && (
        <p className="flex items-center gap-1 text-red-500 text-2xs">
          <AlertCircle className="w-3 h-3 shrink-0" /> {erro}
        </p>
      )}
    </div>
  )
}
