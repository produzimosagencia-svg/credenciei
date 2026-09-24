import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ClipboardCheck } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { eventosComPendentesDeAprovacao } from '@/lib/actions'
import { PageHeader, Secao, EmptyState, Badge } from '@/components/ui/Superficie'

export const revalidate = 0

/**
 * Ponte entre o menu (da PLATAFORMA inteira) e a tela de decisão (de UM
 * evento, `/admin/eventos/[id]/aprovacoes`) — pedido do Juan, 24/09/2026:
 * item "Aguardando aprovação" no menu, com o número de pendentes do lado.
 *
 * Só um evento com pendente → cai direto nele, sem escala a mais. Mais de
 * um → escolhe, cada card já com a contagem (mesmo padrão de EscolherEvento).
 */
export default async function AprovacoesPontePage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const eventos = await eventosComPendentesDeAprovacao()

  if (eventos.length === 1) redirect(`/admin/eventos/${eventos[0].id}/aprovacoes`)

  return (
    <div className="space-y-5">
      <PageHeader titulo="Aguardando aprovação" descricao="Escolha o evento para ver quem está esperando" />
      <Secao tom="acento" icone={<ClipboardCheck className="w-3.5 h-3.5" />} titulo="Eventos com pendência" corpoClassName={eventos.length ? 'p-0' : 'p-4'}>
        {!eventos.length ? (
          <EmptyState
            icone={<ClipboardCheck className="w-7 h-7" />}
            titulo="Nada pendente agora"
            descricao="Quando alguém se cadastrar e precisar de aprovação, aparece aqui."
          />
        ) : (
          <div className="divide-y divide-slate-50">
            {eventos.map(e => (
              <Link key={e.id} href={`/admin/eventos/${e.id}/aprovacoes`} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50 transition-colors">
                <p className="text-slate-800 font-medium text-sm">{e.nome}</p>
                <Badge tom="atencao">{e.pendentes} pendente{e.pendentes === 1 ? '' : 's'}</Badge>
              </Link>
            ))}
          </div>
        )}
      </Secao>
    </div>
  )
}
