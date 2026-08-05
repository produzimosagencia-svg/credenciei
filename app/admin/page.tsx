import Link from 'next/link'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import {
  CalendarDays, MapPin, Users, Plus, LayoutGrid, UserCheck, Clock, TrendingUp,
  ChevronLeft, ChevronRight, Lock,
} from 'lucide-react'
import { getPerfil, supabaseAdmin, licencasDeEventoRestantes, meuSetor } from '@/lib/supabase-server'
import { veTodosEventos, ehMaster, podeGerenciarEventos, podeEscanear, podeExcluirEventos } from '@/lib/permissions'
import StatCard from '@/components/StatCard'
import { COR_ETAPA } from '@/components/charts'
import { FluxoDoDia } from '@/components/charts-cliente'
import EventoActions from './eventos/EventoActions'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

export const revalidate = 0

/** Encerrados crescem pra sempre; ativos são poucos e ficam todos visíveis. */
const PAGE_SIZE = 8

const TUTORIAL: TutorialConfig = {
  tela: 'dashboard',
  versao: 2,
  passos: [
    { alvo: 'dash-stats', titulo: 'Como está agora', posicao: 'bottom',
      descricao: 'Os quatro números do momento: eventos acontecendo, quantos da equipe já chegaram, quantos ainda faltam e quantas entradas foram registradas hoje.' },
    { alvo: 'dash-graficos', titulo: 'Fluxo de credenciamento', posicao: 'bottom',
      descricao: 'A curva de registros por hora. É aqui que você vê se o pico de chegada já passou — cada cor é uma etapa: entrada, meio e saída.' },
    { alvo: 'dash-novo-evento', titulo: 'Criar um evento', posicao: 'left',
      descricao: 'Cadastre um evento novo: nome, datas e as janelas de horário em que a equipe pode bater ponto. Você pode criar até o limite de licenças contratadas.' },
    { alvo: 'eventos-card', titulo: 'Seus eventos', posicao: 'top',
      descricao: 'Clique no nome para gerenciar setores, equipe e presenças. A barra à direita mostra quantos da equipe já bateram entrada.' },
    { alvo: 'eventos-acoes', titulo: 'Ações do evento', posicao: 'left',
      descricao: 'Encerre um evento quando ele acabar ou exclua se foi criado por engano. Evento encerrado para de aceitar novas presenças.' },
  ],
}

