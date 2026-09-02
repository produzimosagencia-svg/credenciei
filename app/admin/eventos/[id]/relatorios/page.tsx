import { redirect } from 'next/navigation'
import { obterResumoParaTelaDeRelatorios } from '@/lib/relatorios'
import { PageHeader } from '@/components/ui/Superficie'
import ExportarRelatorio from './ExportarRelatorio'

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
  const resumo = await obterResumoParaTelaDeRelatorios(eventoId)
  if ('erro' in resumo) redirect('/admin')

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Relatórios do evento"
        descricao={`${resumo.eventoNome} — planilha completa da operação de credenciamento e presença`}
      />
      <ExportarRelatorio
        eventoId={eventoId}
        dataInicioISO={resumo.dataInicioISO}
        dataFimISO={resumo.dataFimISO}
        setores={resumo.setores}
        totalFuncionarios={resumo.totalFuncionarios}
      />
    </div>
  )
}
