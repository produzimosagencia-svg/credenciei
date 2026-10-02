import { redirect } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { eventosQuePossoAbrir } from '../EscolherEvento'
import { PageHeader, Secao, EmptyState } from '@/components/ui/Superficie'
import EscolherMeuEvento from './EscolherMeuEvento'

export const revalidate = 0

/**
 * "Meus eventos" — pedido do Juan, 02/10/2026: o supervisor trabalha em mais
 * de um evento ao longo do tempo (ex.: Pontal Weekend ontem, Stoked agora), e
 * entrar direto no último setor ativo escondia isso — testando o acesso
 * antes do Stoked abrir, ele caía sem perceber dentro do Pontal, se o evento
 * antigo ainda estivesse no sistema. Esta tela separa EVENTOS ATUAIS (acesso
 * ativo) de EVENTOS PASSADOS (encerrados, mas sem apagar o histórico) e pede
 * a escolha explicitamente, toda vez.
 *
 * Os dados vêm de `eventosQuePossoAbrir` (já existente, usado por Avisos e
 * Relatórios) — pra este perfil ela já devolve só os eventos onde o
 * supervisor tem (ou teve) um fornecedor, com o `ativo` do evento junto. Zero
 * consulta nova: só esta tela + a escolha (`EscolherMeuEvento`) são novas.
 */
export default async function MeusEventosPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (perfil.role !== 'supervisor') redirect('/admin')

  const eventos = await eventosQuePossoAbrir()
  const atuais = eventos.filter(e => e.ativo)
  const passados = eventos.filter(e => !e.ativo)

  return (
    <div className="space-y-5">
      <PageHeader titulo="Meus eventos" descricao="Escolha o evento que você quer acessar agora." />

      {!eventos.length && (
        <Secao tom="acento" icone={<CalendarDays className="w-4 h-4" />} titulo="Meus eventos">
          <EmptyState
            icone={<CalendarDays className="w-6 h-6" />}
            titulo="Nenhum evento ainda"
            descricao="Você ainda não foi vinculado a um fornecedor em nenhum evento. Fale com quem administra sua organização."
          />
        </Secao>
      )}

      {!!atuais.length && (
        <Secao
          tom="acento"
          icone={<CalendarDays className="w-4 h-4" />}
          titulo="Eventos atuais"
          descricao="Onde você tem acesso ativo agora."
          corpoClassName=""
        >
          <EscolherMeuEvento eventos={atuais} />
        </Secao>
      )}

      {!!passados.length && (
        <Secao
          icone={<CalendarDays className="w-4 h-4" />}
          titulo="Eventos passados"
          descricao="Eventos encerrados em que você já trabalhou — ainda dá pra abrir e consultar."
          corpoClassName=""
        >
          <EscolherMeuEvento eventos={passados} />
        </Secao>
      )}
    </div>
  )
}
