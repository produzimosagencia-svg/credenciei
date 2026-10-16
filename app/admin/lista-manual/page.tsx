import { notFound, redirect } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import { getPerfil, eventosAcontecendoHoje } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarListaManual, podeConferirListaManual } from '@/lib/permissions'
import { acessoAListaManual, pessoasDaListaManual, contagensDaListaManual } from '@/lib/lista-manual'
import { categoriasParaEscolher } from '@/lib/lista-manual-regras'
import { PageHeader, Aviso } from '@/components/ui/Superficie'
import AutoRefresh from '@/components/performance/AutoRefresh'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'
import PainelListaManual from './PainelListaManual'

export const revalidate = 0

/**
 * LISTA MANUAL — entrada sem QR Code (Juan, 16/10/2026): convidados, prestadores de serviço, equipe interna. Quem
 * gerencia (master/admin) cadastra antes; na portaria a pessoa mostra o documento, o operador acha pelo nome ou CPF e
 * confirma a entrada. Pede o evento primeiro, como Veículos: cada evento tem a sua lista.
 *
 * Independente do credenciamento com QR (funcionários, scanner, registros) — nada daqui passa por lá.
 * Regras de acesso em lib/lista-manual.ts; ações em lib/actions-lista-manual.ts.
 */
export default async function ListaManualPage({ searchParams }: { searchParams: Promise<{ evento?: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarListaManual(perfil) && !podeConferirListaManual(perfil)) redirect('/admin')

  const { evento: eventoParam } = await searchParams

  if (!eventoParam) {
    const eventos = await eventosQuePossoAbrir()
    return (
      <div className="space-y-5">
        <PageHeader titulo="Lista manual" descricao="Entrada sem QR Code — convidados, prestadores e equipe que entram mostrando o documento" />
        <EscolherEvento
          eventos={eventos}
          href={id => `/admin/lista-manual?evento=${id}`}
          icone={<ListChecks className="w-3.5 h-3.5" />}
          titulo="De qual evento?"
          descricao="Cada evento tem a sua lista: estar na lista de um não libera a entrada em outro"
          vazio={{ titulo: 'Nenhum evento disponível', descricao: 'A lista manual é sempre de um evento — crie ou peça acesso a um evento antes.' }}
          mostrarOrganizacao={veTodosEventos(perfil)}
          contagens={await contagensDaListaManual(eventos.map(e => e.id))}
        />
      </div>
    )
  }

  const acesso = await acessoAListaManual(eventoParam)
  if ('erro' in acesso) notFound()

  const [{ pessoas, migracaoPendente }, hoje] = await Promise.all([
    pessoasDaListaManual(eventoParam, acesso.podeGerenciar),
    eventosAcontecendoHoje([eventoParam]),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Lista manual"
        descricao={`${acesso.evento.nome} — entrada sem QR Code: a pessoa mostra o documento e a portaria confirma`}
        voltarPara={perfil.role === 'operador_portao' ? `/admin/bem-vindo?evento=${eventoParam}` : '/admin/lista-manual'}
      />
      {migracaoPendente ? (
        <Aviso tom="atencao">
          A lista manual ainda não está ligada no banco: falta rodar <strong>supabase/upgrade-lista-manual.sql</strong> no SQL Editor do Supabase.
        </Aviso>
      ) : (
        <>
          {/* Outro operador confirmou uma entrada? Aparece aqui sozinho, sem recarregar. */}
          <AutoRefresh segundos={15} />
          <PainelListaManual
            eventoId={eventoParam}
            pessoas={pessoas}
            podeGerenciar={acesso.podeGerenciar}
            podeConfirmar={acesso.podeConfirmar}
            acontecendoHoje={hoje.has(eventoParam)}
            categorias={categoriasParaEscolher(pessoas.map(p => p.categoria))}
          />
        </>
      )}
    </div>
  )
}
