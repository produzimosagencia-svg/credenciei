import { redirect } from 'next/navigation'
import Link from 'next/link'
import { MapPin, CalendarDays } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeGerenciarEventos, veTodosEventos } from '@/lib/permissions'
import { obterRelatorioForaDoLocal } from '@/lib/actions'
import { PageHeader } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'
import RelatorioForaDoLocalView from '../eventos/[id]/fora-do-local/RelatorioForaDoLocalView'

export const revalidate = 0

/** Batidas fora do local, pelo menu — escolhe o evento primeiro (mesmo padrão de `/admin/travas`). Só gestor de eventos. */
export default async function ForaDoLocalPorMenuPage({ searchParams }: { searchParams: Promise<{ evento?: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarEventos(perfil)) redirect('/admin')

  const { evento: eventoParam } = await searchParams
  if (eventoParam) {
    const r = await obterRelatorioForaDoLocal(eventoParam)
    if (!r.ok) redirect('/admin/fora-do-local')
    return (
      <div className="space-y-5">
        <PageHeader
          titulo="Batidas fora do local"
          descricao={`${r.eventoNome} — quem bateu (ou tentou bater) fora do raio do local do evento`}
          acoes={<Link href="/admin/fora-do-local" className="btn btn-secundario"><CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento</Link>}
        />
        <RelatorioForaDoLocalView relatorio={r.relatorio} eventoNome={r.eventoNome} />
      </div>
    )
  }

  const eventos = await eventosQuePossoAbrir()
  return (
    <div className="space-y-5">
      <PageHeader titulo="Batidas fora do local" descricao="Escolha o evento" />
      <EscolherEvento
        eventos={eventos}
        href={id => `/admin/fora-do-local?evento=${id}`}
        icone={<MapPin className="w-3.5 h-3.5" />}
        titulo="De qual evento?"
        descricao="Quem bateu ou tentou bater o ponto fora do raio do local do evento"
        vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para ver o relatório dele.' }}
        mostrarOrganizacao={veTodosEventos(perfil)}
      />
    </div>
  )
}
