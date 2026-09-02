'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths,
  isSameDay, isSameMonth, format,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Seletor de UM dia dentro dos dias válidos da operação (`jornada_dias`) —
 * o que a fileira de "pílulas" (28/08 31/08 01/09...) fazia, só que ela
 * ficava ilegível a partir de uns 6 dias e não cabia no celular.
 *
 * Mesma linguagem visual do `DateTimePicker` (calendário de um mês, com
 * setas, mesmo modal arredondado). Diferente de um seletor de data
 * qualquer: só os dias da operação são clicáveis — o resto do mês aparece
 * apagado, porque escolher um dia fora da operação não tem o que mostrar.
 *
 * A navegação continua sendo por LINK (não por estado), porque quem chama
 * este componente é uma página de servidor — trocar de dia é trocar de URL
 * (`?dia=...`), exatamente como a fileira de pílulas já fazia.
 */
export default function SeletorDeDia({
  dias, diaEscolhido, hoje, hrefBase,
}: {
  /** Os dias válidos da operação, 'AAAA-MM-DD', em qualquer ordem. */
  dias: string[]
  diaEscolhido: string
  hoje: string
  /** Caminho para onde o dia é acrescentado — ex.: '/admin/eventos/123' ou '/admin/eventos/123/presenca?ver=faltam'. */
  hrefBase: string
}) {
  const [open, setOpen] = useState(false)
  const paraData = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d) }
  const [mesVisivel, setMesVisivel] = useState<Date>(paraData(diaEscolhido))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const fechar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [open])

  const diasValidos = new Set(dias)
  const dataEscolhida = paraData(diaEscolhido)
  const href = (d: string) => `${hrefBase}${hrefBase.includes('?') ? '&' : '?'}dia=${d}`

  const gerarDiasDoMes = (mesReferencia: Date): Date[] => {
    const inicio = startOfWeek(startOfMonth(mesReferencia), { weekStartsOn: 1 })
    const fim = endOfWeek(endOfMonth(mesReferencia), { weekStartsOn: 1 })
    const arr: Date[] = []
    for (let d = inicio; d <= fim; d = addDays(d, 1)) arr.push(d)
    return arr
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  const soISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={() => { setMesVisivel(dataEscolhida); setOpen(o => !o) }}
        className="input flex items-center gap-2 text-left w-auto pr-3"
      >
        <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="tabular-nums text-sm font-medium text-slate-800 whitespace-nowrap">
          {format(dataEscolhida, 'dd/MM/yyyy')}{diaEscolhido === hoje ? ' · hoje' : ''}
        </span>
      </button>

      {open && (
        <div className="modal-pop-in absolute z-30 mt-2 left-0 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 w-72">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => setMesVisivel(m => subMonths(m, 1))} aria-label="Mês anterior" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-bold text-slate-800 capitalize">{format(mesVisivel, 'MMMM yyyy', { locale: ptBR })}</p>
            <button type="button" onClick={() => setMesVisivel(m => addMonths(m, 1))} aria-label="Próximo mês" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-1 mb-1">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="text-center text-2xs font-semibold text-slate-400 py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {gerarDiasDoMes(mesVisivel).map(dia => {
              const iso = soISO(dia)
              const valido = diasValidos.has(iso)
              const selecionado = isSameDay(dia, dataEscolhida)
              const ehHoje = iso === hoje
              const foraDoMes = !isSameMonth(dia, mesVisivel)

              if (!valido) {
                return (
                  <span
                    key={iso}
                    className={`aspect-square rounded-full text-sm flex items-center justify-center ${foraDoMes ? 'text-slate-200' : 'text-slate-300'}`}
                  >
                    {dia.getDate()}
                  </span>
                )
              }
              return (
                <Link
                  key={iso}
                  href={href(iso)}
                  onClick={() => setOpen(false)}
                  className={`aspect-square rounded-full text-sm font-medium flex items-center justify-center transition-colors ${
                    selecionado
                      ? 'bg-brand-500 text-white'
                      : ehHoje
                        ? 'text-brand-600 bg-brand-50 hover:bg-brand-100'
                        : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {dia.getDate()}
                </Link>
              )
            })}
          </div>
          {diasValidos.has(hoje) && diaEscolhido !== hoje && (
            <div className="border-t border-slate-100 mt-3 pt-3">
              <Link href={href(hoje)} onClick={() => setOpen(false)} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                Ir para hoje
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
