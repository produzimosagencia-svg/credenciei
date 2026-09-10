'use client'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays, PhoneCall, Flag, Sparkles, PartyPopper } from 'lucide-react'
import type { Compromisso, CompromissoTipo } from '@/lib/backlog'
import { diaLongo } from './CartaoItem'

/**
 * O calendário do hub — "quais são os próximos compromissos e eventos"
 * (pedido do Juan, 09/09/2026).
 *
 * ─── QUATRO COISAS, QUATRO CORES ─────────────────────────────────────────────
 *
 * Retorno combinado, prazo de tarefa, evento previsto de um lead e evento de
 * verdade já cadastrado. São naturezas diferentes: o retorno é um compromisso
 * SEU, o evento é um fato do mundo. Misturar tudo com a mesma cor faria a
 * grade parecer cheia sem dizer de quê — por isso cada tipo tem cor e ícone
 * próprios, e a legenda fica visível em vez de escondida atrás de um "?".
 *
 * O mês vem da URL (`?mes=2026-09`), não do estado do componente: assim o
 * botão de voltar do navegador funciona e dá pra mandar o link de um mês pra
 * outra pessoa — mesma decisão dos filtros de Auditoria e do Financeiro.
 */

const ESTILO: Record<CompromissoTipo, { rotulo: string; classe: string; ponto: string; Icone: React.ElementType }> = {
  contato: { rotulo: 'Retorno de contato', classe: 'bg-brand-50 text-brand-700 border-brand-200', ponto: 'bg-brand-500', Icone: PhoneCall },
  prazo: { rotulo: 'Prazo de tarefa', classe: 'bg-amber-50 text-amber-800 border-amber-200', ponto: 'bg-amber-500', Icone: Flag },
  evento_previsto: { rotulo: 'Evento previsto', classe: 'bg-violet-50 text-violet-700 border-violet-200', ponto: 'bg-violet-400', Icone: Sparkles },
  evento: { rotulo: 'Evento cadastrado', classe: 'bg-blue-50 text-blue-700 border-blue-200', ponto: 'bg-blue-500', Icone: PartyPopper },
}

