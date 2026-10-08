'use client'
import { useState, useTransition } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { LogoLoading } from '@/components/LogoLoading'
import { obterDadosRelatorioSubevento } from '@/lib/relatorios'
import { gerarRelatorioSubevento } from '@/lib/relatorio-excel'
import { mensagemAmigavel } from '@/lib/erros'

/**
 * "Extrair relatório do subevento" — a planilha completa do subevento inteiro (Resumo Geral, quem falta
 * aprovar, equipe, batidas, supervisores e uma aba por fornecedor). Antes só dava para puxar setor por
 * setor (pedido do Juan, 08/10/2026). Busca os dados e monta o arquivo no clique.
 */
export default function ExportarSubevento({ eventoId, subeventoId }: { eventoId: string; subeventoId: string }) {
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, iniciar] = useTransition()

  const exportar = () => {
    setErro(null)
    iniciar(async () => {
      try {
        const r = await obterDadosRelatorioSubevento(eventoId, subeventoId)
        if ('erro' in r) { setErro(r.erro); return }
        await gerarRelatorioSubevento(r.dados)
      } catch (e) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={exportar} disabled={gerando} className="btn btn-secundario" title="Planilha com todos os fornecedores, supervisores, quem está autorizado e quem falta aprovar">
        {gerando ? <LogoLoading tamanho={14} /> : <FileSpreadsheet className="w-4 h-4 shrink-0" />}
        {gerando ? 'Gerando…' : 'Extrair relatório do subevento'}
      </button>
      {erro && <p role="alert" className="text-red-500 text-xs max-w-xs text-right">{erro}</p>}
    </div>
  )
}
