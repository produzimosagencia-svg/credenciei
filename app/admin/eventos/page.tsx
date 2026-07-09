import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, MapPin, Users } from 'lucide-react'
import EventoActions from './EventoActions'
import { getPerfil, supabaseAdmin, licencasDeEventoRestantes } from '@/lib/supabase-server'
import { veTodosEventos, podeExcluirEventos } from '@/lib/permissions'

export const revalidate = 0

const PAGE_SIZE = 12

export default async function EventosPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const perfil = await getPerfil()
  const db = supabaseAdmin
  const isAdmin = veTodosEventos(perfil?.role)
  const podeExcluir = podeExcluirEventos(perfil?.role)
  const podeCriarEvento = (await licencasDeEventoRestantes(perfil)) > 0

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

  // Licenças de evento da organização (não se aplica ao master, que não tem limite)
  let limiteEventos: number | null = null
  if (!isAdmin && perfil?.organizacao_id) {
    const { data: org } = await db.from('organizacoes').select('limite_eventos').eq('id', perfil.organizacao_id).single()
    limiteEventos = org?.limite_eventos ?? 0
  }
  const licencasDisponiveis = limiteEventos !== null ? Math.max(0, limiteEventos - total) : null

  return (
    <div className="space-y-6 max-w-5xl">
      {limiteEventos !== null && (
        <div className="flex items-center justify-between gap-4 bg-brand-50 border border-brand-200 rounded-2xl px-5 py-3.5">
          <div>
            <p className="text-brand-700 font-semibold text-sm">Número de licenças compradas para evento</p>
            <p className="text-brand-500 text-xs mt-0.5">
              {total} de {limiteEventos} usada{total !== 1 ? 's' : ''} • {licencasDisponiveis} disponíve{licencasDisponiveis !== 1 ? 'is' : 'l'}
            </p>
          </div>
          <span className="text-3xl font-bold text-brand-600 shrink-0">{limiteEventos}</span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Eventos</h1>
          <p className="text-slate-500 text-sm mt-0.5">{total} eventos • {ativos?.length ?? 0} ativo{ativos?.length !== 1 ? 's' : ''}</p>
        </div>
        {podeCriarEvento && (
          <Link
            href="/admin/eventos/novo"
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2.5 rounded-xl font-semibold transition-all shadow-md shadow-brand-200"
          >
            <Plus className="w-4 h-4" />
            Novo Evento
          </Link>
        )}
      </div>

      {!total ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
          <CalendarDays className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-semibold">Nenhum evento criado</p>
          {podeCriarEvento ? (
            <>
              <p className="text-slate-400 text-sm mt-1">Crie seu primeiro evento para começar</p>
              <Link href="/admin/eventos/novo" className="inline-block mt-4 bg-brand-500 hover:bg-brand-600 text-white text-sm px-5 py-2.5 rounded-xl font-semibold transition-all shadow-md shadow-brand-200">
                Criar evento
              </Link>
            </>
          ) : (
            <p className="text-slate-400 text-sm mt-1">Fale com o administrador da plataforma para liberar uma licença de evento.</p>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {!!ativos?.length && (
            <section>
              <h2 className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-3">Ativos</h2>
              <div className="grid gap-3">
                {ativos.map(e => <EventoCard key={e.id} evento={e} podeExcluir={podeExcluir} />)}
              </div>
            </section>
          )}
          {!!encerrados?.length && (
            <section>
              <h2 className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-3">Encerrados</h2>
              <div className="grid gap-3 opacity-60">
                {encerrados.map(e => <EventoCard key={e.id} evento={e} podeExcluir={podeExcluir} />)}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 opacity-100">
                  <p className="text-slate-400 text-xs">Página {page} de {totalPages}</p>
                  <div className="flex items-center gap-1">
                    <Link
                      href={`/admin/eventos?page=${page - 1}`}
                      aria-disabled={page <= 1}
                      className={`p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors ${page <= 1 ? 'pointer-events-none opacity-30' : ''}`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Link>
                    <Link
                      href={`/admin/eventos?page=${page + 1}`}
                      aria-disabled={page >= totalPages}
                      className={`p-1.5 rounded-lg bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors ${page >= totalPages ? 'pointer-events-none opacity-30' : ''}`}
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
  )
}

function EventoCard({ evento, podeExcluir }: { evento: any; podeExcluir: boolean }) {
  const count = evento.fornecedores?.[0]?.count ?? 0
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between hover:border-brand-200 hover:shadow-md transition-all shadow-sm">
      <Link href={`/admin/eventos/${evento.id}`} className="flex-1 min-w-0 group">
        <div className="flex items-center gap-2.5 mb-1.5">
          <h3 className="text-slate-800 font-bold group-hover:text-brand-600 transition-colors">{evento.nome}</h3>
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${evento.ativo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
            {evento.ativo ? 'Ativo' : 'Encerrado'}
          </span>
        </div>
        <div className="flex items-center gap-4 text-slate-400 text-xs">
          <span className="flex items-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            {format(new Date(evento.data_inicio), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
          </span>
          {evento.local && (
            <span className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              {evento.local}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            {count} fornecedor{count !== 1 ? 'es' : ''}
          </span>
        </div>
      </Link>
      <div className="ml-4 shrink-0">
        <EventoActions eventoId={evento.id} ativo={evento.ativo} podeExcluir={podeExcluir} />
      </div>
    </div>
  )
}