const NOME_DO_MES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
]
const DIAS_DA_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Vizinho do mês `YYYY-MM`. `passo` -1 volta, +1 avança. */
function mesVizinho(mes: string, passo: number): string {
  const [ano, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(ano, m - 1 + passo, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function Agenda({
  compromissos, mes, hoje, hrefDoMes, onAbrirItem,
}: {
  compromissos: Compromisso[]
  mes: string
  hoje: string
  hrefDoMes: (mes: string) => string
  onAbrirItem: (itemId: string) => void
}) {
  const [ano, numeroDoMes] = mes.split('-').map(Number)
  // Dia 1 e total de dias, em UTC, pra a grade não escorregar de fuso.
  const primeiroDiaSemana = new Date(Date.UTC(ano, numeroDoMes - 1, 1)).getUTCDay()
  const diasNoMes = new Date(Date.UTC(ano, numeroDoMes, 0)).getUTCDate()

  const porDia = new Map<string, Compromisso[]>()
  for (const c of compromissos) {
    porDia.set(c.data, [...(porDia.get(c.data) ?? []), c])
  }

  const celulas: (string | null)[] = [
    ...Array.from({ length: primeiroDiaSemana }, () => null),
    ...Array.from({ length: diasNoMes }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`),
  ]
  while (celulas.length % 7) celulas.push(null)

  const daqui = compromissos.filter(c => c.data >= hoje)

  return (
    <div className="space-y-4">
      {/* ── Cabeçalho do mês ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={hrefDoMes(mesVizinho(mes, -1))} aria-label="Mês anterior" className="btn btn-secundario btn-icone">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <h3 className="text-slate-800 font-bold px-2 min-w-[10rem] text-center">
            {NOME_DO_MES[numeroDoMes - 1]} de {ano}
          </h3>
          <Link href={hrefDoMes(mesVizinho(mes, 1))} aria-label="Próximo mês" className="btn btn-secundario btn-icone">
            <ChevronRight className="w-4 h-4" />
          </Link>
          {mes !== hoje.slice(0, 7) && (
            <Link href={hrefDoMes(hoje.slice(0, 7))} className="btn btn-secundario btn-sm ml-1">
              Hoje
            </Link>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {(Object.keys(ESTILO) as CompromissoTipo[]).map(tipo => (
            <span key={tipo} className="flex items-center gap-1.5 text-slate-500 text-2xs">
              <span className={`w-2 h-2 rounded-full ${ESTILO[tipo].ponto}`} /> {ESTILO[tipo].rotulo}
            </span>
          ))}
        </div>
      </div>

      {/* ── A grade ──────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto">
        <div className="min-w-[44rem]">
          <div className="grid grid-cols-7 gap-1.5 mb-1.5">
            {DIAS_DA_SEMANA.map(d => (
              <div key={d} className="text-slate-400 text-2xs font-bold uppercase tracking-wide text-center py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {celulas.map((dia, i) => {
              if (!dia) return <div key={`vazio-${i}`} className="min-h-[6.5rem] rounded-xl bg-slate-50/40" />
              const doDia = porDia.get(dia) ?? []
              const eHoje = dia === hoje
              return (
                <div
                  key={dia}
                  className={`min-h-[6.5rem] rounded-xl border p-1.5 space-y-1 ${
                    eHoje ? 'border-brand-400 bg-brand-50/40' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className={`block text-2xs font-bold tabular-nums ${eHoje ? 'text-brand-600' : 'text-slate-400'}`}>
                    {Number(dia.slice(-2))}
                  </span>
                  {doDia.map((c, j) => {
                    const { classe, Icone } = ESTILO[c.tipo]
                    const conteudo = (
                      <span className="flex items-start gap-1 min-w-0">
                        <Icone className="w-2.5 h-2.5 shrink-0 mt-[3px]" />
                        <span className="truncate">{c.titulo}</span>
                      </span>
                    )
                    const classeBase = `block w-full text-left rounded-md border px-1.5 py-1 text-2xs leading-tight ${classe} hover:brightness-95 transition-[filter]`
                    return c.eventoId ? (
                      <Link key={j} href={`/admin/eventos/${c.eventoId}`} className={classeBase} title={c.detalhe ?? c.titulo}>
                        {conteudo}
                      </Link>
                    ) : (
                      <button key={j} onClick={() => c.itemId && onAbrirItem(c.itemId)} className={classeBase} title={c.detalhe ?? c.titulo}>
                        {conteudo}
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── O que vem por aí, em lista ───────────────────────────────────── */}
      <div>
        <h3 className="flex items-center gap-1.5 text-slate-700 text-sm font-semibold mb-2">
          <CalendarDays className="w-3.5 h-3.5 text-slate-400" /> Próximos compromissos deste mês
        </h3>
        {!daqui.length ? (
          <p className="text-slate-400 text-sm py-4">Nada marcado daqui pra frente neste mês.</p>
        ) : (
          <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
            {daqui.map((c, i) => {
              const { Icone, ponto, rotulo } = ESTILO[c.tipo]
              const linha = (
                <span className="flex items-center gap-3 px-3.5 py-2.5 hover:bg-slate-50 transition-colors">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ponto}`} />
                  <span className="text-slate-500 text-xs tabular-nums w-20 shrink-0">{diaLongo(c.data)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-slate-800 text-sm font-medium truncate">{c.titulo}</span>
                    <span className="block text-slate-400 text-2xs truncate">{c.detalhe ?? rotulo}</span>
                  </span>
                  <Icone className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                </span>
              )
              return (
                <li key={i}>
                  {c.eventoId
                    ? <Link href={`/admin/eventos/${c.eventoId}`} className="block">{linha}</Link>
                    : <button onClick={() => c.itemId && onAbrirItem(c.itemId)} className="block w-full text-left">{linha}</button>}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
