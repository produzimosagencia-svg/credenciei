import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Wallet, TrendingUp, TrendingDown, Receipt, PieChart, MessageCircle, Users,
  CalendarDays, Ticket, Percent, LineChart,
} from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase, buscarTudo } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { dashboardFinanceiro, eventosParaFiltro, type FiltroDashboard } from '@/lib/financeiro'
import { templatesAprovados, custoWhatsAppPorEvento, resumoFinanceiroWhatsApp } from '@/lib/whatsapp-painel'
import { formatarBR } from '@/lib/tz'
import { PageHeader, Secao, EmptyState } from '@/components/ui/Superficie'
import StatCard from '@/components/StatCard'
import FiltrosFinanceiro from './FiltrosFinanceiro'
import { FaturamentoCustosLucroPorEvento, EvolucaoFinanceira, CustosPorCategoria } from '@/components/financeiro/graficos'

export const revalidate = 0

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type EventoRef = { id: string; nome: string; ativo: boolean; data_inicio: string | null; organizacoes: { nome: string } | null }

/**
 * O dashboard financeiro — visão geral da operação. Só master (checado
 * abaixo; a isolação de dado mora nas tabelas próprias, ver
 * supabase/upgrade-financeiro.sql).
 *
 * KPIs e gráficos vêm de `dashboardFinanceiro` (lib/financeiro.ts), com o
 * MESMO filtro que a barra no topo desta tela manda — nunca dois recortes
 * diferentes calculando a mesma coisa.
 *
 * ─── A SEÇÃO DE BAIXO NÃO É O MESMO DINHEIRO ────────────────────────────────
 *
 * "Referência operacional" mostra o combinado com a equipe e o custo
 * estimado de WhatsApp — dado que o sistema já tinha antes deste módulo,
 * derivado do que a operação registra sozinha. Fica separado dos KPIs de
 * cima de propósito: o lucro oficial é `faturamento manual - custos
 * manuais`, e misturar os dois faria um número "pago" da equipe entrar
 * como custo duas vezes se o master também lançasse "Funcionários" como
 * custo manual.
 */
