import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FileSpreadsheet, CalendarDays } from 'lucide-react'
import { getPerfil, meusSetores } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarEventos } from '@/lib/permissions'
import { obterResumoParaTelaDeRelatorios } from '@/lib/relatorios'
import { PageHeader } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir, eventosDosMeusSetores } from '../EscolherEvento'
import ExportarRelatorio from '../eventos/[id]/relatorios/ExportarRelatorio'
import OutrosRelatorios from '../eventos/[id]/relatorios/OutrosRelatorios'
import BotaoEntregaValor from '../eventos/[id]/relatorios/BotaoEntregaValor'

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
          descricao={`${resumo.eventoNome} — entrada e saída da equipe, por fornecedor e função`}
          acoes={
            <Link href="/admin/relatorios" className="btn btn-secundario">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
            </Link>
          }
        />
        {/* O PDF de entrega de valor — só para quem gerencia o evento inteiro (pedido do Juan, 09/10/2026). */}
        {resumo.eventoInteiro && <BotaoEntregaValor eventoId={eventoParam} />}
        <ExportarRelatorio
          eventoId={eventoParam}
          periodoCompleto={resumo.periodoCompleto}
          setores={resumo.setores}
          totalFuncionarios={resumo.totalFuncionarios}
        />
        <OutrosRelatorios eventoId={eventoParam} eventoInteiro={resumo.eventoInteiro} />
      </div>
    )
  }

  /*
   * Quem não é supervisor/admin/master/suporte mas tem um vínculo de
   * supervisor (achado ao vivo, 05/10/2026, caso da Mara Lúcia) vê a lista
   * ESTRITA dos próprios setores — `eventosQuePossoAbrir` daria o escopo
   * largo da organização dela, que não é o dela de verdade pra relatórios.
   */
  const meusVinculos = await meusSetores(perfil)
  const eventos = (podeGerenciarEventos(perfil) || perfil.role === 'supervisor' || perfil.role === 'suporte' || !meusVinculos.length)
    ? await eventosQuePossoAbrir()
    : await eventosDosMeusSetores(meusVinculos)
  if (!eventos.length && !veTodosEventos(perfil) && perfil.role !== 'supervisor') redirect('/admin')

  return (
    <div className="space-y-5">
      <PageHeader titulo="Relatórios" descricao="Escolha o evento do qual quer exportar a planilha" />
      <EscolherEvento
        eventos={eventos}
        href={id => `/admin/relatorios?evento=${id}`}
        icone={<FileSpreadsheet className="w-3.5 h-3.5" />}
        titulo="De qual evento?"
        descricao="Entrada e saída da equipe no período que você escolher, por fornecedor e função"
        vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para poder exportar o relatório dele.' }}
        mostrarOrganizacao={veTodosEventos(perfil)}
      />
    </div>
  )
}
