import Link from 'next/link'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, ArrowRight, Circle, Plus, LayoutGrid, UserCheck, Clock, TrendingUp } from 'lucide-react'
import { getPerfil, supabaseAdmin, licencasDeEventoRestantes, meuSetor } from '@/lib/supabase-server'
import { veTodosEventos, ehMaster, podeGerenciarEventos, podeEscanear } from '@/lib/permissions'
import StatCard from '@/components/StatCard'
import { BarrasMagnitude, DistribuicaoEtapas, COR_ETAPA } from '@/components/charts'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

export const revalidate = 0

const TUTORIAL: TutorialConfig = {
  tela: 'dashboard',
  versao: 1,
  passos: [
    { alvo: 'dash-nav', titulo: 'Bem-vindo ao Credenciei', posicao: 'bottom',
      descricao: 'Este é o seu painel. Comece por aqui: em "Eventos" você cadastra o evento, os setores e a equipe que vai trabalhar nele.' },
    { alvo: 'dash-novo-evento', titulo: 'Criar um evento', posicao: 'left',
      descricao: 'Atalho rápido para cadastrar um evento novo. Você pode criar até o limite de licenças contratadas.' },
    { alvo: 'dash-stats', titulo: 'Números do momento', posicao: 'bottom',
      descricao: 'Um resumo rápido: total de eventos, setores cadastrados, funcionários na base e quantas entradas foram registradas hoje.' },
    { alvo: 'dash-graficos', titulo: 'Acompanhamento ao vivo', posicao: 'top',
      descricao: 'Durante o evento, acompanhe aqui quantos já bateram entrada e como estão distribuídos os registros entre entrada, meio e saída.' },
    { alvo: 'dash-atividade', titulo: 'Atividade recente', posicao: 'left',
      descricao: 'Cada credenciamento aparece aqui em tempo real, com nome, empresa e horário — útil para conferir se o evento está fluindo.' },
  ],
}

