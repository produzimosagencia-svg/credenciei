'use client'
import { useEffect, useRef, useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths,
  isSameDay, isSameMonth, isToday, format,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, Clock } from 'lucide-react'

/**
 * Seletor de data e hora do sistema.
 *
 * Três modos, porque nem todo campo quer as duas coisas:
 *   'datahora' → "2026-09-01T08:00"  (janelas do evento — o padrão)
 *   'data'     → "2026-09-01"        (período da jornada)
 *   'hora'     → "08:00"             (horário de entrada/saída da jornada)
 *
 * E dois jeitos de usar, porque o sistema tem os dois:
 *   - por FORMULÁRIO (`name` + `defaultValue`): grava num input escondido,
 *     que é como as telas de evento enviam via FormData;
 *   - CONTROLADO (`value` + `onChange`): para telas que montam o payload em
 *     estado do React, como a configuração de registros diários.
 *
 * Os dois convivem no mesmo componente de propósito: ter um segundo seletor
 * "parecido" é como um sistema acaba com três calendários diferentes.
 */

const pad = (n: number) => String(n).padStart(2, '0')

export type ModoPicker = 'datahora' | 'data' | 'hora'

const soData = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Monta o valor do campo conforme o modo. */
function montarValor(modo: ModoPicker, data: Date | null, hora: string | null): string {
  if (modo === 'hora') return hora ?? ''
  if (!data) return ''
  if (modo === 'data') return soData(data)
  return hora ? `${soData(data)}T${hora}` : ''
}

/** Lê o valor do campo conforme o modo, sem conversão de fuso. */
function lerValor(modo: ModoPicker, valor: string): { data: Date | null; hora: string | null } {
  const v = (valor ?? '').trim()
  if (!v) return { data: null, hora: null }

  if (modo === 'hora') {
    return { data: null, hora: /^\d{2}:\d{2}$/.test(v) ? v : null }
  }
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/)
  if (!m) return { data: null, hora: null }
  const [, ano, mes, dia, h, min] = m
  return {
    data: new Date(Number(ano), Number(mes) - 1, Number(dia)),
    hora: h && min ? `${h}:${min}` : null,
  }
}

function gerarDiasDoMes(mesReferencia: Date): Date[] {
  const inicio = startOfWeek(startOfMonth(mesReferencia), { weekStartsOn: 1 })
  const fim = endOfWeek(endOfMonth(mesReferencia), { weekStartsOn: 1 })
  const dias: Date[] = []
  for (let d = inicio; d <= fim; d = addDays(d, 1)) dias.push(d)
  return dias
}

function gerarHorarios(): string[] {
  const horarios: string[] = []
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 5) horarios.push(`${pad(h)}:${pad(m)}`)
  }
  return horarios
}
const HORARIOS = gerarHorarios()
const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

