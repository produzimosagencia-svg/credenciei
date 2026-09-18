'use client'
import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { LogoLoading } from '@/components/LogoLoading'
import type { Gasto } from '@/lib/gastos'
import { ROTULO_ORIGEM, ROTULO_STATUS } from '@/lib/gastos-constantes'
import { exportarGastosXlsx } from '@/lib/actions-gastos'

/**
 * Exporta os gastos DO RECORTE ATUAL (o filtro na URL).
 *
 * - .xlsx: montado no SERVIDOR com a identidade do Credenciei (faixa laranja,
 *   cabeçalho laranja, valores em R$, linha de TOTAL, bloco do evento + data).
 *   Ver `exportarGastosXlsx` em lib/actions-gastos.ts. Volta em base64.
 * - .csv: continua no cliente, direto da lista já carregada — é texto puro,
 *   não precisa de servidor.
 */
export default function ExportarGastos({ gastos, eventoId }: { gastos: Gasto[]; eventoId: string }) {
  const [ocupado, setOcupado] = useState<null | 'xlsx' | 'csv'>(null)
  const [erro, setErro] = useState<string | null>(null)
  const params = useSearchParams()

  const baixarBlob = (conteudo: BlobPart, tipo: string, nome: string) => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
    a.download = nome
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const baixarXlsx = async () => {
    setErro(null)
    setOcupado('xlsx')
    try {
      const pagoParam = params.get('pago')
      const r = await exportarGastosXlsx({
        eventoId,
        categoria: params.get('categoria') || undefined,
        fornecedor: params.get('fornecedor') || undefined,
        pago: pagoParam === 'true' || pagoParam === 'false' ? pagoParam : undefined,
        de: params.get('de') || undefined,
        ate: params.get('ate') || undefined,
      })
      if (!r.ok) { setErro(r.erro); return }
      const bin = Uint8Array.from(atob(r.base64), c => c.charCodeAt(0))
      baixarBlob(bin, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', r.nome)
    } finally {
      setOcupado(null)
    }
  }

  const baixarCsv = () => {
    if (!gastos.length) return
    setOcupado('csv')
    try {
      const esc = (v: unknown) => {
        const s = String(v ?? '')
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
      }
      const cab = ['Evento', 'Data do gasto', 'Data do registro', 'Horário', 'Descrição', 'Fornecedor', 'Categoria', 'Forma de pagamento', 'Pagador', 'Valor', 'Forma de registro', 'Status', 'Pago?', 'Observação']
      const linhas = gastos.map(g => [
        g.eventoNome ?? '',
        dataBr(g.dataGasto),
        new Date(g.registradoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        new Date(g.registradoEm).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }),
        g.descricao, g.fornecedor ?? '', g.categoria, g.formaPagamento ?? '', g.pagador ?? '',
        String(g.valor).replace('.', ','), ROTULO_ORIGEM[g.origem], ROTULO_STATUS[g.status], g.pago ? 'Pago' : 'A pagar', g.observacao ?? '',
      ].map(esc).join(';'))
      baixarBlob('﻿' + [cab.join(';'), ...linhas].join('\r\n'), 'text/csv;charset=utf-8', `gastos-${new Date().toISOString().slice(0, 10)}.csv`)
    } finally {
      setOcupado(null)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={baixarXlsx} disabled={!!ocupado || !gastos.length} className="btn btn-secundario btn-sm disabled:opacity-50">
        {ocupado === 'xlsx' ? <LogoLoading tamanho={14} /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
        Excel
      </button>
      <button onClick={baixarCsv} disabled={!!ocupado || !gastos.length} className="btn btn-secundario btn-sm disabled:opacity-50">
        {ocupado === 'csv' ? <LogoLoading tamanho={14} /> : <FileText className="w-3.5 h-3.5" />}
        CSV
      </button>
      <span className="hidden sm:flex items-center gap-1 text-slate-400 text-2xs">
        <Download className="w-3 h-3" /> {gastos.length} {gastos.length === 1 ? 'gasto' : 'gastos'}
      </span>
      {erro && <span className="text-red-500 text-2xs">{erro}</span>}
    </div>
  )
}

function dataBr(iso: string) {
  return `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}
