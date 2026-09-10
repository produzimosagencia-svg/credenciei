import Link from 'next/link'
import { redirect } from 'next/navigation'
import {
  ArrowLeft, Wallet, Hash, TrendingUp, Divide, CalendarClock, CalendarRange, CalendarDays,
  Layers, BarChart3, Users, LineChart, PieChart,
} from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeRegistrarGastos } from '@/lib/permissions'
import { eventosParaGastos, listarGastos, kpisDeGastos, dadosDosGraficos } from '@/lib/gastos'
import { brl } from '@/lib/gastos-constantes'
import { diaBRT } from '@/lib/janelas'
import StatCard from '@/components/StatCard'
import { Secao } from '@/components/ui/Superficie'
import {
  GastosPorCategoria, GastosPorDia, GastosPorFornecedor, EvolucaoAcumulada, DistribuicaoPercentual,
} from '@/components/gastos/graficos'

export const revalidate = 0

/**
 * O dashboard completo: os 7 KPIs do pedido + os 5 gráficos. Recorte por
 * evento (e, opcionalmente, período) na URL — o mesmo padrão da lista.
 */
export default async function PainelGastosPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string; de?: string; ate?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeRegistrarGastos(perfil)) redirect('/admin')

  const p = await searchParams
  const eventos = await eventosParaGastos()
  if (!eventos.length) redirect('/gastos')
  const eventoAtual = eventos.find(e => e.id === p.evento) ?? eventos.find(e => e.ativo) ?? eventos[0]

  const gastos = await listarGastos({ eventoId: eventoAtual.id, de: p.de || undefined, ate: p.ate || undefined })
  const kpis = kpisDeGastos(gastos, diaBRT())
  const g = dadosDosGraficos(gastos)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link href={`/gastos?evento=${eventoAtual.id}`} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-sm">
          <ArrowLeft className="w-4 h-4" /> Registrar
        </Link>
        <Link href={`/gastos/lista?evento=${eventoAtual.id}`} className="text-brand-600 hover:underline text-sm">Lista e filtros</Link>
      </div>

      <div>
        <h1 className="text-slate-900 font-bold text-lg">Gastos · {eventoAtual.nome}</h1>
        <p className="text-slate-500 text-sm">{gastos.length} {gastos.length === 1 ? 'lançamento' : 'lançamentos'}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total gasto" value={brl(kpis.total)} icon={Wallet} tom="acento" />
        <StatCard label="Quantidade" value={kpis.quantidade} icon={Hash} tom="neutro" small />
        <StatCard label="Maior gasto" value={brl(kpis.maior)} icon={TrendingUp} tom="aviso" small />
        <StatCard label="Gasto médio" value={brl(kpis.medio)} icon={Divide} tom="neutro" small />
        <StatCard label="Gastos de hoje" value={brl(kpis.hoje)} icon={CalendarClock} tom="info" small />
        <StatCard label="Últimos 7 dias" value={brl(kpis.ultimos7)} icon={CalendarRange} tom="info" small />
        <StatCard label="No mês" value={brl(kpis.mes)} icon={CalendarDays} tom="info" small />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Secao icone={<Layers className="w-3.5 h-3.5" />} titulo="Gastos por categoria" corpoClassName="p-4">
          <GastosPorCategoria dados={g.porCategoria} />
        </Secao>
        <Secao icone={<PieChart className="w-3.5 h-3.5" />} titulo="Distribuição percentual" corpoClassName="p-4">
          <DistribuicaoPercentual dados={g.distribuicao} />
        </Secao>
        <Secao icone={<BarChart3 className="w-3.5 h-3.5" />} titulo="Gastos por dia" corpoClassName="p-4">
          <GastosPorDia dados={g.porDia} />
        </Secao>
        <Secao icone={<Users className="w-3.5 h-3.5" />} titulo="Gastos por fornecedor" corpoClassName="p-4">
          <GastosPorFornecedor dados={g.porFornecedor} />
        </Secao>
        <Secao icone={<LineChart className="w-3.5 h-3.5" />} titulo="Evolução acumulada" descricao="Soma corrida por data do gasto" corpoClassName="p-4" className="lg:col-span-2">
          <EvolucaoAcumulada dados={g.acumulado} />
        </Secao>
      </div>
    </div>
  )
}
