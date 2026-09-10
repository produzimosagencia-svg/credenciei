import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Database, Wallet, CalendarClock, Hash, ArrowRight, ListChecks, PieChart } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeRegistrarGastos } from '@/lib/permissions'
import { eventosParaGastos, listarGastos, kpisDeGastos } from '@/lib/gastos'
import { brl } from '@/lib/gastos-constantes'
import { diaBRT } from '@/lib/janelas'
import GravadorDeGasto from './GravadorDeGasto'
import FormGastoManual from './FormGastoManual'
import SeletorEvento from './SeletorEvento'

export const revalidate = 0

/**
 * A tela de captura — o coração do módulo. Escolhe o evento, aperta o botão,
 * fala, confirma. Abaixo, três números do evento e os últimos lançamentos,
 * com os atalhos pra lista completa e o painel.
 */
export default async function GastosPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeRegistrarGastos(perfil)) redirect('/admin')

  const { evento: eventoParam } = await searchParams

  let eventos
  try {
    eventos = await eventosParaGastos()
  } catch (e) {
    return <BancoPendente detalhe={e instanceof Error ? e.message : String(e)} />
  }

  if (!eventos.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center space-y-2">
        <CalendarClock className="w-7 h-7 text-slate-300 mx-auto" />
        <p className="text-slate-700 font-semibold">Nenhum evento disponível</p>
        <p className="text-slate-500 text-sm">Você precisa de um evento pra registrar gastos. Crie um no painel.</p>
        <Link href="/admin" className="btn btn-secundario btn-sm mt-2 inline-flex">Ir pro painel</Link>
      </div>
    )
  }

  const eventoAtual = eventos.find(e => e.id === eventoParam) ?? eventos.find(e => e.ativo) ?? eventos[0]

  let gastos
  try {
    gastos = await listarGastos({ eventoId: eventoAtual.id })
  } catch (e) {
    return <BancoPendente detalhe={e instanceof Error ? e.message : String(e)} />
  }

  const kpis = kpisDeGastos(gastos, diaBRT())
  const ultimos = gastos.slice(0, 5)
  const qs = `?evento=${eventoAtual.id}`

  return (
    <div className="space-y-5">
      <SeletorEvento eventos={eventos} atual={eventoAtual.id} />

      <GravadorDeGasto eventoId={eventoAtual.id} eventoNome={eventoAtual.nome} />

      <FormGastoManual eventos={eventos.map(e => ({ id: e.id, nome: e.nome }))} eventoIdInicial={eventoAtual.id} />

      {/* Três números do evento — resumo, não dashboard. O painel completo é o link abaixo. */}
      <div className="grid grid-cols-3 gap-3">
        <Mini icone={<Wallet className="w-3.5 h-3.5" />} rotulo="Total do evento" valor={brl(kpis.total)} />
        <Mini icone={<CalendarClock className="w-3.5 h-3.5" />} rotulo="Hoje" valor={brl(kpis.hoje)} />
        <Mini icone={<Hash className="w-3.5 h-3.5" />} rotulo="Lançamentos" valor={String(kpis.quantidade)} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-slate-700 text-sm font-semibold">Últimos gastos</h2>
          <Link href={`/gastos/lista${qs}`} className="text-brand-600 hover:underline text-xs flex items-center gap-1">
            Ver todos <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        {!ultimos.length ? (
          <p className="text-slate-400 text-sm px-4 py-8 text-center">
            Nenhum gasto ainda neste evento. Aperte o botão acima e fale o primeiro.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {ultimos.map(g => (
              <li key={g.id} className="px-4 py-2.5 flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-slate-800 text-sm font-medium truncate">{g.descricao}</span>
                  <span className="block text-slate-400 text-2xs truncate">
                    {dataBr(g.dataGasto)}
                    {g.fornecedor ? ` · ${g.fornecedor}` : ''} · {g.categoria}
                    {g.origem === 'audio' ? ' · 🎙️' : ''}
                  </span>
                </span>
                <span className="text-slate-900 text-sm font-semibold tabular-nums shrink-0">{brl(g.valor)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href={`/gastos/lista${qs}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-2 hover:border-brand-300 transition-colors">
          <ListChecks className="w-4 h-4 text-brand-500" />
          <span className="text-slate-700 text-sm font-medium">Lista e filtros</span>
        </Link>
        <Link href={`/gastos/painel${qs}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center gap-2 hover:border-brand-300 transition-colors">
          <PieChart className="w-4 h-4 text-brand-500" />
          <span className="text-slate-700 text-sm font-medium">Dashboard</span>
        </Link>
      </div>
    </div>
  )
}

function Mini({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <span className="flex items-center gap-1 text-slate-400 text-2xs font-semibold uppercase tracking-wide">{icone} {rotulo}</span>
      <span className="block text-slate-900 font-bold tabular-nums mt-1 text-sm sm:text-base truncate">{valor}</span>
    </div>
  )
}

function dataBr(iso: string) {
  return `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

/** Igual ao BancoPendente do Backlog — diz o arquivo a rodar, não "erro interno". */
function BancoPendente({ detalhe }: { detalhe: string }) {
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-6 space-y-3">
      <div className="flex items-center gap-2 text-amber-800 font-semibold">
        <Database className="w-4 h-4" /> Falta um passo no banco
      </div>
      <p className="text-sm text-slate-600">
        Rode <code className="bg-white rounded px-1.5 py-0.5 text-slate-800 border border-amber-200">supabase/upgrade-gastos.sql</code>{' '}
        no SQL Editor do Supabase. É aditivo: cria só a tabela <code className="bg-white rounded px-1 py-0.5">gastos_evento</code> e
        o bucket <code className="bg-white rounded px-1 py-0.5">gastos</code>, sem tocar em nada existente.
      </p>
      <p className="text-slate-400 text-xs">Erro do banco: {detalhe}</p>
    </div>
  )
}
