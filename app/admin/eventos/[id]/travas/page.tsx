import { redirect } from 'next/navigation'
import { obterRelatorioTravas } from '@/lib/actions'
import { PageHeader } from '@/components/ui/Superficie'
import RelatorioTravasView from './RelatorioTravasView'

export const revalidate = 0

/**
 * "Quais setores não estão com a trava de pessoas por dia" — pedido do Juan, 08/10/2026, depois de eu levantar
 * isso manualmente num script: "qual caminho pra eu extrair isso?". Mesmo padrão de `relatorios/page.tsx`: a
 * tela fica fina, quem faz o trabalho pesado é `obterRelatorioTravas`/`relatorioTravasPorDia`.
 */
export default async function TravasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventoId } = await params
  const r = await obterRelatorioTravas(eventoId)
  if (!r.ok) redirect(`/admin/eventos/${eventoId}`)

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Limite de pessoas por dia"
        descricao={`${r.eventoNome} — limite de cada setor em cada dia (vazio = livre). Edite e salve direto aqui.`}
        voltarPara={`/admin/eventos/${eventoId}`}
      />
      <RelatorioTravasView eventoId={eventoId} relatorio={r.relatorio} eventoNome={r.eventoNome} />
    </div>
  )
}
