import { formatarBR } from '@/lib/tz'
import { Badge } from '@/components/ui/Superficie'
import type { DiaDoHistorico, HistoricoNoEvento } from '@/lib/historico'

/**
 * O histórico de batidas de uma pessoa, dia a dia — SOMENTE LEITURA.
 *
 * Não é o componente do supervisor (`HistoricoBatidas`) com a edição
 * desligada: aquele importa as ações de lançar e apagar ponto, e o Encarregado
 * não pode nem ter essas ações no pacote. Este só desenha. Server Component:
 * nenhum botão, nenhum clique.
 */

const ROTULO_FASE: Record<string, string> = { montagem: 'Montagem', evento: 'Dia do evento', desmontagem: 'Desmontagem' }

function Status({ dia }: { dia: DiaDoHistorico }) {
  if (dia.cancelado) return <Badge tom="neutro">Cancelado</Badge>
  if (!dia.compareceu) return <Badge tom="negativo">Ausente</Badge>
  if (dia.completo) return <Badge tom="positivo">Presente</Badge>
  return <Badge tom="atencao">Incompleto</Badge>
}

function Etapa({ rotulo, batida, atrasoMin, silencioso }: {
  rotulo: string; batida: DiaDoHistorico['entrada']; atrasoMin?: number | null; silencioso: boolean
}) {
  return (
    <span className="flex flex-col items-center min-w-[52px]">
      <span className="text-2xs uppercase tracking-wide text-slate-400">{rotulo}</span>
      {batida ? (
        <span className="text-xs font-semibold tabular-nums text-slate-800">
          {formatarBR(batida.em, 'hora')}
          {atrasoMin ? <span className="block text-2xs font-medium text-erro-600">+{atrasoMin} min</span> : null}
        </span>
      ) : silencioso ? (
        <span className="text-xs text-slate-300">—</span>
      ) : (
        <span className="text-2xs font-semibold uppercase text-erro-600">não feita</span>
      )}
    </span>
  )
}

export default function HistoricoLeitura({ h }: { h: HistoricoNoEvento }) {
  const { resumo } = h
  const formatarHoras = (n: number) => `${Math.round(n * 10) / 10}h`

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { rotulo: 'Dias escalados', valor: resumo.diasEscalados },
          { rotulo: 'Trabalhados', valor: resumo.diasTrabalhados },
          { rotulo: 'Faltas', valor: resumo.diasFaltados },
          { rotulo: 'Horas', valor: formatarHoras(resumo.horasTotais) },
        ].map(c => (
          <div key={c.rotulo} className="bg-white border border-slate-200 rounded-xl px-3.5 py-2.5">
            <p className="text-slate-400 text-2xs uppercase tracking-wide font-semibold">{c.rotulo}</p>
            <p className="text-slate-800 text-lg font-extrabold tabular-nums">{c.valor}</p>
          </div>
        ))}
      </div>

      {!h.dias.length ? (
        <p className="text-slate-400 text-sm py-6 text-center">Este evento ainda não tem dias de trabalho cadastrados.</p>
      ) : (
        <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {h.dias.map(d => (
            <li key={d.data} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-[120px] flex-1">
                <p className="text-slate-800 text-sm font-semibold tabular-nums">{formatarBR(`${d.data}T12:00:00-03:00`, 'data')}</p>
                <p className="text-slate-400 text-xs">{d.cancelado ? '—' : ROTULO_FASE[d.fase] ?? d.fase}</p>
              </div>
              <Status dia={d} />
              {!d.cancelado && (
                <div className="flex items-center gap-2 ml-auto">
                  <Etapa rotulo="Entrada" batida={d.entrada} silencioso={!d.compareceu} />
                  <Etapa rotulo="Meio" batida={d.meio} atrasoMin={d.meioAtrasoMin} silencioso={!d.compareceu} />
                  <Etapa rotulo="Saída" batida={d.fim} silencioso={!d.compareceu} />
                  <span className="flex flex-col items-center min-w-[44px]">
                    <span className="text-2xs uppercase tracking-wide text-slate-400">Horas</span>
                    <span className="text-xs font-semibold tabular-nums text-slate-800">{d.horas != null ? formatarHoras(d.horas) : '—'}</span>
                  </span>
                </div>
              )}
              {d.pausas.length > 0 && (
                <p className="basis-full text-2xs text-slate-400">
                  Saiu e voltou: {d.pausas.map(p => `${formatarBR(p.saiu, 'hora')} → ${formatarBR(p.voltou, 'hora')}`).join(' · ')}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
