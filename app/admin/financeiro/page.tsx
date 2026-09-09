import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Wallet, MessageCircle, Users, TrendingUp, CalendarDays } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase, buscarTudo } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { templatesAprovados, custoWhatsAppPorEvento, resumoFinanceiroWhatsApp } from '@/lib/whatsapp-painel'
import { formatarBR } from '@/lib/tz'
import { PageHeader, Secao, EmptyState } from '@/components/ui/Superficie'
import StatCard from '@/components/StatCard'

export const revalidate = 0

/**
 * Financeiro — a conta do negócio, e só pra quem é dono dele.
 *
 * SÓ MASTER, e isto não é detalhe de permissão: aqui ficam lado a lado
 * quanto cada evento custa de equipe e de WhatsApp. É a informação com que
 * os sócios decidem preço, e ela não pertence a quem opera o evento — nem ao
 * suporte, que entra pra consertar operação, nem ao admin do cliente, que
 * veria a margem de quem o contratou.
 *
 * ─── O QUE ESTES NÚMEROS SÃO, E O QUE NÃO SÃO ───────────────────────────────
 *
 * "Equipe" é a soma de `funcionarios.valor_receber` — o combinado com cada
 * pessoa, não o que já saiu do caixa. Por isso ela aparece quebrada em PAGO e
 * A PAGAR (`funcionarios.pago`), que é a pergunta real de quem fecha o
 * evento.
 *
 * "WhatsApp" é estimativa, e assumidamente: vem da tabela de preços da Meta
 * por categoria de template, aplicada ao que a fila registrou como enviado —
 * não da fatura. Serve pra dimensionar ("o meio do turno custou quanto?"),
 * não pra conciliar com o extrato.
 *
 * Nada aqui é lançamento manual: todo valor é derivado do que a operação já
 * registrou. Gasto que o sistema não conhece (cachê, transporte, alimentação)
 * ainda não tem lugar — quando tiver, é uma tabela nova, não um campo
 * escondido aqui.
 */

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Evento = {
  id: string
  nome: string
  ativo: boolean
  data_inicio: string | null
  organizacoes: { nome: string } | null
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ escopo?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!ehMaster(perfil.role)) redirect('/admin')

  const { escopo } = await searchParams
  const soAtivos = escopo !== 'todos'

  const [{ data: eventos }, equipe, templates] = await Promise.all([
    supabase
      .from('eventos')
      .select('id, nome, ativo, data_inicio, organizacoes(nome)')
      .order('data_inicio', { ascending: false })
      .returns<Evento[]>(),
    /*
     * A equipe inteira de uma vez, com o evento junto — e não uma consulta
     * por evento. Com dezenas de eventos e milhares de pessoas, o laço de
     * consultas é o que faz esta tela levar dez segundos pra abrir.
     *
     * `buscarTudo` porque a base passa de 1000 linhas (ver o comentário dele
     * em lib/supabase-server.ts).
     */
    buscarTudo<{ valor_receber: number | null; pago: boolean | null; fornecedores: { evento_id: string }[] }>(
      (de, ate) => supabase
        .from('funcionarios')
        .select('valor_receber, pago, fornecedores!inner(evento_id)')
        .range(de, ate),
    ),
    templatesAprovados(),
  ])

  const [whatsPorEvento, resumoGeral] = await Promise.all([
    custoWhatsAppPorEvento(templates),
    resumoFinanceiroWhatsApp(templates),
  ])

  const porEvento = new Map<string, { pessoas: number; combinado: number; pago: number }>()
  for (const f of equipe) {
    // O `!inner` vem inferido como array pelo supabase-js, mesmo sendo 1:1.
    const eventoId = (f.fornecedores as unknown as { evento_id: string }[] | { evento_id: string } | null)
      ? (Array.isArray(f.fornecedores) ? f.fornecedores[0]?.evento_id : (f.fornecedores as unknown as { evento_id: string }).evento_id)
      : undefined
    if (!eventoId) continue
    const atual = porEvento.get(eventoId) ?? { pessoas: 0, combinado: 0, pago: 0 }
    const valor = Number(f.valor_receber) || 0
    atual.pessoas++
    atual.combinado += valor
    if (f.pago) atual.pago += valor
    porEvento.set(eventoId, atual)
  }

  const linhas = (eventos ?? [])
    .filter(e => !soAtivos || e.ativo)
    .map(e => {
      const eq = porEvento.get(e.id) ?? { pessoas: 0, combinado: 0, pago: 0 }
      const zap = whatsPorEvento.get(e.id) ?? { enviados: 0, custo: 0 }
      return { ...e, ...eq, aPagar: eq.combinado - eq.pago, zapEnviados: zap.enviados, zapCusto: zap.custo }
    })
    // Sem gente e sem mensagem, o evento não tem nada a dizer aqui.
    .filter(l => l.pessoas > 0 || l.zapEnviados > 0)

  const totalCombinado = linhas.reduce((s, l) => s + l.combinado, 0)
  const totalPago = linhas.reduce((s, l) => s + l.pago, 0)
  const totalZap = linhas.reduce((s, l) => s + l.zapCusto, 0)

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Financeiro"
        descricao="A conta de cada evento — equipe e WhatsApp. Visível só para o master."
        acoes={
          <Link
            href={soAtivos ? '/admin/financeiro?escopo=todos' : '/admin/financeiro'}
            className="btn btn-secundario"
          >
            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
            {soAtivos ? 'Ver todos os eventos' : 'Ver só os ativos'}
          </Link>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Combinado com a equipe" value={brl(totalCombinado)} sub={soAtivos ? 'eventos ativos' : 'todos os eventos'} icon={Users} tom="acento" small />
        <StatCard label="Já pago" value={brl(totalPago)} sub={`${totalCombinado ? Math.round((totalPago / totalCombinado) * 100) : 0}% do combinado`} icon={Wallet} tom="sucesso" small />
        <StatCard label="Falta pagar" value={brl(totalCombinado - totalPago)} sub="ainda em aberto" icon={TrendingUp} tom="aviso" small />
        <StatCard label="WhatsApp" value={brl(totalZap)} sub={`últimos ${resumoGeral.dias} dias · estimativa`} icon={MessageCircle} tom="info" small />
      </div>

      <Secao
        tom="acento"
        icone={<Wallet className="w-3.5 h-3.5" />}
        titulo={`${linhas.length} evento${linhas.length === 1 ? '' : 's'}`}
        descricao={soAtivos ? 'Só os que estão ativos agora' : 'Todo o histórico da plataforma'}
        corpoClassName={linhas.length ? '' : 'p-4'}
      >
        {!linhas.length ? (
          <EmptyState
            icone={<Wallet className="w-7 h-7" />}
            titulo="Nenhum evento com movimento"
            descricao={soAtivos ? 'Nenhum evento ativo tem equipe ou mensagem registrada.' : 'Ainda não há equipe nem mensagem em evento nenhum.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Equipe</th>
                  <th>Combinado</th>
                  <th>Pago</th>
                  <th>Falta pagar</th>
                  <th>WhatsApp</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/admin/eventos/${l.id}`} className="text-brand-500 font-medium hover:underline">
                        {l.nome}
                      </Link>
                      <p className="text-slate-400 text-2xs">
                        {l.organizacoes?.nome ?? '—'}
                        {l.data_inicio ? ` · ${formatarBR(l.data_inicio, 'data')}` : ''}
                        {!l.ativo && ' · encerrado'}
                      </p>
                    </td>
                    <td className="tabular-nums text-slate-600">{l.pessoas}</td>
                    <td className="tabular-nums text-slate-700 font-medium">{brl(l.combinado)}</td>
                    <td className="tabular-nums text-green-700">{brl(l.pago)}</td>
                    <td className={`tabular-nums ${l.aPagar > 0 ? 'text-amber-700 font-medium' : 'text-slate-400'}`}>
                      {brl(l.aPagar)}
                    </td>
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
        O valor da equipe é o combinado em cada cadastro, não o que saiu do caixa — por isso
        aparece separado em pago e a pagar. O de WhatsApp é estimativa pela tabela de preços da
        Meta por categoria de template, sobre o que a fila registrou como enviado nos últimos{' '}
        {resumoGeral.dias} dias; serve para dimensionar, não para conciliar com a fatura.
      </p>
    </div>
  )
}
