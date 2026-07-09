import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, Users, UserCheck, TrendingUp, ArrowRight, Circle, Plus, Building2 } from 'lucide-react'
import { getPerfil, supabaseAdmin, licencasDeEventoRestantes } from '@/lib/supabase-server'
import { veTodosEventos, ehMaster } from '@/lib/permissions'

export const revalidate = 0

export default async function AdminPage() {
  const perfil = await getPerfil()
  const db = supabaseAdmin
  const podeCriarEvento = (await licencasDeEventoRestantes(perfil)) > 0

  const eventosQuery = db.from('eventos').select('*').order('data_inicio', { ascending: false })
  if (!veTodosEventos(perfil?.role)) eventosQuery.eq('organizacao_id', perfil!.organizacao_id)

  const { data: eventos } = await eventosQuery

  const eventoIds = eventos?.map(e => e.id) ?? []
  const eventosAtivos = eventos?.filter(e => e.ativo) ?? []

  // Todas as queries abaixo dependem só de eventoIds → uma única wave em paralelo
  const [
    [
      { count: totalFornecedores },
      { count: totalFuncionarios },
      { data: ultimosRegistros },
    ],
    presencaData,
  ] = await Promise.all([
    Promise.all([
      eventoIds.length
        ? db.from('fornecedores').select('*', { count: 'exact', head: true }).in('evento_id', eventoIds)
        : Promise.resolve({ count: 0 }),
      eventoIds.length
        ? db.from('funcionarios').select('fornecedores!inner(evento_id)', { count: 'exact', head: true }).in('fornecedores.evento_id', eventoIds)
        : Promise.resolve({ count: 0 }),
      eventoIds.length
        ? db.from('registros').select('*, funcionarios(nome, cargo, empresa), eventos(nome)').in('evento_id', eventoIds).order('created_at', { ascending: false }).limit(12)
        : Promise.resolve({ data: [] }),
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

  const stats = [
    { label: 'Total de eventos', value: eventos?.length ?? 0, sub: `${eventosAtivos.length} ativo${eventosAtivos.length !== 1 ? 's' : ''}`, icon: CalendarDays, color: 'text-brand-600', bg: 'bg-brand-100', border: 'border-brand-200' },
    { label: 'Fornecedores', value: totalFornecedores ?? 0, sub: 'cadastrados', icon: Users, color: 'text-purple-600', bg: 'bg-purple-100', border: 'border-purple-200' },
    { label: 'Credenciados', value: totalFuncionarios ?? 0, sub: 'no total', icon: UserCheck, color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-200' },
    { label: 'Entradas hoje', value: entradasHoje, sub: 'registros', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-200' },
  ]

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5 hidden sm:block">{format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>
        {podeCriarEvento && (
          <Link
            href="/admin/eventos/novo"
            className="bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2.5 rounded-xl font-semibold transition-all shadow-md shadow-brand-200 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Novo Evento</span>
            <span className="sm:hidden">Novo</span>
          </Link>
        )}
      </div>

      {/* Atalhos de navegação (substituem o menu lateral) */}
      <div className={`grid grid-cols-1 gap-4 ${ehMaster(perfil?.role) ? 'sm:grid-cols-2' : ''}`}>
        {ehMaster(perfil?.role) && (
          <NavCard
            href="/admin/organizacoes"
            icon={Building2}
            title="Organizações"
            descricao="Clientes, licenças e acessos"
          />
        )}
        <NavCard
          href="/admin/eventos"
          icon={CalendarDays}
          title="Eventos"
          descricao="Gerenciar eventos, fornecedores e presença"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ label, value, sub, icon: Icon, color, bg, border }) => (
          <div key={label} className={`bg-white border ${border} rounded-2xl p-5 shadow-sm`}>
            <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl ${bg} mb-3`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <p className="text-3xl font-bold text-slate-800">{value}</p>
            <p className="text-slate-600 text-sm mt-0.5 font-medium">{label}</p>
            <p className="text-slate-400 text-xs">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {/* Eventos */}
        <div className="md:col-span-3 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-slate-800 font-bold text-base">Eventos</h2>
            <Link href="/admin/eventos" className="text-brand-500 text-xs hover:underline font-medium flex items-center gap-1">
              Ver todos <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {!eventos?.length ? (
            <div className="text-center py-10">
              <CalendarDays className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-medium text-sm">Nenhum evento criado</p>
              {podeCriarEvento && (
                <Link href="/admin/eventos/novo" className="text-brand-500 text-xs hover:underline mt-1 inline-block font-medium">Criar primeiro evento →</Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {eventos.slice(0, 6).map((e) => {
                const p = presencaData.find(p => p.evento.id === e.id)
                const pct = p && p.total > 0 ? Math.round((p.dentro / p.total) * 100) : 0
                return (
                  <Link
                    key={e.id}
                    href={`/admin/eventos/${e.id}`}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors group border border-transparent hover:border-slate-200"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Circle className={`w-2 h-2 shrink-0 ${e.ativo ? 'text-green-500 fill-green-500' : 'text-slate-300 fill-slate-300'}`} />
                      <div className="min-w-0">
                        <p className="text-slate-700 text-sm font-semibold truncate group-hover:text-brand-600 transition-colors">{e.nome}</p>
                        <p className="text-slate-400 text-xs">
                          {format(new Date(e.data_inicio), "dd/MM/yyyy", { locale: ptBR })}
                          {e.local && ` • ${e.local}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {e.ativo && p && (
                        <div className="text-right">
                          <p className="text-slate-700 text-xs font-bold">{p.dentro}/{p.total}</p>
                          <p className="text-slate-400 text-xs">presentes</p>
                        </div>
                      )}
                      <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-brand-500 transition-colors" />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Feed */}
        <div className="md:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h2 className="text-slate-800 font-bold text-base mb-5">Atividade recente</h2>
          {!ultimosRegistros?.length ? (
            <p className="text-slate-400 text-sm text-center py-10">Sem atividade ainda</p>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-80">
              {ultimosRegistros.map((r) => {
                const func = r.funcionarios as any
                return (
                  <div key={r.id} className="flex items-start gap-3">
                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${r.tipo === 'entrada' ? 'bg-green-500' : r.tipo === 'meio' ? 'bg-blue-500' : 'bg-brand-400'}`} />
                    <div className="min-w-0">
                      <p className="text-slate-700 text-xs font-semibold truncate">{func?.nome}</p>
                      <p className="text-slate-400 text-xs truncate">{func?.empresa}{func?.cargo ? ` • ${func.cargo}` : ''}</p>
                      <p className="text-slate-300 text-xs mt-0.5">
                        {r.tipo === 'entrada' ? 'Entrada' : r.tipo === 'meio' ? 'Meio' : 'Fim'} •{' '}
                        {format(new Date(r.created_at), "HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NavCard({ href, icon: Icon, title, descricao }: { href: string; icon: React.ElementType; title: string; descricao: string }) {
  return (
    <Link
      href={href}
      className="group bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 hover:border-brand-300 hover:shadow-md transition-all"
    >
      <div className="w-12 h-12 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
        <Icon className="w-6 h-6 text-brand-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-800 group-hover:text-brand-600 transition-colors">{title}</p>
        <p className="text-slate-400 text-sm">{descricao}</p>
      </div>
      <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-brand-500 transition-colors shrink-0" />
    </Link>
  )
}
