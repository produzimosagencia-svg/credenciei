import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ShieldAlert, CalendarDays } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeGerenciarEventos, veTodosEventos } from '@/lib/permissions'
import { obterRelatorioTravas } from '@/lib/actions'
import { PageHeader } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'
import RelatorioTravasView from '../eventos/[id]/travas/RelatorioTravasView'

export const revalidate = 0

/**
 * Limite de pessoas por dia, pelo menu — mesmo padrão de `/admin/relatorios`: escolhe o evento primeiro, e a
 * partir daí é a mesma tela de `/admin/eventos/[id]/travas`.
 *
 * Só quem gerencia eventos (admin/master/gerente da organização) — é visão de TODOS os fornecedores do evento,
 * não cabe pro supervisor (que só vê o próprio setor em todo o resto do sistema).
 */
export default async function TravasPorMenuPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarEventos(perfil)) redirect('/admin')

  const { evento: eventoParam } = await searchParams

  if (eventoParam) {
    const r = await obterRelatorioTravas(eventoParam)
    if (!r.ok) redirect('/admin/travas')
    return (
      <div className="space-y-5">
        <PageHeader
          titulo="Limite de pessoas por dia"
          descricao={`${r.eventoNome} — quais setores têm trava configurada em cada dia, e quantos já estão aprovados`}
          acoes={
            <Link href="/admin/travas" className="btn btn-secundario">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
            </Link>
          }
        />
        <RelatorioTravasView relatorio={r.relatorio} />
      </div>
    )
  }

  const eventos = await eventosQuePossoAbrir()

  return (
    <div className="space-y-5">
      <PageHeader titulo="Limite de pessoas por dia" descricao="Escolha o evento" />
      <EscolherEvento
        eventos={eventos}
        href={id => `/admin/travas?evento=${id}`}
        icone={<ShieldAlert className="w-3.5 h-3.5" />}
        titulo="De qual evento?"
        descricao="Quais setores estão sem trava, com trava parcial ou com trava completa por dia"
        vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para ver o relatório dele.' }}
        mostrarOrganizacao={veTodosEventos(perfil)}
      />
    </div>
  )
}
