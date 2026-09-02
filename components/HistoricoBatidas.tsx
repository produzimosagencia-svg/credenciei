'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Check, X, Clock, CameraOff, UserCheck, LogOut, AlertTriangle, LogIn, Camera, Pencil } from 'lucide-react'
import { formatarBR, isoParaInput } from '@/lib/tz'
import { lancarPontoManual, type MomentoPresenca } from '@/lib/actions'
import { Badge } from '@/components/ui/Superficie'
import StatCard from '@/components/StatCard'
import DateTimePicker from '@/components/DateTimePicker'
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
 * `podeEditar` liga o clique-pra-editar em cima da hora — pro caso "bateu o
 * QR duas vezes e registrou errado", que antes só se resolvia trocando pra
 * "Lançamento manual" numa tela separada, procurando a pessoa de novo. Usa a
 * MESMA `lancarPontoManual` de lá — não existe uma segunda forma de corrigir
 * ponto, só um segundo lugar de chegar até ela.
 */
export default function HistoricoBatidas({
  h, podeEditar = false, role, onSalvo,
}: {
  h: HistoricoNoEvento
  /** Mesma régua de `lancarPontoManual` no servidor. */
  podeEditar?: boolean
  /** Ver o mesmo prop em FuncionarioDetalheModal — decide se motivo é obrigatório. */
  role?: string
  /**
   * Chamado depois de salvar uma correção. Quando existe (aberto num modal
   * que já tem o histórico em estado de cliente), busca os dados de novo em
   * vez de `router.refresh()`: o refresh atualiza o Server Component por
   * trás, mas não refaz uma busca de cliente já resolvida — sem isto, a
   * correção só aparecia depois de recarregar a página inteira. Na página
   * cheia (`/admin/funcionarios/[id]/historico`), que não recebe este prop,
   * o refresh sozinho já basta — ali o histórico É o Server Component.
   */
  onSalvo?: () => void
}) {
  const { resumo } = h
  const router = useRouter()

  const [editando, setEditando] = useState<{ data: string; momento: MomentoPresenca; atual: string | null } | null>(null)
  const [quando, setQuando] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const motivoObrigatorio = role === 'suporte'
  const ROTULO_MOMENTO: Record<MomentoPresenca, string> = { entrada: 'entrada', meio: 'meio', fim: 'saída' }

  const abrirEdicao = (data: string, momento: MomentoPresenca, atual: string | null) => {
    setErro(null)
    setMotivo('')
    setQuando(atual ? isoParaInput(atual) : `${data}T08:00`)
    setEditando({ data, momento, atual })
  }

  const salvar = () => {
    if (!editando) return
    setErro(null)
    if (motivoObrigatorio && !motivo.trim()) { setErro('Informe o motivo da correção.'); return }
    startTransition(async () => {
      const r = await lancarPontoManual(h.funcionarioId, editando.momento, editando.data, quando, motivo || `Corrigido no histórico (era ${ROTULO_MOMENTO[editando.momento]}${editando.atual ? ` às ${formatarBR(editando.atual, 'hora')}` : ', não registrada'}).`)
      if (r.error) { setErro(r.error); return }
      setEditando(null)
      if (onSalvo) onSalvo()
      else router.refresh()
    })
  }

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
            {h.dias.map(d => (
              <Linha key={d.data} dia={d} podeEditar={podeEditar} onEditar={abrirEdicao} />
            ))}
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

      {/*
        * O painel de edição fica FORA da tabela, não numa célula — evita a
        * linha "pular" de altura ao clicar, e cabe o mesmo formulário de
        * "Lançamento manual" (motivo, data e hora) sem espremer numa célula.
        */}
      {editando && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-amber-800 text-sm font-semibold">
              Corrigir {ROTULO_MOMENTO[editando.momento]} de {formatarBR(`${editando.data}T12:00:00-03:00`, 'data')}
            </p>
            <button onClick={() => setEditando(null)} className="text-amber-700 hover:text-amber-900">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="text-amber-700 text-xs font-medium block mb-1">Data e hora certas</label>
            <DateTimePicker modo="datahora" value={quando} onChange={setQuando} />
          </div>
          <div>
            <label className="text-amber-700 text-xs font-medium block mb-1">
              Motivo {motivoObrigatorio ? '(obrigatório)' : '(opcional)'}
            </label>
            <input
              type="text" value={motivo} onChange={e => setMotivo(e.target.value)}
              className="input text-sm" placeholder="Ex.: bateu o QR duas vezes, o horário certo é este"
            />
          </div>
          {erro && <p className="text-red-600 text-xs">{erro}</p>}
          <div className="flex gap-2">
            <button onClick={salvar} disabled={isPending} className="btn btn-primario btn-sm disabled:opacity-50">
              {isPending ? 'Salvando…' : 'Salvar correção'}
            </button>
            <button onClick={() => setEditando(null)} disabled={isPending} className="btn btn-secundario btn-sm">
              Cancelar
            </button>
          </div>
        </div>
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
 * "NÃO REALIZADA" precisa saltar aos olhos SÓ quando é uma anomalia — a
 * pessoa esteve no evento e pulou uma etapa específica. É ela que muda o
 * pagamento e precisa ser vista no fechamento.
 *
 * No dia em que a pessoa nem apareceu (`silencioso`), repetir esse aviso em
 * negrito e vermelho nas três colunas — entrada, meio e saída — é só ruído:
 * o selo "Ausente" já contou a história da linha inteira, uma vez. Ali a
 * célula vazia vira um traço quieto.
 *
 * `atrasoMin` marca a batida feita FORA do prazo. Ela existe e vale — o meio
 * pode ser registrado depois da hora de propósito, senão a pessoa perderia a
 * chance de registrar de vez. Mas o organizador precisa reconhecer isso de
 * relance no fechamento, porque é uma ausência do posto que a pessoa ainda
 * vai ter que justificar.
 *
 * `onEditar`, quando existe, faz a célula inteira virar botão — o lápis é só
 * reforço visual de que ela é clicável, não o único alvo do clique.
 */
function Celula({
  batida, atrasoMin, silencioso, onEditar,
}: {
  batida: DiaDoHistorico['entrada']
  atrasoMin?: number | null
  /** O dia inteiro foi ausência — não uma etapa pulada dentro de um dia trabalhado. */
  silencioso?: boolean
  onEditar?: () => void
}) {
  const conteudo = !batida ? (
    silencioso
      ? <span className="text-slate-300">—</span>
      : <span className="text-erro-600 text-2xs font-semibold uppercase tracking-wide">não realizada</span>
  ) : (
    <span className="inline-flex items-center gap-1 tabular-nums flex-wrap">
      {(typeof atrasoMin === 'number' && atrasoMin > 0)
        ? <AlertTriangle className="w-3 h-3 text-erro-600 shrink-0" />
        : <Check className="w-3 h-3 text-green-600 shrink-0" />}
      <span className={(typeof atrasoMin === 'number' && atrasoMin > 0) ? 'text-erro-700 font-semibold' : undefined}>
        {formatarBR(batida.em, 'hora')}
      </span>
      {(typeof atrasoMin === 'number' && atrasoMin > 0) && (
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

  if (!onEditar) return conteudo
  return (
    <button
      type="button"
      onClick={onEditar}
      className="inline-flex items-center gap-1 -mx-1.5 px-1.5 py-0.5 rounded hover:bg-brand-50 transition-colors group"
      title={batida ? 'Corrigir horário' : 'Registrar horário'}
    >
      {conteudo}
      <Pencil className="w-2.5 h-2.5 text-slate-300 group-hover:text-brand-500 shrink-0" />
    </button>
  )
}

function Linha({
  dia, podeEditar, onEditar,
}: {
  dia: DiaDoHistorico
  podeEditar: boolean
  onEditar: (data: string, momento: MomentoPresenca, atual: string | null) => void
}) {
  const faltou = !dia.compareceu && !dia.cancelado
  // A linha inteira acende: quem confere o fechamento passa os olhos na
  // coluna da data, não lê célula por célula.
  const atrasou = (dia.meioAtrasoMin ?? 0) > 0
  // Dia cancelado não é dia de trabalho — não faz sentido lançar ponto nele.
  const editavel = podeEditar && !dia.cancelado
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
      <td className="text-slate-600 text-xs">
        <Celula batida={dia.entrada} silencioso={!dia.compareceu} onEditar={editavel ? () => onEditar(dia.data, 'entrada', dia.entrada?.em ?? null) : undefined} />
      </td>
      <td className="text-slate-600 text-xs">
        {/* Silencioso pelo mesmo motivo da entrada: quem nem apareceu não tem
            meio pulado, tem dia inteiro sem trabalhar — já dito no Status. */}
        <Celula batida={dia.meio} atrasoMin={dia.meioAtrasoMin} silencioso={!dia.compareceu} onEditar={editavel ? () => onEditar(dia.data, 'meio', dia.meio?.em ?? null) : undefined} />
        {/* O esperado ao lado do realizado: sem ele, "12:15" não diz se foi no
            horário. Some quando não houve entrada — não havia de onde contar. */}
        {dia.meioEsperadoEm && (
          <span className="block text-slate-400 text-2xs tabular-nums">
            previsto {formatarBR(dia.meioEsperadoEm, 'hora')}
          </span>
        )}
      </td>
      <td className="text-slate-600 text-xs">
        <Celula batida={dia.fim} silencioso={!dia.compareceu} onEditar={editavel ? () => onEditar(dia.data, 'fim', dia.fim?.em ?? null) : undefined} />
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
