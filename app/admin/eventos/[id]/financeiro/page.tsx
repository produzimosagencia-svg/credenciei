import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Wallet, Receipt, TrendingUp, TrendingDown } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { financeiroDoEvento } from '@/lib/financeiro'
import { PageHeader, Secao } from '@/components/ui/Superficie'
import StatCard from '@/components/StatCard'
import PainelFaturamento from './PainelFaturamento'
import PainelCustos from './PainelCustos'

export const revalidate = 0

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * O financeiro DESTE evento — faturamento, custos, lucro. Exclusivo do
 * master (ver o porquê da isolação em supabase/upgrade-financeiro.sql).
 *
 * Faturamento → Custos → Lucro, na ordem que o Juan pediu (09/09/2026): o
 * cartão de faturamento no topo, os custos logo abaixo (com o botão "+
 * Adicionar custo"), e o lucro já calculado nos KPIs — nunca guardado,
 * sempre `faturamento - custoTotal` na hora (ver `financeiroDoEvento`).
 */
export default async function FinanceiroDoEventoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!ehMaster(perfil.role)) redirect('/admin')

  const { id } = await params
  const dados = await financeiroDoEvento(id)
  if (!dados) notFound()

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Financeiro do evento"
        descricao={dados.eventoNome}
        acoes={
          <Link href={`/admin/eventos/${id}`} className="btn btn-secundario">
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" /> Voltar pro evento
          </Link>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Receita" value={brl(dados.faturamento)} icon={Wallet} tom="acento" />
        <StatCard
          label="Despesas" value={brl(dados.custoTotal)}
          sub={`${dados.custos.length} lançamento${dados.custos.length === 1 ? '' : 's'}`}
          icon={Receipt} tom="aviso"
        />
        <StatCard
          label="Lucro" value={brl(dados.lucro)}
          sub={dados.margem !== null ? `${dados.margem.toFixed(1)}% de margem` : 'sem receita lançada'}
          icon={dados.lucro >= 0 ? TrendingUp : TrendingDown}
          tom={dados.lucro >= 0 ? 'sucesso' : 'erro'}
        />
      </div>

      <Secao tom="acento" icone={<Wallet className="w-3.5 h-3.5" />} titulo="Receita" descricao="O que foi cobrado do cliente neste evento, e a NFe" corpoClassName="p-5">
        <PainelFaturamento eventoId={id} faturamento={dados.faturamento} temNfe={dados.temNfe} nfeNome={dados.nfeNome} />
      </Secao>

      <Secao icone={<Receipt className="w-3.5 h-3.5" />} titulo="Despesas" descricao="Cada gasto deste evento, por categoria" corpoClassName="p-4">
        <PainelCustos eventoId={id} custos={dados.custos} />
      </Secao>
    </div>
  )
}