type LinhaEvento = {
  id: string
  nome: string
  ativo: boolean
  data_inicio: string
  local: string | null
  setores: number
  equipe: number
  presentes: number
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  // Supervisor não gerencia nada: vai direto pro painel do próprio setor
  // (ou pro scanner, se por algum motivo não tiver setor vinculado).
  if (podeEscanear(perfil.role) && !podeGerenciarEventos(perfil.role)) {
    const setor = await meuSetor(perfil)
    redirect(setor ? `/admin/eventos/${setor.evento_id}/fornecedor/${setor.id}` : '/scan')
  }

  const db = supabaseAdmin
  const podeExcluir = podeExcluirEventos(perfil.role)
  const licencasRestantes = await licencasDeEventoRestantes(perfil)
  const podeCriarEvento = licencasRestantes > 0

  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const ativosQuery = db.from('eventos').select('*, fornecedores(count)').eq('ativo', true).order('data_inicio', { ascending: false })
  const encerradosQuery = db.from('eventos').select('*, fornecedores(count)', { count: 'exact' }).eq('ativo', false).order('data_inicio', { ascending: false }).range(from, to)
  if (!veTodosEventos(perfil.role)) {
    ativosQuery.eq('organizacao_id', perfil.organizacao_id)
    encerradosQuery.eq('organizacao_id', perfil.organizacao_id)
  }

  // Uma leitura só do relógio pra toda a página.
  const agora = new Date()

  const [{ data: ativos }, { data: encerrados, count: totalEncerrados }, { data: maisRecente }] = await Promise.all([
    ativosQuery,
    encerradosQuery,
    // Quando foi o último registro que existe. Ver comentário do fim da janela.
    db.from('registros').select('created_at').order('created_at', { ascending: false }).limit(1),
  ])

  /**
   * Fim da janela do gráfico.
   *
   * Ancorar em "agora" deixava o gráfico vazio o tempo todo: fora dos dias de
   * evento não existe registro nenhum nas últimas 24h, e a tela mostrava
   * "nenhum registro" mesmo com o histórico cheio. Agora a janela termina no
   * ÚLTIMO registro que existe — se o movimento foi hoje, é o mesmo que
   * antes; se foi semana passada, mostra aquele dia em vez de nada.
   */
  const ultimoRegistroEm = maisRecente?.[0]?.created_at ? new Date(maisRecente[0].created_at as string) : null
  const fimJanela = ultimoRegistroEm && ultimoRegistroEm < agora ? ultimoRegistroEm : agora
  const desde24h = new Date(fimJanela.getTime() - 23 * 60 * 60 * 1000).toISOString()

  const idsNaTela = [...(ativos ?? []), ...(encerrados ?? [])].map(e => e.id as string)

  /**
   * Tamanho da equipe e quem já bateu entrada, por evento. Duas consultas
   * para a página inteira — não duas por evento, que era o padrão antigo e
   * multiplicava requisição conforme a lista crescia.
   */
  const [{ data: funcionarios }, { data: entradas }, { data: registros24h }, { data: ultimosRegistros }] =
    await Promise.all([
      idsNaTela.length
        ? db.from('funcionarios').select('id, fornecedores!inner(evento_id)').in('fornecedores.evento_id', idsNaTela)
        : Promise.resolve({ data: [] }),
      idsNaTela.length
        ? db.from('registros').select('funcionario_id, evento_id').in('evento_id', idsNaTela).eq('tipo', 'entrada')
        : Promise.resolve({ data: [] }),
      // Só created_at e tipo: é tudo que a curva precisa. Olha TODOS os
      // eventos, não só os ativos — senão o gráfico esvazia assim que o
      // evento é encerrado, justamente quando se quer revisar como foi.
      idsNaTela.length
        ? db.from('registros').select('created_at, tipo').in('evento_id', idsNaTela)
            .gte('created_at', desde24h).lte('created_at', fimJanela.toISOString())
        : Promise.resolve({ data: [] }),
      idsNaTela.length
        ? db.from('registros').select('id, tipo, created_at, funcionarios(nome, cargo, empresa)').in('evento_id', idsNaTela).order('created_at', { ascending: false }).limit(10)
        : Promise.resolve({ data: [] }),
    ])

  const equipePorEvento = new Map<string, number>()
  for (const f of funcionarios ?? []) {
    const eid = (f.fornecedores as unknown as { evento_id: string })?.evento_id
    if (eid) equipePorEvento.set(eid, (equipePorEvento.get(eid) ?? 0) + 1)
  }
  // Set por evento: a mesma pessoa pode ter mais de um registro de entrada.
  const presentesPorEvento = new Map<string, Set<string>>()
  for (const r of entradas ?? []) {
    const eid = r.evento_id as string
    if (!presentesPorEvento.has(eid)) presentesPorEvento.set(eid, new Set())
    presentesPorEvento.get(eid)!.add(r.funcionario_id as string)
  }

  const montar = (e: Record<string, unknown>): LinhaEvento => ({
    id: e.id as string,
    nome: e.nome as string,
    ativo: e.ativo as boolean,
    data_inicio: e.data_inicio as string,
    local: (e.local as string | null) ?? null,
    setores: (e.fornecedores as { count: number }[] | null)?.[0]?.count ?? 0,
    equipe: equipePorEvento.get(e.id as string) ?? 0,
    presentes: presentesPorEvento.get(e.id as string)?.size ?? 0,
  })

  const linhasAtivas = (ativos ?? []).map(montar)
  const linhasEncerradas = (encerrados ?? []).map(montar)
  const totalEncerradosCount = totalEncerrados ?? 0
  const totalPages = Math.max(1, Math.ceil(totalEncerradosCount / PAGE_SIZE))
  const totalEventos = linhasAtivas.length + totalEncerradosCount

  /**
   * Agrupa os registros das últimas 24h por hora cheia. Monta as 24 casas
   * primeiro e depois preenche — assim hora sem movimento vira vale no
   * gráfico, em vez de sumir e distorcer a curva.
   */
  const fluxo = Array.from({ length: 24 }, (_, i) => {
    const d = new Date(fimJanela.getTime() - (23 - i) * 60 * 60 * 1000)
    return {
      chave: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`,
      hora: String(d.getHours()).padStart(2, '0'),
      entrada: 0, meio: 0, fim: 0,
    }
  })
  const porChave = new Map(fluxo.map(f => [f.chave, f]))
  for (const r of registros24h ?? []) {
    const d = new Date(r.created_at as string)
    const alvo = porChave.get(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}-${d.getHours()}`)
    if (!alvo) continue
    const t = r.tipo as 'entrada' | 'meio' | 'fim'
    if (t === 'entrada' || t === 'meio' || t === 'fim') alvo[t]++
  }
  const dadosFluxo = fluxo.map(({ hora, entrada, meio, fim }) => ({ hora, entrada, meio, fim }))

  // Os números do topo olham só pros eventos ATIVOS: somar evento encerrado
  // misturaria o que já acabou com o que está acontecendo agora.
  const esperadosAtivos = linhasAtivas.reduce((acc, e) => acc + e.equipe, 0)
  const presentesAtivos = linhasAtivas.reduce((acc, e) => acc + e.presentes, 0)
  const faltamChegar = Math.max(0, esperadosAtivos - presentesAtivos)
  const hoje = agora.toDateString()
  const entradasHoje = (registros24h ?? []).filter(
    r => r.tipo === 'entrada' && new Date(r.created_at as string).toDateString() === hoje
  ).length

  const stats = [
    { label: 'Eventos ativos', value: linhasAtivas.length, sub: `de ${totalEventos}`, icon: CalendarDays, tom: 'acento' as const },
    { label: 'Presentes agora', value: presentesAtivos, sub: `de ${esperadosAtivos}`, icon: UserCheck, tom: 'sucesso' as const },
    { label: 'Ainda não chegaram', value: faltamChegar, icon: Clock, tom: faltamChegar > 0 ? ('aviso' as const) : ('neutro' as const) },
    { label: 'Entradas hoje', value: entradasHoje, icon: TrendingUp, tom: 'neutro' as const },
  ]

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil.role)}>
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(59,130,246,0.18)' }}>
            <LayoutGrid className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-800 leading-tight">Painel</h1>
            <p className="text-slate-500 text-sm" suppressHydrationWarning>
              {format(agora, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TutorialButton />
          {podeCriarEvento ? (
            <Link href="/admin/eventos/novo" data-tutorial="dash-novo-evento" className="btn btn-primario">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Novo evento</span>
              <span className="sm:hidden">Novo</span>
            </Link>
          ) : (
            /* Sem isto o botão sumia e nada explicava por quê. */
            <span className="flex items-center gap-1.5 text-slate-500 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Sem licença disponível</span>
              <span className="sm:hidden">Sem licença</span>
            </span>
          )}
        </div>
      </div>

      <div data-tutorial="dash-stats" className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(s => <StatCard key={s.label} {...s} />)}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Fluxo do dia: durante um evento a pergunta é "o pico já passou?",
            e isso só se responde com eixo do tempo. */}
        <div data-tutorial="dash-graficos" className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl">
          <div className="flex items-start justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
            <div>
              <h2 className="text-slate-800 font-semibold text-lg">Fluxo de credenciamento</h2>
              {/* Diz de QUANDO é a curva: sem isso, um gráfico de um evento de
                  semana passada pareceria movimento de agora. */}
              <p className="text-slate-500 text-xs mt-0.5">
                {fimJanela.toDateString() === hoje
                  ? 'Registros por hora nas últimas 24 horas'
                  : `Registros por hora — 24h até ${format(fimJanela, "d 'de' MMM, HH'h'", { locale: ptBR })}`}
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-3 shrink-0 pt-1">
              {([['Entrada', COR_ETAPA.entrada], ['Meio', COR_ETAPA.meio], ['Saída', COR_ETAPA.fim]] as const).map(([rotulo, cor]) => (
                <span key={rotulo} className="flex items-center gap-1.5 text-slate-500 text-xs">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: cor }} />
                  {rotulo}
                </span>
              ))}
            </div>
          </div>
          <div className="p-5 pl-2">
            <FluxoDoDia dados={dadosFluxo} />
          </div>
        </div>

        {/* Atividade ao vivo — timeline: a linha vertical liga os registros no
            tempo e é o que dá a sensação de "acontecendo agora". */}
        <div className="bg-white border border-slate-200 rounded-2xl">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <h2 className="text-slate-800 font-semibold text-lg">Atividade recente</h2>
          </div>
          <div className="p-5">
            {!ultimosRegistros?.length ? (
              <p className="text-slate-500 text-sm text-center py-10">Sem atividade ainda</p>
            ) : (
              <div className="relative overflow-y-auto max-h-56 pl-4">
                <span className="absolute left-[3px] top-1.5 bottom-1.5 w-px bg-slate-200" aria-hidden="true" />
                <div className="space-y-3.5">
                  {ultimosRegistros.map(r => {
                    const func = r.funcionarios as unknown as { nome?: string; empresa?: string; cargo?: string } | null
                    const cor = r.tipo === 'entrada' ? COR_ETAPA.entrada : r.tipo === 'meio' ? COR_ETAPA.meio : COR_ETAPA.fim
                    return (
                      <div key={r.id as string} className="relative">
                        <span
                          className="absolute -left-4 top-1.5 w-[7px] h-[7px] rounded-full ring-2 ring-white"
                          style={{ background: cor }}
                          aria-hidden="true"
                        />
                        <p className="text-slate-800 text-xs font-medium truncate">{func?.nome}</p>
                        <p className="text-slate-500 text-2xs truncate">
                          {func?.empresa}{func?.cargo ? ` · ${func.cargo}` : ''}
                        </p>
                        <p className="text-slate-400 text-2xs mt-0.5 tabular-nums">
                          {r.tipo === 'entrada' ? 'Entrada' : r.tipo === 'meio' ? 'Meio' : 'Saída'} ·{' '}
                          {format(new Date(r.created_at as string), 'HH:mm', { locale: ptBR })}
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

      {/* Eventos: era uma tela separada, e uma lista encolhida aqui dizendo
          "ver todos". Duas telas pro mesmo conteúdo — agora é só esta. */}
      {!totalEventos ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center">
          <CalendarDays className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 text-sm font-medium">Nenhum evento criado</p>
          {podeCriarEvento ? (
            <>
              <p className="text-slate-500 text-sm mt-1">Crie seu primeiro evento para começar</p>
              <Link href="/admin/eventos/novo" className="inline-flex mt-4 btn btn-primario">
                <Plus className="w-3.5 h-3.5" /> Criar evento
              </Link>
            </>
          ) : (
            <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">
              Suas licenças de evento acabaram. Fale com o administrador da plataforma para liberar mais.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {!!linhasAtivas.length && (
            <section className="space-y-2">
              <h2 className="text-2xs text-slate-500 uppercase tracking-widest font-semibold">
                Ativos · {linhasAtivas.length}
              </h2>
              {linhasAtivas.map((e, i) => (
                <EventoCard key={e.id} evento={e} podeExcluir={podeExcluir} destacar={i === 0} />
              ))}
            </section>
          )}

          {!!linhasEncerradas.length && (
            <section className="space-y-2">
              <h2 className="text-2xs text-slate-500 uppercase tracking-widest font-semibold">
                Encerrados · {totalEncerradosCount}
              </h2>
              {linhasEncerradas.map(e => <EventoCard key={e.id} evento={e} podeExcluir={podeExcluir} />)}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-slate-500 text-xs">Página {page} de {totalPages}</p>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/admin?page=${page - 1}`}
                      aria-disabled={page <= 1}
                      aria-label="Página anterior"
                      className={`btn btn-secundario btn-icone ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Link>
                    <Link
                      href={`/admin?page=${page + 1}`}
                      aria-disabled={page >= totalPages}
                      aria-label="Próxima página"
                      className={`btn btn-secundario btn-icone ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </div>
    </TutorialProvider>
  )
}

function EventoCard({ evento, podeExcluir, destacar }: { evento: LinhaEvento; podeExcluir: boolean; destacar?: boolean }) {
  const pct = evento.equipe > 0 ? Math.round((evento.presentes / evento.equipe) * 100) : 0

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl px-4 py-3.5 flex items-center gap-4 hover:border-slate-300 transition-colors ${evento.ativo ? '' : 'opacity-60'}`}>
      <Link
        href={`/admin/eventos/${evento.id}`}
        data-tutorial={destacar ? 'eventos-card' : undefined}
        className="flex-1 min-w-0 space-y-1.5"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-slate-800 font-semibold text-sm truncate">{evento.nome}</h3>
          {evento.ativo ? (
            <span className="inline-flex items-center gap-1 text-2xs font-medium text-sucesso-700 bg-sucesso-50 border border-sucesso-200 px-1.5 py-0.5 rounded">
              <span className="w-1.5 h-1.5 rounded-full bg-sucesso-600" />
              Ativo
            </span>
          ) : (
            <span className="text-2xs font-medium text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
              Encerrado
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap text-slate-500 text-xs">
          <span className="flex items-center gap-1">
            <CalendarDays className="w-3 h-3 shrink-0" />
            {format(new Date(evento.data_inicio), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
          </span>
          {evento.local && (
            <span className="flex items-center gap-1 min-w-0">
              <MapPin className="w-3 h-3 shrink-0" />
              <span className="truncate">{evento.local}</span>
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3 shrink-0" />
            {evento.setores} setor{evento.setores !== 1 ? 'es' : ''} · {evento.equipe} na equipe
          </span>
        </div>
      </Link>

      <div className="hidden sm:block w-44 shrink-0">
        {evento.equipe === 0 ? (
          <p className="text-slate-500 text-xs text-right">Equipe ainda não cadastrada</p>
        ) : (
          <>
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-slate-500 text-2xs">presentes</span>
              <span className="text-xs tabular-nums">
                <span className="text-slate-800 font-medium">{evento.presentes}</span>
                <span className="text-slate-500">/{evento.equipe}</span>
                <span className="text-slate-400"> · {pct}%</span>
              </span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: 'var(--color-sucesso-600)' }} />
            </div>
          </>
        )}
      </div>

      <div className="shrink-0 -mr-1" data-tutorial={destacar ? 'eventos-acoes' : undefined}>
        <EventoActions eventoId={evento.id} ativo={evento.ativo} podeExcluir={podeExcluir} />
      </div>
    </div>
  )
}
