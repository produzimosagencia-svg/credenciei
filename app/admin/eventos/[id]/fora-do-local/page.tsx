import { redirect } from 'next/navigation'
import { obterRelatorioForaDoLocal } from '@/lib/actions'
import { PageHeader } from '@/components/ui/Superficie'
import RelatorioForaDoLocalView from './RelatorioForaDoLocalView'

export const revalidate = 0

/** Batidas fora do local do evento — pedido do Juan, 08/10/2026. Mesmo padrão de `travas/page.tsx`. */
export default async function ForaDoLocalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventoId } = await params
  const r = await obterRelatorioForaDoLocal(eventoId)
  if (!r.ok) redirect('/admin/fora-do-local')
  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Batidas fora do local"
        descricao={`${r.eventoNome} — quem bateu (ou tentou bater) fora do raio do local do evento`}
        // Supervisor não abre a tela do evento (vira loop) — volta pra escolha do evento.
        voltarPara={r.eventoInteiro ? `/admin/eventos/${eventoId}` : '/admin/fora-do-local'}
      />
      <RelatorioForaDoLocalView relatorio={r.relatorio} eventoNome={r.eventoNome} eventoInteiro={r.eventoInteiro} />
    </div>
  )
}
