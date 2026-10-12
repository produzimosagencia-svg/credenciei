import { FileText } from 'lucide-react'

/**
 * "PDF de entrega de valor do sistema" — botão grande, laranja, no topo dos Relatórios (pedido do Juan,
 * 09/10/2026). Desde 12/10/2026 no padrão novo dos relatórios (docs/modelo de relatorio .pdf): abre numa aba, com
 * "Baixar PDF" (app/relatorios-pdf/[eventoId]/entrega-valor).
 */
export default function BotaoEntregaValor({ eventoId }: { eventoId: string }) {
  return (
    <a
      href={`/relatorios-pdf/${encodeURIComponent(eventoId)}/entrega-valor`}
      target="_blank"
      rel="noopener"
      className="btn btn-primario w-full justify-center py-4 text-base font-bold rounded-2xl shadow-lg shadow-brand-500/25"
    >
      <FileText className="w-5 h-5 shrink-0" />
      PDF de entrega de valor do sistema
    </a>
  )
}
