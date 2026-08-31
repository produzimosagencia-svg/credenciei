import { CalendarDays, Check, X, Clock, CameraOff, UserCheck, LogOut, AlertTriangle, LogIn, Camera } from 'lucide-react'
import { formatarBR } from '@/lib/tz'
import { Badge } from '@/components/ui/Superficie'
import StatCard from '@/components/StatCard'
import type { DiaDoHistorico, HistoricoNoEvento } from '@/lib/historico'

/**
 * O histórico de batidas — resumo + tabela dia a dia.
 *
 * Compartilhado entre a página cheia (`/admin/funcionarios/{id}/historico`,
 * link vindo das Conversas de WhatsApp) e a aba "Histórico" do modal do
 * funcionário (aberto sem navegar, direto da lista de colaboradores). Duas
 * telas mostrando o mesmo dado com duas implementações divergiriam no primeiro
 * ajuste que alguém fizesse numa e esquecesse na outra.
 *
 * Não tem hook nem estado — só recebe o que `historicoDoFuncionario` já
 * calculou e desenha. Por isso funciona tanto renderizado no servidor (a
 * página cheia) quanto dentro de uma árvore de cliente (o modal, depois de
 * buscar os dados por uma server action).
 */
export default function HistoricoBatidas({ h }: { h: HistoricoNoEvento }) {
  const { resumo } = h

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Dias escalados" value={resumo.diasEscalados} icon={CalendarDays} tom="acento" />
        <StatCard label="Dias trabalhados" value={resumo.diasTrabalhados} icon={UserCheck} tom="sucesso" />
        <StatCard label="Faltas" value={resumo.diasFaltados} icon={X} tom={resumo.diasFaltados ? 'erro' : 'neutro'} />
        <StatCard label="Horas registradas" value={resumo.horasTotais.toString().replace('.', ',')} icon={Clock} tom="info" />
      </div>

      {/*
        * As três contagens de batida, à parte do resumo principal.
        *
        * "Dias trabalhados" já diz quantos dias tiveram pelo menos a entrada —
        * mas não diz quantos desses dias ficaram sem o meio ou sem a saída.
        * Alguém que bateu entrada em 6 dias e o meio em só 4 tem um problema
        * que o resumo principal sozinho esconde.
        */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-slate-500 px-1">
        <span className="inline-flex items-center gap-1.5">
          <LogIn className="w-3.5 h-3.5 text-slate-400" />
          <strong className="text-slate-700 tabular-nums">{resumo.batidasEntrada}</strong> entrada{resumo.batidasEntrada === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-slate-400" />
          <strong className="text-slate-700 tabular-nums">{resumo.batidasMeio}</strong> meio{resumo.batidasMeio === 1 ? '' : 's'}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <LogOut className="w-3.5 h-3.5 text-slate-400" />
          <strong className="text-slate-700 tabular-nums">{resumo.batidasFim}</strong> saída{resumo.batidasFim === 1 ? '' : 's'}
        </span>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="tabela">
          <thead>
            <tr>
              <th>Dia</th>
              <th>Etapa</th>
              <th>Status</th>
              <th>Entrada</th>
              <th>Meio</th>
              <th>Saída</th>
              <th>Horas</th>
            </tr>
          </thead>
          <tbody>
            {h.dias.map(d => <Linha key={d.data} dia={d} />)}
          </tbody>
        </table>
      </div>

      {resumo.diasIncompletos > 0 && (
        <p className="flex items-start gap-1.5 text-slate-500 text-xs px-1">
          <CameraOff className="w-3.5 h-3.5 shrink-0 mt-px" />
          {resumo.diasIncompletos} dia(s) com presença iniciada mas sem as três etapas. Nesses dias
          não dá para calcular as horas — a jornada fica em aberto.
        </p>
      )}
    </div>
  )
}

/**
 * O status do dia, num rótulo só.
 *
 * Derivado dos mesmos campos que já sustentam o resto da tabela
 * (`cancelado`, `compareceu`, `completo`) — não é um dado novo, é uma
 * tradução deles para o rótulo que se lê de relance.
 */
function StatusDoDia({ dia }: { dia: DiaDoHistorico }) {
  if (dia.cancelado) return <Badge tom="neutro">Cancelado</Badge>
  if (!dia.compareceu) return <Badge tom="negativo">Ausente</Badge>
  if (dia.completo) return <Badge tom="positivo">Presente</Badge>
  return <Badge tom="atencao">Incompleto</Badge>
}

/**
 * "NÃO REALIZADA" precisa saltar aos olhos: é ela que muda o pagamento.
 *
 * `atrasoMin` marca a batida feita FORA do prazo. Ela existe e vale — o meio
 * pode ser registrado depois da hora de propósito, senão a pessoa ficaria
 * presa, já que a saída exige o meio. Mas o organizador precisa reconhecer
 * isso de relance no fechamento, porque é uma ausência do posto que a pessoa
 * ainda vai ter que justificar.
 */
function Celula({ batida, atrasoMin }: { batida: DiaDoHistorico['entrada']; atrasoMin?: number | null }) {
  if (!batida) return <span className="text-erro-600 text-2xs font-semibold uppercase tracking-wide">não realizada</span>

  const atrasada = typeof atrasoMin === 'number' && atrasoMin > 0
  return (
    <span className="inline-flex items-center gap-1 tabular-nums flex-wrap">
      {atrasada
        ? <AlertTriangle className="w-3 h-3 text-erro-600 shrink-0" />
        : <Check className="w-3 h-3 text-green-600 shrink-0" />}
      <span className={atrasada ? 'text-erro-700 font-semibold' : undefined}>
        {formatarBR(batida.em, 'hora')}
      </span>
      {atrasada && (
        <span className="text-erro-600 text-2xs font-semibold uppercase tracking-wide">
          {/* Em horas quando passa disso: "312 min" não diz nada de relance. */}
          {atrasoMin! >= 90
            ? `atrasada ${String(Math.round((atrasoMin! / 60) * 10) / 10).replace('.', ',')} h`
            : `atrasada ${atrasoMin} min`}
        </span>
      )}
      {/* Batida do supervisor no lugar da pessoa: precisa ficar visível no
          fechamento, porque é a que alguém pode querer contestar. */}
      {batida.assistido && <span className="text-amber-600 text-2xs">assistida</span>}
    </span>
  )
}

function Linha({ dia }: { dia: DiaDoHistorico }) {
  const faltou = !dia.compareceu && !dia.cancelado
  // A linha inteira acende: quem confere o fechamento passa os olhos na
  // coluna da data, não lê célula por célula.
  const atrasou = (dia.meioAtrasoMin ?? 0) > 0
  return (
    <tr className={faltou || atrasou ? 'bg-erro-50/40' : undefined}>
      <td className="font-medium text-slate-800 tabular-nums whitespace-nowrap">
        {formatarBR(`${dia.data}T12:00:00-03:00`, 'data')}
      </td>
      <td>
        {/* A ETAPA, não só "preparação": no fechamento importa saber se o dia
            foi montagem ou desmontagem — são contratos e diárias diferentes. */}
        {dia.cancelado
          ? <span className="text-slate-400 text-xs">—</span>
          : dia.tipo === 'principal'
            ? <Badge tom="marca">Dia do evento</Badge>
            : <span className="text-slate-500 text-xs">
                {dia.fase === 'desmontagem' ? 'Desmontagem' : 'Montagem'}
              </span>}
      </td>
      <td><StatusDoDia dia={dia} /></td>
      <td className="text-slate-600 text-xs"><Celula batida={dia.entrada} /></td>
      <td className="text-slate-600 text-xs">
        <Celula batida={dia.meio} atrasoMin={dia.meioAtrasoMin} />
        {/* O esperado ao lado do realizado: sem ele, "12:15" não diz se foi no
            horário. Some quando não houve entrada — não havia de onde contar. */}
        {dia.meioEsperadoEm && (
          <span className="block text-slate-400 text-2xs tabular-nums">
            previsto {formatarBR(dia.meioEsperadoEm, 'hora')}
          </span>
        )}
      </td>
      <td className="text-slate-600 text-xs">
        <Celula batida={dia.fim} />
        {dia.fim && dia.tipo === 'principal' && (
          <LogOut className="w-3 h-3 text-slate-400 inline-block ml-1" />
        )}
      </td>
      <td className="text-slate-500 text-xs tabular-nums">
        {dia.horas !== null ? `${String(dia.horas).replace('.', ',')} h` : '—'}
      </td>
    </tr>
  )
}
