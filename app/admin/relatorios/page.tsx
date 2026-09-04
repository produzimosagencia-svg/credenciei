import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileSpreadsheet, CalendarDays } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { veTodosEventos } from '@/lib/permissions'
import { obterResumoParaTelaDeRelatorios } from '@/lib/relatorios'
import { PageHeader } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'
import ExportarRelatorio from '../eventos/[id]/relatorios/ExportarRelatorio'

export const revalidate = 0

/**
 * Relatórios, pelo menu — mesmo padrão de `/admin/avisos`: escolhe o evento
 * primeiro, e a partir daí é a mesma tela de
 * `/admin/eventos/[id]/relatorios`, com o mesmo `ExportarRelatorio`.
 *
 * A checagem de acesso NÃO é duplicada aqui de propósito: quem decide é
 * `obterResumoParaTelaDeRelatorios` (que chama `exigirAcessoAoEvento`), a
 * MESMA função que protege a geração da planilha em si. Uma segunda régua
 * escrita aqui poderia divergir dela — e divergir pro lado permissivo é como
 * um admin acaba baixando a equipe de outro cliente.
 *
 * Por isso o supervisor também aparece: `exigirAcessoAoEvento` já permite
 * que ele gere o relatório do próprio setor, e ele já tinha esse botão
 * dentro da tela da equipe dele.
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const { evento: eventoParam } = await searchParams

  if (eventoParam) {
    const resumo = await obterResumoParaTelaDeRelatorios(eventoParam)
    if ('erro' in resumo) redirect('/admin/relatorios')
    return (
      <div className="space-y-5">
        <PageHeader
          titulo="Relatórios do evento"
          descricao={`${resumo.eventoNome} — entrada e saída da equipe, por setor e função`}
          acoes={
            <Link href="/admin/relatorios" className="btn btn-secundario">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
            </Link>
          }
        />
        <ExportarRelatorio
          eventoId={eventoParam}
          periodoCompleto={resumo.periodoCompleto}
          setores={resumo.setores}
          totalFuncionarios={resumo.totalFuncionarios}
        />
      </div>
    )
  }

  const eventos = await eventosQuePossoAbrir()
  if (!eventos.length && !veTodosEventos(perfil) && perfil.role !== 'supervisor') redirect('/admin')

  return (
    <div className="space-y-5">
      <PageHeader titulo="Relatórios" descricao="Escolha o evento do qual quer exportar a planilha" />
      <EscolherEvento
        eventos={eventos}
        href={id => `/admin/relatorios?evento=${id}`}
        icone={<FileSpreadsheet className="w-3.5 h-3.5" />}
        titulo="De qual evento?"
        descricao="Entrada e saída da equipe no período que você escolher, por setor e função"
        vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para poder exportar o relatório dele.' }}
        mostrarOrganizacao={veTodosEventos(perfil)}
      />
    </div>
  )
}