export default function DateTimePicker({
  name, defaultValue, required, placeholder, modo = 'datahora',
  value, onChange, className = '',
}: {
  modo?: ModoPicker
  /** Uso por formulário: grava num input escondido com este nome. */
  name?: string
  defaultValue?: string
  required?: boolean
  placeholder?: string
  /** Uso controlado: quem manda no valor é quem chama. */
  value?: string
  onChange?: (valor: string) => void
  className?: string
}) {
  const controlado = value !== undefined
  const [valorInterno, setValorInterno] = useState(defaultValue ?? '')
  const valorAtual = controlado ? value : valorInterno

  const [open, setOpen] = useState(false)
  const atual = lerValor(modo, valorAtual)
  const [dataSelecionada, setDataSelecionada] = useState<Date | null>(atual.data)
  const [horaSelecionada, setHoraSelecionada] = useState<string | null>(atual.hora)
  const [mesVisivel, setMesVisivel] = useState<Date>(atual.data ?? new Date())
  const horaRef = useRef<HTMLDivElement>(null)

  const mostraCalendario = modo !== 'hora'
  const mostraHorario = modo !== 'data'

  // Rola até o horário escolhido ao abrir — sem isto a lista começa às 00:00
  // e quem tem entrada às 18:00 rola 216 itens.
  useEffect(() => {
    if (open && horaSelecionada && horaRef.current) {
      horaRef.current.querySelector(`[data-hora="${horaSelecionada}"]`)?.scrollIntoView({ block: 'center' })
    }
  }, [open, horaSelecionada])

  const abrir = () => {
    const lido = lerValor(modo, valorAtual)
    setDataSelecionada(lido.data ?? (mostraCalendario ? new Date() : null))
    setHoraSelecionada(lido.hora)
    setMesVisivel(lido.data ?? new Date())
    setOpen(true)
  }

  const definir = (novo: string) => {
    if (controlado) onChange?.(novo)
    else setValorInterno(novo)
  }

  const aplicar = () => {
    definir(montarValor(modo, dataSelecionada, horaSelecionada))
    setOpen(false)
  }

  const limpar = () => {
    definir('')
    setDataSelecionada(null)
    setHoraSelecionada(null)
    setOpen(false)
  }

  const podeAplicar = (!mostraCalendario || !!dataSelecionada) && (!mostraHorario || !!horaSelecionada)

  const exibicao = (() => {
    const lido = lerValor(modo, valorAtual)
    if (modo === 'hora') return lido.hora ?? ''
    if (!lido.data) return ''
    const d = format(lido.data, 'dd/MM/yyyy')
    return modo === 'data' ? d : lido.hora ? `${d} ${lido.hora}` : ''
  })()

  const vazio = placeholder ?? (modo === 'hora' ? 'Selecionar horário' : modo === 'data' ? 'Selecionar data' : 'Selecionar data e hora')
  const Icone = modo === 'hora' ? Clock : CalendarDays

  return (
    <>
      {name && <input type="hidden" name={name} value={valorAtual} required={required} />}
      <button
        type="button"
        onClick={abrir}
        className={`input flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className={`tabular-nums truncate ${exibicao ? 'text-slate-800' : 'text-slate-400'}`}>
          {exibicao || vazio}
        </span>
        <Icone className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div
            className={`modal-pop-in relative bg-white rounded-3xl shadow-xl w-full overflow-hidden ${
              modo === 'hora' ? 'max-w-xs' : modo === 'data' ? 'max-w-sm' : 'max-w-md sm:max-w-lg'
            }`}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col sm:flex-row">
              {mostraCalendario && (
                <div className={`p-5 ${mostraHorario ? 'sm:w-[62%]' : 'w-full'}`}>
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
                  <div className="grid grid-cols-7 gap-1">
                    {gerarDiasDoMes(mesVisivel).map(dia => {
                      const foraDoMes = !isSameMonth(dia, mesVisivel)
                      const selecionado = dataSelecionada && isSameDay(dia, dataSelecionada)
                      const hoje = isToday(dia)
                      return (
                        <button
                          key={dia.toISOString()}
                          type="button"
                          onClick={() => { setDataSelecionada(dia); if (foraDoMes) setMesVisivel(dia) }}
                          className={`aspect-square rounded-full text-sm font-medium transition-colors flex items-center justify-center ${
                            selecionado
                              ? 'bg-brand-500 text-white'
                              : foraDoMes
                                ? 'text-slate-300 hover:bg-slate-50'
                                : hoje
                                  ? 'text-brand-600 bg-brand-50 hover:bg-brand-100'
                                  : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {dia.getDate()}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {mostraHorario && (
                <div className={`flex flex-col max-h-72 sm:max-h-[26rem] ${
                  mostraCalendario ? 'sm:w-[38%] border-t sm:border-t-0 sm:border-l border-slate-100' : 'w-full'
                }`}>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 pt-4 pb-2 shrink-0">Horário</p>
                  <div ref={horaRef} className="overflow-y-auto px-3 pb-3 space-y-1.5 flex-1">
                    {HORARIOS.map(h => (
                      <button
                        key={h}
                        type="button"
                        data-hora={h}
                        onClick={() => setHoraSelecionada(h)}
                        className={`w-full text-sm font-medium tabular-nums py-2 rounded-xl border transition-colors ${
                          horaSelecionada === h
                            ? 'bg-brand-500 border-brand-500 text-white'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
                        }`}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4 bg-slate-50">
              <button type="button" onClick={limpar} className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors">
                Limpar
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 transition-colors">
                  Cancelar
                </button>
                <button type="button" onClick={aplicar} disabled={!podeAplicar} className="btn btn-primario">
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
