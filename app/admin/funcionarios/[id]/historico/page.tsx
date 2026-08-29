import { redirect, notFound } from 'next/navigation'
import { CalendarDays, Check, X, Clock, CameraOff, UserCheck, LogOut } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { veTodosEventos, podeAcompanhar } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { formatCpf } from '@/lib/format'
import { historicoDoFuncionario, type DiaDoHistorico } from '@/lib/historico'
import { Secao, PageHeader, Badge } from '@/components/ui/Superficie'
import StatCard from '@/components/StatCard'

export const revalidate = 0

/**
 * O histórico de uma pessoa num evento, dia a dia.
 *
 * É a tela do fechamento: uma linha por DIA DE TRABALHO do evento, incluindo
 * os dias em que a pessoa não apareceu — que são os que mudam o pagamento.
 * "Não realizada" aqui não é um dado gravado, é a diferença entre o dia que o
 * evento esperava e a batida que não existe (ver lib/historico.ts).
 */

export default async function HistoricoPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeAcompanhar(perfil.role)) redirect('/admin')

  const { id } = await params
  const h = await historicoDoFuncionario(id)
  if (!h) notFound()

  // Mesma régua do resto: supervisor só a própria equipe, admin só a própria
  // organização, master tudo.
  const { data: vinculo } = await supabaseAdmin
    .from('funcionarios')
    .select('fornecedor_id, fornecedores!inner(evento_id, eventos!inner(organizacao_id))')
    .eq('id', id)
    .single()
  const org = (vinculo?.fornecedores as unknown as { eventos: { organizacao_id: string | null } })?.eventos?.organizacao_id
  if (perfil.role === 'supervisor') {
    if (perfil.fornecedor_id !== vinculo?.fornecedor_id) redirect('/admin')
  } else if (!veTodosEventos(perfil.role) && org !== perfil.organizacao_id) {
    redirect('/admin')
  }

  const { resumo } = h

  return (
    <div className="space-y-5">
      <PageHeader
        titulo={h.nome}
        descricao={`${formatCpf(h.cpf)} · ${h.eventoNome} · ${h.setorNome}`}
        voltarPara={`/admin/eventos/${h.eventoId}/fornecedor/${vinculo?.fornecedor_id}`}
        acoes={
          h.descredenciadoEm
            ? <Badge tom="neutro">Descredenciado em {formatarBR(h.descredenciadoEm, 'curto')}</Badge>
            : <Badge tom="positivo">Credenciado</Badge>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Dias escalados" value={resumo.diasEscalados} icon={CalendarDays} tom="acento" />
        <StatCard label="Dias trabalhados" value={resumo.diasTrabalhados} icon={UserCheck} tom="sucesso" />
        <StatCard label="Faltas" value={resumo.diasFaltados} icon={X} tom={resumo.diasFaltados ? 'erro' : 'neutro'} />
        <StatCard label="Horas registradas" value={resumo.horasTotais.toString().replace('.', ',')} icon={Clock} tom="info" />
      </div>

      <Secao
        tom="neutro"
        icone={<CalendarDays className="w-3.5 h-3.5" />}
        titulo="Batidas dia a dia"
        descricao="Um dia por linha, inclusive os que não tiveram batida nenhuma"
      >
        <div className="overflow-x-auto">
          <table className="tabela">
            <thead>
              <tr>
                <th>Dia</th>
                <th>Tipo</th>
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
      </Secao>

      {resumo.diasIncompletos > 0 && (
        <p className="flex items-start gap-1.5 text-slate-500 text-xs">
          <CameraOff className="w-3.5 h-3.5 shrink-0 mt-px" />
          {resumo.diasIncompletos} dia(s) com presença iniciada mas sem as três etapas. Nesses dias
          não dá para calcular as horas — a jornada fica em aberto.
        </p>
      )}
    </div>
  )
}

/** "NÃO REALIZADA" precisa saltar aos olhos: é ela que muda o pagamento. */
function Celula({ batida }: { batida: DiaDoHistorico['entrada'] }) {
  if (!batida) return <span className="text-erro-600 text-2xs font-semibold uppercase tracking-wide">não realizada</span>
  return (
    <span className="inline-flex items-center gap-1 tabular-nums">
      <Check className="w-3 h-3 text-green-600 shrink-0" />
      {formatarBR(batida.em, 'hora')}
      {/* Batida do supervisor no lugar da pessoa: precisa ficar visível no
          fechamento, porque é a que alguém pode querer contestar. */}
      {batida.assistido && <span className="text-amber-600 text-2xs">assistida</span>}
    </span>
  )
}

function Linha({ dia }: { dia: DiaDoHistorico }) {
  const faltou = !dia.compareceu && !dia.cancelado
  return (
    <tr className={faltou ? 'bg-erro-50/40' : undefined}>
      <td className="font-medium text-slate-800 tabular-nums">
        {formatarBR(`${dia.data}T12:00:00-03:00`, 'data')}
      </td>
      <td>
        {dia.cancelado
          ? <Badge tom="neutro">Cancelado</Badge>
          : dia.tipo === 'principal'
            ? <Badge tom="marca">Dia do evento</Badge>
            : <span className="text-slate-500 text-xs">Preparação</span>}
      </td>
      <td className="text-slate-600 text-xs"><Celula batida={dia.entrada} /></td>
      <td className="text-slate-600 text-xs"><Celula batida={dia.meio} /></td>
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
