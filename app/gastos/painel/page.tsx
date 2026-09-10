import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, Wallet, Hash, Layers, TrendingUp, CalendarRange } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeRegistrarGastos } from '@/lib/permissions'
import { eventosParaGastos, listarGastos, dadosDosGraficos, totaisPorEvento } from '@/lib/gastos'
import { brl } from '@/lib/gastos-constantes'
import StatCard from '@/components/StatCard'
import { Secao } from '@/components/ui/Superficie'
import SeletorEvento from '../SeletorEvento'
import { GastosPorCategoria, EvolucaoGastos } from '@/components/gastos/graficos'

export const revalidate = 0

/**
 * Dashboard enxuto (pedido do Juan): só o que o Produtor precisa pra
 * acompanhar — Total, Quantidade, Maior categoria, Total por evento e a
 * Evolução (linha). Sem os 7 KPIs e 5 gráficos que poluíam.
 *
 * Recorte por evento no seletor; período opcional na URL (`?de`/`?ate`), que
 * a lista/filtros mandam pra cá.
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

  const [gastos, porEvento] = await Promise.all([
    listarGastos({ eventoId: eventoAtual.id, de: p.de || undefined, ate: p.ate || undefined }),
    totaisPorEvento(eventos),
  ])
  const g = dadosDosGraficos(gastos)
  const total = gastos.reduce((s, x) => s + x.valor, 0)
  const maiorCategoria = g.porCategoria[0] ?? null
  const temPeriodo = !!(p.de || p.ate)

  return (
    <div className="space-y-5">
      {/* Navegação — no desktop os 3 caminhos ficam numa linha só. */}
      <div className="flex items-center justify-between gap-3">
        <Link href={`/gastos?evento=${eventoAtual.id}`} className="flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-sm">
          <ArrowLeft className="w-4 h-4" /> Registrar
        </Link>
        <Link href={`/gastos/lista?evento=${eventoAtual.id}`} className="text-brand-600 hover:underline text-sm">Lista e filtros</Link>
      </div>

      <SeletorEvento eventos={eventos} atual={eventoAtual.id} />

      <div>
        <h1 className="text-slate-900 font-bold text-lg md:text-xl">{eventoAtual.nome}</h1>
        <p className="text-slate-500 text-sm">
          {gastos.length} {gastos.length === 1 ? 'lançamento' : 'lançamentos'}
          {temPeriodo && ' · período filtrado'}
        </p>
      </div>

      {/* KPIs — 3 no mobile empilham 1/linha; no desktop lado a lado. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Total gasto" value={brl(total)} icon={Wallet} tom="acento" />
        <StatCard label="Quantidade de gastos" value={gastos.length} icon={Hash} tom="neutro" />
        <StatCard
          label="Maior categoria"
          value={maiorCategoria ? maiorCategoria.categoria : '—'}
          sub={maiorCategoria ? brl(maiorCategoria.total) : undefined}
          icon={Layers}
          tom="aviso"
          small
        />
      </div>

      {/* Desktop: evolução (2/3) + total por evento (1/3) lado a lado. */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Secao
          icone={<TrendingUp className="w-3.5 h-3.5" />}
          titulo="Evolução dos gastos"
          descricao="Total por dia no período"
          corpoClassName="p-4"
          className="lg:col-span-2"
        >
          <EvolucaoGastos dados={g.porDia} />
        </Secao>

        <Secao icone={<CalendarRange className="w-3.5 h-3.5" />} titulo="Total por evento" corpoClassName="p-0">
          {!porEvento.length ? (
            <p className="p-6 text-center text-sm text-slate-400">Sem gastos ainda.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {porEvento.map(e => (
                <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className={`text-sm truncate ${e.id === eventoAtual.id ? 'font-semibold text-slate-900' : 'text-slate-600'}`}>{e.nome}</span>
                  <span className="text-sm tabular-nums text-slate-700 shrink-0">{brl(e.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </div>

      <Secao icone={<Layers className="w-3.5 h-3.5" />} titulo="Gastos por categoria" corpoClassName="p-4">
        <GastosPorCategoria dados={g.porCategoria} />
      </Secao>
    </div>
  )
}
