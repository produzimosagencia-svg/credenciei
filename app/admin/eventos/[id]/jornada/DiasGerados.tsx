'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { alternarDiaJornada } from '@/lib/actions'
import { NOMES_DIAS, diaDaSemana } from '@/lib/jornada'

export type DiaLinha = {
  id: string
  data: string
  turno: number
  entrada: string
  saida: string
  cancelado: boolean
  passado: boolean
}

/**
 * Lista dos dias gerados, com um interruptor por dia.
 *
 * É a válvula de escape da regra: feriado, folga ou cancelamento de última
 * hora saem daqui sem mexer na configuração inteira. Dia desmarcado não cobra
 * registro e não abre janela no scanner.
 *
 * Dia que já passou aparece esmaecido e sem interruptor — desligar o passado
 * não muda nada e só confundiria quem está conferindo o histórico.
 */
export default function DiasGerados({ dias }: { dias: DiaLinha[] }) {
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const alternar = (id: string, cancelado: boolean) => {
    setErro(null)
    startTransition(async () => {
      try {
        await alternarDiaJornada(id, cancelado)
        router.refresh()
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível alterar este dia.')
      }
    })
  }

  return (
    <div>
      {erro && <p className="px-4 py-2 text-erro-600 text-xs">{erro}</p>}
      <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
        {dias.map(d => {
          const [ano, mes, dia] = d.data.split('-')
          return (
            <div
              key={d.id}
              className={`px-4 py-2.5 flex items-center justify-between gap-3 ${d.passado ? 'opacity-50' : ''}`}
            >
              <div className="min-w-0">
                <p className={`text-sm ${d.cancelado ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                  {dia}/{mes}/{ano}
                  <span className="text-slate-500"> · {NOMES_DIAS[diaDaSemana(d.data)]}</span>
                  {d.turno > 0 && <span className="text-slate-400"> · {d.turno + 1}º turno</span>}
                </p>
                <p className="text-slate-500 text-xs tabular-nums">
                  {d.entrada} às {d.saida}
                </p>
              </div>

              {d.passado ? (
                <span className="text-slate-400 text-2xs shrink-0">já passou</span>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer shrink-0">
                  <span className={`text-2xs ${d.cancelado ? 'text-slate-400' : 'text-sucesso-700'}`}>
                    {d.cancelado ? 'sem registro' : 'ativo'}
                  </span>
                  <input
                    type="checkbox"
                    checked={!d.cancelado}
                    disabled={pendente}
                    onChange={e => alternar(d.id, !e.target.checked)}
                    aria-label={`${d.cancelado ? 'Ativar' : 'Desativar'} registro em ${dia}/${mes}`}
                    className="w-4 h-4 accent-brand-500 cursor-pointer"
                  />
                </label>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
