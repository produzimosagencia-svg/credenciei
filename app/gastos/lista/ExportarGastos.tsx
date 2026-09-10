'use client'
import { useState } from 'react'
import { Download, Loader2, FileSpreadsheet, FileText } from 'lucide-react'
import type { Gasto } from '@/lib/gastos'
import { ROTULO_ORIGEM, ROTULO_STATUS } from '@/lib/gastos-constantes'

/**
 * Exporta os gastos DO RECORTE ATUAL (o que está na tela, já filtrado) pra
 * .xlsx ou .csv. Colunas do pedido: evento, data do gasto, data do registro,
 * horário, descrição, fornecedor, categoria, valor, observação.
 *
 * `xlsx` entra por import dinâmico — é pesado e só serve a este clique, mesmo
 * padrão de `lib/planilha.ts`.
 */
export default function ExportarGastos({ gastos }: { gastos: Gasto[] }) {
  const [ocupado, setOcupado] = useState<null | 'xlsx' | 'csv'>(null)

  const linhas = () => gastos.map(g => ({
    Evento: g.eventoNome ?? '',
    'Data do gasto': dataBr(g.dataGasto),
    'Data do registro': new Date(g.registradoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
    Horário: new Date(g.registradoEm).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }),
    Descrição: g.descricao,
    Fornecedor: g.fornecedor ?? '',
    Categoria: g.categoria,
    Valor: g.valor,
    'Forma de registro': ROTULO_ORIGEM[g.origem],
    Status: ROTULO_STATUS[g.status],
    Observação: g.observacao ?? '',
  }))

  const baixar = async (formato: 'xlsx' | 'csv') => {
    if (!gastos.length) return
    setOcupado(formato)
    try {
      const XLSX = await import('xlsx')
      const ws = XLSX.utils.json_to_sheet(linhas())
      ws['!cols'] = [{ wch: 24 }, { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 30 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 30 }]
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Gastos')
      const nome = `gastos-${new Date().toISOString().slice(0, 10)}.${formato}`
      XLSX.writeFile(wb, nome, { bookType: formato })
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => baixar('xlsx')} disabled={!!ocupado || !gastos.length} className="btn btn-secundario btn-sm disabled:opacity-50">
        {ocupado === 'xlsx' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
        Excel
      </button>
      <button onClick={() => baixar('csv')} disabled={!!ocupado || !gastos.length} className="btn btn-secundario btn-sm disabled:opacity-50">
        {ocupado === 'csv' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
        CSV
      </button>
      <span className="hidden sm:flex items-center gap-1 text-slate-400 text-2xs">
        <Download className="w-3 h-3" /> {gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'}
      </span>
    </div>
  )
}

function dataBr(iso: string) {
  return `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}