export default async function AdminPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  // Supervisor não gerencia nada: vai direto pro dashboard do próprio setor
  // (ou pro scanner, se por algum motivo não tiver setor vinculado).
  if (podeEscanear(perfil.role) && !podeGerenciarEventos(perfil.role)) {
    const setor = await meuSetor(perfil)
    redirect(setor ? `/admin/eventos/${setor.evento_id}/fornecedor/${setor.id}` : '/scan')
  }
  const db = supabaseAdmin
  const podeCriarEvento = (await licencasDeEventoRestantes(perfil)) > 0

  const eventosQuery = db.from('eventos').select('*').order('data_inicio', { ascending: false })
  if (!veTodosEventos(perfil?.role)) eventosQuery.eq('organizacao_id', perfil!.organizacao_id)

  const { data: eventos } = await eventosQuery

  const eventoIds = eventos?.map(e => e.id) ?? []
  const eventosAtivos = eventos?.filter(e => e.ativo) ?? []

  const ativosIds = eventosAtivos.map(e => e.id)
  const contarEtapaAtivos = (tipo: 'entrada' | 'meio' | 'fim') =>
    ativosIds.length
      ? db.from('registros').select('id', { count: 'exact', head: true }).in('evento_id', ativosIds).eq('tipo', tipo)
      : Promise.resolve({ count: 0 })

  // Todas as queries abaixo dependem só de eventoIds → uma única wave em paralelo
  const [
    [
      { data: ultimosRegistros },
      { count: regEntrada },
      { count: regMeio },
      { count: regFim },
    ],
    presencaData,
  ] = await Promise.all([
    Promise.all([
      eventoIds.length
        ? db.from('registros').select('*, funcionarios(nome, cargo, empresa), eventos(nome)').in('evento_id', eventoIds).order('created_at', { ascending: false }).limit(12)
        : Promise.resolve({ data: [] }),
      contarEtapaAtivos('entrada'),
      contarEtapaAtivos('meio'),
      contarEtapaAtivos('fim'),
    ]),
    Promise.all(
      eventosAtivos.map(async (e) => {
        const [{ count: dentro }, { count: total }] = await Promise.all([
          db.from('registros').select('funcionario_id', { count: 'exact', head: true }).eq('evento_id', e.id).eq('tipo', 'entrada'),
          db.from('funcionarios').select('fornecedores!inner(evento_id)', { count: 'exact', head: true }).eq('fornecedores.evento_id', e.id),
        ])
        return { evento: e, dentro: dentro ?? 0, total: total ?? 0 }
      })
    ),
  ])

  const entradasHoje = ultimosRegistros?.filter(r =>
    r.tipo === 'entrada' && new Date(r.created_at).toDateString() === new Date().toDateString()
  ).length ?? 0

  // Total de gente esperada nos eventos ATIVOS — é a base de "quantos
  // faltam chegar", que é a pergunta do dia. Somar a base inteira aqui
  // misturaria evento encerrado com evento acontecendo agora.
  const esperadosAtivos = presencaData.reduce((acc, p) => acc + p.total, 0)
  const presentesAtivos = presencaData.reduce((acc, p) => acc + p.dentro, 0)
  const faltamChegar = Math.max(0, esperadosAtivos - presentesAtivos)

  const stats = [
    { label: 'Eventos ativos', value: eventosAtivos.length, sub: `de ${eventos?.length ?? 0}`, icon: CalendarDays, tom: 'acento' as const },
    { label: 'Presentes agora', value: presentesAtivos, sub: `de ${esperadosAtivos}`, icon: UserCheck, tom: 'sucesso' as const },
    { label: 'Ainda não chegaram', value: faltamChegar, icon: Clock, tom: faltamChegar > 0 ? ('aviso' as const) : ('neutro' as const) },
    { label: 'Entradas hoje', value: entradasHoje, icon: TrendingUp, tom: 'neutro' as const },
  ]

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil?.role)}>
    <div className="space-y-5">
      {/* Cabeçalho: bloco de ícone + título + data, ações à direita */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(59,130,246,0.18)' }}>
            <LayoutGrid className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-800 leading-tight">Painel</h1>
            <p className="text-slate-500 text-sm" suppressHydrationWarning>
              {format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TutorialButton />
          {podeCriarEvento && (
            <Link href="/admin/eventos/novo" data-tutorial="dash-novo-evento" className="btn btn-primario">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Novo evento</span>
              <span className="sm:hidden">Novo</span>
            </Link>
          )}
        </div>
      </div>

      {/* Os quatro números que respondem "como está agora" */}
      <div data-tutorial="dash-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      <div data-tutorial="dash-graficos" className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Presença por evento */}
        <div className="bg-white border border-slate-200 rounded-2xl">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-slate-800 font-semibold text-lg">Presença por evento</h2>
            <p className="text-slate-500 text-xs mt-0.5">Quem já registrou entrada, nos eventos ativos</p>
          </div>
          <div className="p-5">
            {!presencaData.length ? (
              <p className="text-slate-500 text-sm text-center py-6">Nenhum evento ativo no momento</p>
            ) : (
              <BarrasMagnitude
                itens={presencaData.map(p => ({ label: p.evento.nome, valor: p.dentro, total: p.total }))}
              />
            )}
          </div>
        </div>

        {/* Distribuição por etapa — barras, não donut. Comparar três valores
            é leitura de comprimento; donut obriga a comparar ângulo, que é
            mais difícil e não cabe num painel operacional. */}
        <div className="bg-white border border-slate-200 rounded-2xl">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-slate-800 font-semibold text-lg">Registros por etapa</h2>
            <p className="text-slate-500 text-xs mt-0.5">Somando todos os eventos ativos</p>
          </div>
          <div className="p-5">
            <DistribuicaoEtapas
              itens={[
                { label: 'Entrada', valor: regEntrada ?? 0, cor: COR_ETAPA.entrada },
                { label: 'Meio', valor: regMeio ?? 0, cor: COR_ETAPA.meio },
                { label: 'Saída', valor: regFim ?? 0, cor: COR_ETAPA.fim },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Eventos */}
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-slate-800 font-semibold text-lg">Eventos</h2>
            <Link href="/admin/eventos" className="text-slate-500 hover:text-slate-800 text-xs font-medium flex items-center gap-1 transition-colors">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="p-2">
            {!eventos?.length ? (
              <div className="text-center py-10">
                <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-700 font-medium text-sm">Nenhum evento criado</p>
                {podeCriarEvento && (
                  <Link href="/admin/eventos/novo" className="text-slate-500 hover:text-slate-800 text-xs mt-1 inline-block font-medium">
                    Criar primeiro evento →
                  </Link>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                {eventos.slice(0, 6).map((e) => {
                  const p = presencaData.find(p => p.evento.id === e.id)
                  return (
                    <Link
                      key={e.id}
                      href={`/admin/eventos/${e.id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Circle
                          className={`w-1.5 h-1.5 shrink-0 ${
                            e.ativo ? 'text-sucesso-600 fill-sucesso-600' : 'text-slate-300 fill-slate-300'
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-slate-800 text-sm font-medium truncate">{e.nome}</p>
                          <p className="text-slate-500 text-xs">
                            {format(new Date(e.data_inicio), 'dd/MM/yyyy', { locale: ptBR })}
                            {e.local && ` · ${e.local}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        {e.ativo && p && (
                          <span className="text-slate-500 text-xs tabular-nums">
                            <span className="text-slate-800 font-medium">{p.dentro}</span>/{p.total}
                          </span>
                        )}
                        <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Atividade ao vivo — timeline, não lista solta: a linha vertical
            liga os eventos no tempo e é o que dá sensação de "acontecendo". */}
        <div data-tutorial="dash-atividade" className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-slate-800 font-semibold text-lg">Atividade recente</h2>
          </div>
          <div className="p-5">
            {!ultimosRegistros?.length ? (
              <p className="text-slate-500 text-sm text-center py-8">Sem atividade ainda</p>
            ) : (
              <div className="relative overflow-y-auto max-h-80 pl-4">
                <span className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-slate-200" aria-hidden="true" />
                <div className="space-y-3.5">
                  {ultimosRegistros.map((r) => {
                    const func = r.funcionarios as any
                    const cor =
                      r.tipo === 'entrada' ? COR_ETAPA.entrada : r.tipo === 'meio' ? COR_ETAPA.meio : COR_ETAPA.fim
                    return (
                      <div key={r.id} className="relative">
                        <span
                          className="absolute -left-4 top-1.5 w-[7px] h-[7px] rounded-full ring-2 ring-white"
                          style={{ background: cor }}
                          aria-hidden="true"
                        />
                        <p className="text-slate-800 text-xs font-medium truncate">{func?.nome}</p>
                        <p className="text-slate-500 text-xs truncate">
                          {func?.empresa}{func?.cargo ? ` · ${func.cargo}` : ''}
                        </p>
                        <p className="text-slate-400 text-2xs mt-0.5 tabular-nums">
                          {r.tipo === 'entrada' ? 'Entrada' : r.tipo === 'meio' ? 'Meio' : 'Saída'} ·{' '}
                          {format(new Date(r.created_at), 'HH:mm', { locale: ptBR })}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </TutorialProvider>
  )
}
