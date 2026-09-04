import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Megaphone, CalendarDays } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarEventos } from '@/lib/permissions'
import { PageHeader } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'
import PainelDeAvisos, { eventoVisivel } from '../eventos/[id]/avisos/PainelDeAvisos'

export const revalidate = 0

/**
 * Avisos, pelo menu — sem precisar lembrar em qual evento a pessoa está.
 *
 * Pede o evento primeiro, porque um aviso é sempre DE um evento: os
 * destinatários ("Setores", "Pessoa específica") só existem dentro de um.
 * Escolhido o evento, mostra exatamente a mesma tela de
 * `/admin/eventos/[id]/avisos` — é o mesmo `PainelDeAvisos`.
 *
 * Master vê todos os eventos; admin só os da própria organização. A régua
 * vale nos DOIS pontos: na lista (`eventosQuePossoAbrir`) e na abertura por
 * `?evento=` (`eventoVisivel`) — a lista só esconde, quem barra é a segunda.
 */
export default async function AvisosPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarEventos(perfil)) redirect('/admin')

  const { evento: eventoParam } = await searchParams

  if (eventoParam) {
    const evento = await eventoVisivel(eventoParam, perfil, veTodosEventos(perfil))
    return (
      <div className="space-y-5">
        <PageHeader
          titulo="Avisos"
          descricao={`${evento.nome} — comunicados na credencial e no painel do supervisor`}
          acoes={
            <Link href="/admin/avisos" className="btn btn-secundario">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
            </Link>
          }
        />
        <PainelDeAvisos eventoId={eventoParam} />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <PageHeader titulo="Avisos" descricao="Escolha o evento para o qual quer mandar um comunicado" />
      <EscolherEvento
        eventos={await eventosQuePossoAbrir()}
        href={id => `/admin/avisos?evento=${id}`}
        icone={<Megaphone className="w-3.5 h-3.5" />}
        titulo="Para qual evento?"
        descricao="O aviso aparece na credencial da equipe e no painel do supervisor daquele evento"
        vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para poder mandar avisos à equipe dele.' }}
        mostrarOrganizacao={veTodosEventos(perfil)}
      />
    </div>
  )
}
