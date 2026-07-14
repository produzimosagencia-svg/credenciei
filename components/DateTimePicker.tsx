'use client'
import { useEffect, useRef, useState } from 'react'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths,
  isSameDay, isSameMonth, isToday, format,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

const pad = (n: number) => String(n).padStart(2, '0')

/** "YYYY-MM-DDTHH:mm" (mesmo formato que <input type="datetime-local"> produzia) a partir de um Date local. */
function paraValorCampo(data: Date, hora: string): string {
  return `${data.getFullYear()}-${pad(data.getMonth() + 1)}-${pad(data.getDate())}T${hora}`
}

/** Interpreta "YYYY-MM-DDTHH:mm" como Date local (sem conversão de fuso — mesmo tratamento do input nativo anterior). */
function parseValorCampo(valor: string): { data: Date; hora: string } | null {
  const m = valor.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return null
  const [, ano, mes, dia, h, min] = m
  return { data: new Date(Number(ano), Number(mes) - 1, Number(dia)), hora: `${h}:${min}` }
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
  name, defaultValue, required, placeholder = 'Selecionar data e hora',
}: {
  name: string
  defaultValue?: string
  required?: boolean
  placeholder?: string
}) {
  const inicial = defaultValue ? parseValorCampo(defaultValue) : null

  const [valor, setValor] = useState(defaultValue ?? '')
  const [open, setOpen] = useState(false)
  const [dataSelecionada, setDataSelecionada] = useState<Date | null>(inicial?.data ?? null)
  const [horaSelecionada, setHoraSelecionada] = useState<string | null>(inicial?.hora ?? null)
  const [mesVisivel, setMesVisivel] = useState<Date>(inicial?.data ?? new Date())
  const horaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && horaSelecionada && horaRef.current) {
      const el = horaRef.current.querySelector(`[data-hora="${horaSelecionada}"]`)
      el?.scrollIntoView({ block: 'center' })
    }
  }, [open, horaSelecionada])

  const abrir = () => {
    setDataSelecionada(inicial?.data ?? dataSelecionada ?? new Date())
    setHoraSelecionada(inicial?.hora ?? horaSelecionada)
    setMesVisivel(dataSelecionada ?? new Date())
    setOpen(true)
  }

  const aplicar = () => {
    if (dataSelecionada && horaSelecionada) {
      setValor(paraValorCampo(dataSelecionada, horaSelecionada))
    }
    setOpen(false)
  }

  const limpar = () => {
    setValor('')
    setDataSelecionada(null)
    setHoraSelecionada(null)
    setOpen(false)
  }

  const dias = gerarDiasDoMes(mesVisivel)
  const exibicao = dataSelecionada && horaSelecionada
    ? `${format(dataSelecionada, 'dd/MM/yyyy')} ${horaSelecionada}`
    : ''

  return (
    <>
      <input type="hidden" name={name} value={valor} required={required} />
      <button
        type="button"
        onClick={abrir}
        className="input flex items-center justify-between text-left"
      >
        <span className={exibicao ? 'text-slate-800' : 'text-slate-400'}>{exibicao || placeholder}</span>
        <CalendarDays className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative bg-white rounded-3xl shadow-xl w-full max-w-md sm:max-w-lg overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex flex-col sm:flex-row">
              {/* Calendário */}
              <div className="p-5 sm:w-[62%]">
                <div className="flex items-center justify-between mb-4">
                  <button type="button" onClick={() => setMesVisivel(m => subMonths(m, 1))} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <p className="text-sm font-bold text-slate-800 capitalize">{format(mesVisivel, 'MMMM yyyy', { locale: ptBR })}</p>
                  <button type="button" onClick={() => setMesVisivel(m => addMonths(m, 1))} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {DIAS_SEMANA.map(d => (
                    <div key={d} className="text-center text-[11px] font-semibold text-slate-400 py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {dias.map(dia => {
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

              {/* Horários */}
              <div className="sm:w-[38%] border-t sm:border-t-0 sm:border-l border-slate-100 flex flex-col max-h-72 sm:max-h-[26rem]">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-4 pt-4 pb-2 shrink-0">Horário</p>
                <div ref={horaRef} className="overflow-y-auto px-3 pb-3 space-y-1.5 flex-1">
                  {HORARIOS.map(h => (
                    <button
                      key={h}
                      type="button"
                      data-hora={h}
                      onClick={() => setHoraSelecionada(h)}
                      className={`w-full text-sm font-medium py-2 rounded-xl border transition-colors ${
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
            </div>

            <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-5 py-4 bg-slate-50">
              <button type="button" onClick={limpar} className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors">
                Limpar
              </button>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setOpen(false)} className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 transition-colors">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={aplicar}
                  disabled={!dataSelecionada || !horaSelecionada}
                  className="bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold px-5 py-2 rounded-xl transition-colors"
                >
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
