'use client'
import { useEffect, useRef, useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths,
  isSameDay, isSameMonth, isToday, isWithinInterval, isBefore, format, subDays,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Seletor de PERÍODO (intervalo de datas) — o filtro do relatório.
 *
 * Mesma linguagem visual do `DateTimePicker` (calendário de um mês, com
 * setas, o mesmo modal arredondado) — ter um segundo calendário "parecido
 * mas diferente" é como um sistema acaba com três calendários distintos.
 * O que muda de verdade, por ser um INTERVALO e não uma data única: o
 * intervalo inteiro fica destacado entre início e fim, e uma coluna de
 * atalhos evita dois cliques pros recortes mais comuns.
 */

type Periodo = { de: string; ate: string }

const pad = (n: number) => String(n).padStart(2, '0')
const soISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const paraData = (iso: string) => { const [a, m, d] = iso.split('-').map(Number); return new Date(a, m - 1, d) }

function gerarDiasDoMes(mesReferencia: Date): Date[] {
  const inicio = startOfWeek(startOfMonth(mesReferencia), { weekStartsOn: 1 })
  const fim = endOfWeek(endOfMonth(mesReferencia), { weekStartsOn: 1 })
  const dias: Date[] = []
  for (let d = inicio; d <= fim; d = addDays(d, 1)) dias.push(d)
  return dias
}
const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export default function SeletorDePeriodo({
  value, onChange, periodoCompleto, className = '',
}: {
  value: Periodo
  onChange: (periodo: Periodo) => void
  /** Período inteiro do evento — vira o atalho "Evento inteiro". */
  periodoCompleto: Periodo
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [mesVisivel, setMesVisivel] = useState<Date>(paraData(value.de))
  // Seleção em andamento dentro do popover — só vira `value` ao Aplicar,
  // igual ao DateTimePicker (Cancelar não pode ter mexido no filtro real).
  const [de, setDe] = useState<Date>(paraData(value.de))
  const [ate, setAte] = useState<Date>(paraData(value.ate))
  const [escolhendoFim, setEscolhendoFim] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const fechar = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [open])

  const abrir = () => {
    setDe(paraData(value.de))
    setAte(paraData(value.ate))
    setMesVisivel(paraData(value.de))
    setEscolhendoFim(false)
    setOpen(true)
  }

  // Primeiro clique começa um novo intervalo (de = até = o dia clicado);
  // o segundo fecha ele, virando as pontas se o segundo clique for antes do
  // primeiro — assim clicar em qualquer ordem sempre dá um intervalo válido.
  const clicarDia = (dia: Date) => {
    if (!escolhendoFim) {
      setDe(dia); setAte(dia); setEscolhendoFim(true)
    } else {
      if (isBefore(dia, de)) { setAte(de); setDe(dia) } else { setAte(dia) }
      setEscolhendoFim(false)
    }
  }

  const aplicarPreset = (novoDe: Date, novoAte: Date) => {
    setDe(novoDe); setAte(novoAte); setEscolhendoFim(false)
    setMesVisivel(novoDe)
  }

  const hoje = new Date()
  const presets: { label: string; de: Date; ate: Date }[] = [
    { label: 'Evento inteiro', de: paraData(periodoCompleto.de), ate: paraData(periodoCompleto.ate) },
    { label: 'Hoje', de: hoje, ate: hoje },
    { label: 'Últimos 7 dias', de: subDays(hoje, 6), ate: hoje },
    { label: 'Este mês', de: startOfMonth(hoje), ate: hoje },
  ]

  const aplicar = () => {
    onChange({ de: soISO(de), ate: soISO(ate) })
    setOpen(false)
  }

  const exibicao = value.de === value.ate
    ? format(paraData(value.de), 'dd/MM/yyyy')
    : `${format(paraData(value.de), 'dd/MM/yyyy')} – ${format(paraData(value.ate), 'dd/MM/yyyy')}`

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        type="button"
        onClick={abrir}
        className={`input flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className="tabular-nums truncate text-slate-800">{exibicao}</span>
        <CalendarRange className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div
            className="modal-pop-in relative bg-white rounded-3xl shadow-xl w-full max-w-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col sm:flex-row">
              <div className="sm:w-36 p-3 border-b sm:border-b-0 sm:border-r border-slate-100 flex sm:flex-col gap-1 overflow-x-auto sm:overflow-visible">
                {presets.map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => aplicarPreset(p.de, p.ate)}
                    className="shrink-0 text-left text-xs font-medium text-slate-600 hover:text-brand-600 hover:bg-brand-50 rounded-lg px-3 py-2 transition-colors whitespace-nowrap"
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <div className="p-5 flex-1">
                <div className="flex items-center justify-between mb-4">
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
                <div className="grid grid-cols-7 gap-y-1">
                  {gerarDiasDoMes(mesVisivel).map(dia => {
                    const foraDoMes = !isSameMonth(dia, mesVisivel)
                    const inicio = isSameDay(dia, de)
                    const fim = isSameDay(dia, ate)
                    const noIntervalo = !foraDoMes && de <= ate && isWithinInterval(dia, { start: de, end: ate })
                    const hojeDia = isToday(dia)
                    return (
                      <div
                        key={dia.toISOString()}
                        className={`${noIntervalo ? 'bg-brand-50' : ''} ${inicio && noIntervalo ? 'rounded-l-full' : ''} ${fim && noIntervalo ? 'rounded-r-full' : ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => clicarDia(dia)}
                          className={`w-full aspect-square rounded-full text-sm font-medium transition-colors flex items-center justify-center ${
                            (inicio || fim) && !foraDoMes
                              ? 'bg-brand-500 text-white'
                              : foraDoMes
                                ? 'text-slate-300 hover:bg-slate-50'
                                : hojeDia
                                  ? 'text-brand-600 font-bold'
                                  : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {dia.getDate()}
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4 bg-slate-50">
              <span className="text-xs font-medium text-slate-500 tabular-nums">
                {format(de, 'dd/MM/yyyy')} – {format(ate, 'dd/MM/yyyy')}
              </span>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 transition-colors">
                  Cancelar
                </button>
                <button type="button" onClick={aplicar} className="btn btn-primario">
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
