import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Plus, CalendarDays, MapPin, Users } from 'lucide-react'
import EventoActions from './EventoActions'
import { getPerfil, createClient } from '@/lib/supabase-server'

export const revalidate = 0

export default async function EventosPage() {
  const perfil = await getPerfil()
  const db = await createClient()
  const isAdmin = perfil?.role === 'admin'

  const query = db.from('eventos').select('*, fornecedores(count)').order('data_inicio', { ascending: false })
  if (!isAdmin) query.eq('cliente_id', perfil!.id)

  const { data: eventos } = await query

  const ativos = eventos?.filter(e => e.ativo) ?? []
  const encerrados = eventos?.filter(e => !e.ativo) ?? []

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Eventos</h1>
          <p className="text-slate-500 text-sm mt-0.5">{eventos?.length ?? 0} eventos • {ativos.length} ativo{ativos.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/admin/eventos/novo"
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm px-4 py-2.5 rounded-xl font-semibold transition-all shadow-md shadow-orange-200"
        >
          <Plus className="w-4 h-4" />
          Novo Evento
        </Link>
      </div>

      {!eventos?.length ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
          <CalendarDays className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-semibold">Nenhum evento criado</p>
          <p className="text-slate-400 text-sm mt-1">Crie seu primeiro evento para começar</p>
          <Link href="/admin/eventos/novo" className="inline-block mt-4 bg-orange-500 hover:bg-orange-600 text-white text-sm px-5 py-2.5 rounded-xl font-semibold transition-all shadow-md shadow-orange-200">
            Criar evento
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {ativos.length > 0 && (
            <section>
              <h2 className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-3">Ativos</h2>
              <div className="grid gap-3">
                {ativos.map(e => <EventoCard key={e.id} evento={e} />)}
              </div>
            </section>
          )}
          {encerrados.length > 0 && (
            <section>
              <h2 className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-3">Encerrados</h2>
              <div className="grid gap-3 opacity-60">
                {encerrados.map(e => <EventoCard key={e.id} evento={e} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}

function EventoCard({ evento }: { evento: any }) {
  const count = evento.fornecedores?.[0]?.count ?? 0
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center justify-between hover:border-orange-200 hover:shadow-md transition-all shadow-sm">
      <Link href={`/admin/eventos/${evento.id}`} className="flex-1 min-w-0 group">
        <div className="flex items-center gap-2.5 mb-1.5">
          <h3 className="text-slate-800 font-bold group-hover:text-orange-600 transition-colors">{evento.nome}</h3>
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
        <EventoActions eventoId={evento.id} ativo={evento.ativo} />
      </div>
    </div>
  )
}
