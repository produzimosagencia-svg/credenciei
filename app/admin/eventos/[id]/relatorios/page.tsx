import { redirect } from 'next/navigation'
import { getPerfil } from '@/lib/supabase-server'
import { obterResumoParaTelaDeRelatorios } from '@/lib/relatorios'
import { PageHeader } from '@/components/ui/Superficie'
import ExportarRelatorio from './ExportarRelatorio'
import OutrosRelatorios from './OutrosRelatorios'
import BotaoEntregaValor from './BotaoEntregaValor'

export const revalidate = 0

/**
 * Relatórios do evento — a tela de exportação pós-evento.
 *
 * Fina de propósito: quem faz o trabalho pesado é `lib/relatorios.ts`
 * (busca e permissão) e `lib/relatorio-excel.ts` (monta e baixa o .xlsx no
 * navegador). Esta página só decide o que mostrar — os cartões de "relatório
 * completo" e "relatório por setor" ficam em `ExportarRelatorio`, porque
 * baixar arquivo é coisa de cliente.
 *
 * A checagem de acesso mora em `obterResumoParaTelaDeRelatorios` (que chama
 * `exigirAcessoAoEvento`) — a mesma régua que protege a geração da planilha
 * em si, não uma segunda checagem que poderia divergir da primeira.
 */
export default async function RelatoriosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventoId } = await params
  const [perfil, resumo] = await Promise.all([getPerfil(), obterResumoParaTelaDeRelatorios(eventoId)])
  if ('erro' in resumo) redirect('/admin')

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Relatórios do evento"
        descricao={`${resumo.eventoNome} — entrada e saída da equipe, por fornecedor e função`}
        /*
         * Supervisor não pode abrir `/admin/eventos/${eventoId}` (vira loop
         * — ver o mesmo ajuste em aprovacoes/page.tsx e fornecedor/[fid]
         * /page.tsx, 02/10/2026). `resumo.setores` já vem filtrado pro
         * supervisor (só os dele neste evento), então o primeiro É o setor
         * de onde ele veio.
         */
        voltarPara={
          perfil?.role === 'supervisor'
            ? (resumo.setores[0] ? `/admin/eventos/${eventoId}/fornecedor/${resumo.setores[0].id}` : '/admin/meus-eventos')
            : `/admin/eventos/${eventoId}`
        }
      />
      {/* O PDF de entrega de valor — só para quem gerencia o evento inteiro (pedido do Juan, 09/10/2026). */}
      {resumo.eventoInteiro && <BotaoEntregaValor eventoId={eventoId} />}
      <ExportarRelatorio
        eventoId={eventoId}
        periodoCompleto={resumo.periodoCompleto}
        setores={resumo.setores}
        totalFuncionarios={resumo.totalFuncionarios}
      />
      <OutrosRelatorios eventoId={eventoId} eventoInteiro={resumo.eventoInteiro} />
    </div>
  )
}
