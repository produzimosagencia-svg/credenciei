import { FileText } from 'lucide-react'

/**
 * "PDF de entrega de valor do sistema" — botão grande, laranja, no topo dos Relatórios (pedido do Juan,
 * 09/10/2026). O PDF é montado no servidor (app/api/relatorios/entrega-valor) e baixa direto.
 */
export default function BotaoEntregaValor({ eventoId }: { eventoId: string }) {
  return (
    <a
      href={`/api/relatorios/entrega-valor?evento=${encodeURIComponent(eventoId)}`}
      className="btn btn-primario w-full justify-center py-4 text-base font-bold rounded-2xl shadow-lg shadow-brand-500/25"
    >
      <FileText className="w-5 h-5 shrink-0" />
      PDF de entrega de valor do sistema
    </a>
  )
}