export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; evento?: string; categoria?: string; escopo?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!ehMaster(perfil.role)) redirect('/admin')

  const { de, ate, evento, categoria, escopo } = await searchParams
  const filtro: FiltroDashboard = { de: de || undefined, ate: ate || undefined, eventoId: evento || undefined, categoria: categoria || undefined }

  const [dash, eventosFiltro] = await Promise.all([
    dashboardFinanceiro(filtro),
    eventosParaFiltro(),
  ])

  const { kpis, porEvento, evolucao, porCategoria } = dash

  // ─── Referência operacional (automática, dado antigo) ──────────────────────
  const soAtivos = escopo !== 'todos'
  const [{ data: eventosRef }, equipe, templates] = await Promise.all([
    supabase.from('eventos').select('id, nome, ativo, data_inicio, organizacoes(nome)').order('data_inicio', { ascending: false }).returns<EventoRef[]>(),
    buscarTudo<{ valor_receber: number | null; pago: boolean | null; fornecedores: { evento_id: string }[] }>((de2, ate2) =>
      supabase.from('funcionarios').select('valor_receber, pago, fornecedores!inner(evento_id)').range(de2, ate2),
    ),
    templatesAprovados(),
  ])
  const [whatsPorEvento, resumoGeral] = await Promise.all([
    custoWhatsAppPorEvento(templates),
    resumoFinanceiroWhatsApp(templates),
  ])
  const porEventoRef = new Map<string, { pessoas: number; combinado: number; pago: number }>()
  for (const f of equipe) {
    const eventoId = Array.isArray(f.fornecedores) ? f.fornecedores[0]?.evento_id : (f.fornecedores as unknown as { evento_id: string } | null)?.evento_id
    if (!eventoId) continue
    const atual = porEventoRef.get(eventoId) ?? { pessoas: 0, combinado: 0, pago: 0 }
    const valor = Number(f.valor_receber) || 0
    atual.pessoas++
    atual.combinado += valor
    if (f.pago) atual.pago += valor
    porEventoRef.set(eventoId, atual)
  }
  const linhasRef = (eventosRef ?? [])
    .filter(e => !soAtivos || e.ativo)
    .map(e => {
      const eq = porEventoRef.get(e.id) ?? { pessoas: 0, combinado: 0, pago: 0 }
      const zap = whatsPorEvento.get(e.id) ?? { enviados: 0, custo: 0 }
      return { ...e, ...eq, aPagar: eq.combinado - eq.pago, zapEnviados: zap.enviados, zapCusto: zap.custo }
    })
    .filter(l => l.pessoas > 0 || l.zapEnviados > 0)
  const totalCombinadoRef = linhasRef.reduce((s, l) => s + l.combinado, 0)
  const totalPagoRef = linhasRef.reduce((s, l) => s + l.pago, 0)
  const totalZapRef = linhasRef.reduce((s, l) => s + l.zapCusto, 0)

  return (
    <div className="space-y-5">
      <PageHeader titulo="Financeiro" descricao="Faturamento, custos e lucro da operação — visível só para o master" />

      <FiltrosFinanceiro eventos={eventosFiltro} />

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Faturamento total" value={brl(kpis.faturamentoTotal)} icon={Wallet} tom="acento" />
        <StatCard
          label="Lucro total" value={brl(kpis.lucroTotal)}
          sub={kpis.margem !== null ? `${kpis.margem.toFixed(1)}% de margem` : 'sem faturamento no recorte'}
          icon={kpis.lucroTotal >= 0 ? TrendingUp : TrendingDown} tom={kpis.lucroTotal >= 0 ? 'sucesso' : 'erro'}
        />
        <StatCard label="Custos totais" value={brl(kpis.custosTotal)} icon={Receipt} tom="aviso" />
        <StatCard label="Margem de lucro" value={kpis.margem !== null ? `${kpis.margem.toFixed(1)}%` : '—'} icon={Percent} tom="info" small />
        <StatCard label="Gastos com WhatsApp" value={brl(kpis.gastosWhatsApp)} icon={MessageCircle} tom="info" small />
        <StatCard label="Gastos com funcionários" value={brl(kpis.gastosFuncionarios)} icon={Users} tom="info" small />
        <StatCard label="Outros gastos" value={brl(kpis.outrosGastos)} icon={PieChart} tom="neutro" small />
        <StatCard label="Eventos no recorte" value={kpis.quantidadeEventos} icon={CalendarDays} tom="neutro" small />
        <StatCard label="Ticket médio" value={brl(kpis.ticketMedio)} sub="faturamento por evento" icon={Ticket} tom="neutro" small />
      </div>

      <Secao
        tom="acento" icone={<LineChart className="w-3.5 h-3.5" />}
        titulo="Faturamento × Custos × Lucro" descricao="Por evento, no recorte escolhido"
        corpoClassName="p-4"
      >
        <FaturamentoCustosLucroPorEvento dados={porEvento.map(l => ({ evento: l.evento, faturamento: l.faturamento, custos: l.custos, lucro: l.lucro }))} />
      </Secao>

      <div className="grid lg:grid-cols-2 gap-4">
        <Secao icone={<LineChart className="w-3.5 h-3.5" />} titulo="Evolução ao longo do tempo" descricao="Faturamento, custos e lucro por mês" corpoClassName="p-4">
          <EvolucaoFinanceira dados={evolucao} />
        </Secao>
        <Secao icone={<PieChart className="w-3.5 h-3.5" />} titulo="Custos por categoria" descricao="Distribuição de todos os gastos lançados" corpoClassName="p-4">
          <CustosPorCategoria dados={porCategoria} />
        </Secao>
      </div>

      {/* ─── Referência operacional (automática) ──────────────────────────── */}
      <Secao
        titulo="Referência operacional"
        descricao="Combinado com a equipe e custo estimado de WhatsApp — dado automático, não entra no lucro acima"
        icone={<Users className="w-3.5 h-3.5" />}
        acoes={
          <Link href={soAtivos ? '/admin/financeiro?escopo=todos' : '/admin/financeiro'} className="btn btn-secundario btn-sm">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
            {soAtivos ? 'Ver todos os eventos' : 'Ver só os ativos'}
          </Link>
        }
        corpoClassName={linhasRef.length ? '' : 'p-4'}
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 pb-0">
          <StatCard label="Combinado com a equipe" value={brl(totalCombinadoRef)} sub={soAtivos ? 'eventos ativos' : 'todos os eventos'} icon={Users} tom="neutro" small />
          <StatCard label="Já pago" value={brl(totalPagoRef)} sub={`${totalCombinadoRef ? Math.round((totalPagoRef / totalCombinadoRef) * 100) : 0}% do combinado`} icon={Wallet} tom="neutro" small />
          <StatCard label="Falta pagar" value={brl(totalCombinadoRef - totalPagoRef)} sub="ainda em aberto" icon={TrendingUp} tom="neutro" small />
          <StatCard label="WhatsApp (estimado)" value={brl(totalZapRef)} sub={`últimos ${resumoGeral.dias} dias`} icon={MessageCircle} tom="neutro" small />
        </div>

        {!linhasRef.length ? (
          <EmptyState icone={<Users className="w-7 h-7" />} titulo="Nenhum evento com movimento" descricao={soAtivos ? 'Nenhum evento ativo tem equipe ou mensagem registrada.' : 'Ainda não há equipe nem mensagem em evento nenhum.'} />
        ) : (
          <div className="overflow-x-auto mt-3">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Evento</th><th>Equipe</th><th>Combinado</th><th>Pago</th><th>Falta pagar</th><th>WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {linhasRef.map(l => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/admin/eventos/${l.id}/financeiro`} className="text-brand-500 font-medium hover:underline">{l.nome}</Link>
                      <p className="text-slate-400 text-2xs">
                        {l.organizacoes?.nome ?? '—'}
                        {l.data_inicio ? ` · ${formatarBR(l.data_inicio, 'data')}` : ''}
                        {!l.ativo && ' · encerrado'}
                      </p>
                    </td>
                    <td className="tabular-nums text-slate-600">{l.pessoas}</td>
                    <td className="tabular-nums text-slate-700 font-medium">{brl(l.combinado)}</td>
                    <td className="tabular-nums text-green-700">{brl(l.pago)}</td>
                    <td className={`tabular-nums ${l.aPagar > 0 ? 'text-amber-700 font-medium' : 'text-slate-400'}`}>{brl(l.aPagar)}</td>
                    <td className="tabular-nums text-slate-600">
                      {brl(l.zapCusto)}
                      <span className="text-slate-400 text-2xs block">{l.zapEnviados} msg</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      <p className="text-slate-400 text-xs px-1">
        Faturamento e custos acima são lançamentos manuais, feitos evento a evento — abra um evento
        e entre em &ldquo;Financeiro&rdquo; pra cadastrar. A referência operacional é estimativa automática do
        que a operação já registrou (combinado com a equipe, envio de WhatsApp); serve pra
        dimensionar, não entra na conta de lucro.
      </p>
    </div>
  )
}
