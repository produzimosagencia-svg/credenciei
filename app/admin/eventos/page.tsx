import Link from 'next/link'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, MapPin, Users, Lock } from 'lucide-react'
import EventoActions from './EventoActions'
import { getPerfil, supabaseAdmin, licencasDeEventoRestantes } from '@/lib/supabase-server'
import { veTodosEventos, podeExcluirEventos, ehMaster } from '@/lib/permissions'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

export const revalidate = 0

const PAGE_SIZE = 12

const TUTORIAL: TutorialConfig = {
  tela: 'eventos-lista',
  versao: 1,
  passos: [
    { alvo: 'eventos-novo', titulo: 'Criar um evento', posicao: 'left',
      descricao: 'Aqui você cadastra um evento novo: nome, datas e as janelas de horário em que a equipe pode bater ponto.' },
    { alvo: 'eventos-card', titulo: 'Abrir um evento', posicao: 'bottom',
      descricao: 'Clique no nome do evento para gerenciar setores, equipe, presenças e acompanhar o credenciamento ao vivo. A barra mostra quantos da equipe já bateram entrada.' },
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

export default async function EventosPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const perfil = await getPerfil()
  // Supervisor não gerencia eventos — só o próprio setor (via /scan → Minha equipe)
  if (perfil?.role === 'supervisor') redirect('/scan')
  const db = supabaseAdmin
  const isAdmin = veTodosEventos(perfil?.role)
  const podeExcluir = podeExcluirEventos(perfil?.role)
  const licencasRestantes = await licencasDeEventoRestantes(perfil)
  const podeCriarEvento = licencasRestantes > 0

  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  // Ativos ficam sempre visíveis por completo (naturalmente poucos, em execução agora).
  // Encerrados crescem para sempre com o tempo → só esses são paginados.
  const ativosQuery = db.from('eventos').select('*, fornecedores(count)').eq('ativo', true).order('data_inicio', { ascending: false })
  const encerradosQuery = db.from('eventos').select('*, fornecedores(count)', { count: 'exact' }).eq('ativo', false).order('data_inicio', { ascending: false }).range(from, to)
  if (!isAdmin) {
    ativosQuery.eq('organizacao_id', perfil!.organizacao_id)
    encerradosQuery.eq('organizacao_id', perfil!.organizacao_id)
  }

  const [{ data: ativos }, { data: encerrados, count: totalEncerrados }] = await Promise.all([ativosQuery, encerradosQuery])

  const totalEncerradosCount = totalEncerrados ?? 0
  const totalPages = Math.max(1, Math.ceil(totalEncerradosCount / PAGE_SIZE))
  const total = (ativos?.length ?? 0) + totalEncerradosCount

  /**
   * Tamanho da equipe e quantos já bateram entrada, por evento.
   *
   * É o que faltava na lista: antes cada linha dizia só nome, data e quantos
   * setores — nada sobre o estado do evento, que é justamente o motivo de
   * alguém abrir esta tela durante a operação. Duas consultas para a página
   * inteira, não duas por evento.
   */
  const idsNaTela = [...(ativos ?? []), ...(encerrados ?? [])].map(e => e.id as string)
  const equipePorEvento = new Map<string, number>()
  const presentesPorEvento = new Map<string, Set<string>>()

  if (idsNaTela.length) {
    const [{ data: funcionarios }, { data: entradas }] = await Promise.all([
      db.from('funcionarios').select('id, fornecedores!inner(evento_id)').in('fornecedores.evento_id', idsNaTela),
      db.from('registros').select('funcionario_id, evento_id').in('evento_id', idsNaTela).eq('tipo', 'entrada'),
    ])
    for (const f of funcionarios ?? []) {
      const eid = (f.fornecedores as unknown as { evento_id: string })?.evento_id
      if (eid) equipePorEvento.set(eid, (equipePorEvento.get(eid) ?? 0) + 1)
    }
    // Set por evento: a mesma pessoa pode ter mais de um registro de entrada.
    for (const r of entradas ?? []) {
      const eid = r.evento_id as string
      if (!presentesPorEvento.has(eid)) presentesPorEvento.set(eid, new Set())
      presentesPorEvento.get(eid)!.add(r.funcionario_id as string)
    }
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

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil?.role)}>
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(59,130,246,0.18)' }}>
            <CalendarDays className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-800 leading-tight">Eventos</h1>
            <p className="text-slate-500 text-sm">
              {total} {total === 1 ? 'evento' : 'eventos'} · {linhasAtivas.length} ativo{linhasAtivas.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TutorialButton />
          {podeCriarEvento ? (
            <Link href="/admin/eventos/novo" data-tutorial="eventos-novo" className="btn btn-primario">
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Novo evento</span>
              <span className="sm:hidden">Novo</span>
            </Link>
          ) : (
            /* Sem isto, o botão simplesmente sumia e não havia nada explicando
               por quê — a pessoa ficava procurando onde criar evento. */
            <span className="flex items-center gap-1.5 text-slate-500 text-xs border border-slate-200 rounded-lg px-2.5 py-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              Sem licença disponível
            </span>
          )}
        </div>
      </div>

      {!total ? (
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
              <h2 className="text-2xs text-slate-500 uppercase tracking-widest font-semibold">Ativos</h2>
              {linhasAtivas.map((e, i) => (
                <EventoCard key={e.id} evento={e} podeExcluir={podeExcluir} destacar={i === 0} />
              ))}
            </section>
          )}
          {!!linhasEncerradas.length && (
            <section className="space-y-2">
              <h2 className="text-2xs text-slate-500 uppercase tracking-widest font-semibold">Encerrados</h2>
              {linhasEncerradas.map(e => <EventoCard key={e.id} evento={e} podeExcluir={podeExcluir} />)}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-2">
                  <p className="text-slate-500 text-xs">Página {page} de {totalPages}</p>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/admin/eventos?page=${page - 1}`}
                      aria-disabled={page <= 1}
                      aria-label="Página anterior"
                      className={`btn btn-secundario btn-icone ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Link>
                    <Link
                      href={`/admin/eventos?page=${page + 1}`}
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
  const semEquipe = evento.equipe === 0

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

      {/* Estado da operação: é a informação que faz alguém abrir esta tela
          durante o evento, e era exatamente a que não estava aqui. */}
      <div className="hidden sm:block w-44 shrink-0">
        {semEquipe ? (
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
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, background: 'var(--color-sucesso-600)' }}
              />
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
