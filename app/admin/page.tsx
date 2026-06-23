import Link from 'next/link'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { CalendarDays, Users, UserCheck, TrendingUp, ArrowRight, Circle } from 'lucide-react'
import { getPerfil, createClient } from '@/lib/supabase-server'

export const revalidate = 0

export default async function AdminPage() {
  const perfil = await getPerfil()
  const db = await createClient()
  const isAdmin = perfil?.role === 'admin'

  const eventosQuery = db.from('eventos').select('*').order('data_inicio', { ascending: false })
  if (!isAdmin) eventosQuery.eq('cliente_id', perfil!.id)

  const { data: eventos } = await eventosQuery

  const eventoIds = eventos?.map(e => e.id) ?? []

  const [
    { count: totalFornecedores },
    { count: totalFuncionarios },
    { data: ultimosRegistros },
  ] = await Promise.all([
    eventoIds.length
      ? db.from('fornecedores').select('*', { count: 'exact', head: true }).in('evento_id', eventoIds)
      : Promise.resolve({ count: 0 }),
    eventoIds.length
      ? db.from('funcionarios').select('fornecedores!inner(evento_id)', { count: 'exact', head: true }).in('fornecedores.evento_id', eventoIds)
      : Promise.resolve({ count: 0 }),
    eventoIds.length
      ? db.from('registros').select('*, funcionarios(nome, cargo, empresa), eventos(nome)').in('evento_id', eventoIds).order('created_at', { ascending: false }).limit(12)
      : Promise.resolve({ data: [] }),
  ])

  const eventosAtivos = eventos?.filter(e => e.ativo) ?? []

  // Busca contagens de presença para eventos ativos
  const presencaData = await Promise.all(
    eventosAtivos.map(async (e) => {
      const [{ count: dentro }, { count: total }] = await Promise.all([
        db
          .from('registros')
          .select('funcionario_id', { count: 'exact', head: true })
          .eq('evento_id', e.id)
          .eq('tipo', 'entrada'),
        db
          .from('funcionarios')
          .select('fornecedores!inner(evento_id)', { count: 'exact', head: true })
          .eq('fornecedores.evento_id', e.id),
      ])
      return { evento: e, dentro: dentro ?? 0, total: total ?? 0 }
    })
  )

  const stats = [
    { label: 'Total de eventos', value: eventos?.length ?? 0, sub: `${eventosAtivos.length} ativo${eventosAtivos.length !== 1 ? 's' : ''}`, icon: CalendarDays, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Fornecedores', value: totalFornecedores ?? 0, sub: 'cadastrados', icon: Users, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Credenciados', value: totalFuncionarios ?? 0, sub: 'no total', icon: UserCheck, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Entradas hoje', value: ultimosRegistros?.filter(r => r.tipo === 'entrada' && new Date(r.created_at).toDateString() === new Date().toDateString()).length ?? 0, sub: 'registros', icon: TrendingUp, color: 'text-orange-400', bg: 'bg-orange-500/10' },
  ]

  return (
    <div className="space-y-8 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">{format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</p>
        </div>
        <Link
          href="/admin/eventos/novo"
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          + Novo Evento
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <div key={label} className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
            <div className={`inline-flex items-center justify-center w-9 h-9 rounded-lg ${bg} mb-3`}>
              <Icon className={`w-4 h-4 ${color}`} />
            </div>
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-slate-400 text-xs mt-0.5">{label}</p>
            <p className="text-slate-600 text-xs">{sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-6">
        {/* Eventos ativos com presença */}
        <div className="col-span-3 bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-semibold">Eventos</h2>
            <Link href="/admin/eventos" className="text-blue-400 text-xs hover:underline flex items-center gap-1">
              Gerenciar <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {!eventos?.length ? (
            <div className="text-center py-10">
              <CalendarDays className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-slate-500 text-sm">Nenhum evento criado</p>
              <Link href="/admin/eventos/novo" className="text-blue-400 text-xs hover:underline mt-1 inline-block">Criar primeiro evento</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {eventos.slice(0, 6).map((e) => {
                const p = presencaData.find(p => p.evento.id === e.id)
                const pct = p && p.total > 0 ? Math.round((p.dentro / p.total) * 100) : 0
                return (
                  <Link
                    key={e.id}
                    href={`/admin/eventos/${e.id}`}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-[#21262d] transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Circle className={`w-2 h-2 shrink-0 ${e.ativo ? 'text-green-400 fill-green-400' : 'text-slate-600 fill-slate-600'}`} />
                      <div className="min-w-0">
                        <p className="text-white text-sm font-medium truncate">{e.nome}</p>
                        <p className="text-slate-500 text-xs">
                          {format(new Date(e.data_inicio), "dd/MM/yyyy", { locale: ptBR })}
                          {e.local && ` • ${e.local}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {e.ativo && p && (
                        <div className="text-right">
                          <p className="text-white text-xs font-medium">{p.dentro}/{p.total}</p>
                          <p className="text-slate-500 text-xs">presentes</p>
                        </div>
                      )}
                      <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Feed de atividade */}
        <div className="col-span-2 bg-[#161b22] border border-[#30363d] rounded-xl p-6">
          <h2 className="text-white font-semibold mb-5">Atividade recente</h2>
          {!ultimosRegistros?.length ? (
            <p className="text-slate-500 text-sm text-center py-10">Sem atividade ainda</p>
          ) : (
            <div className="space-y-3 overflow-y-auto max-h-80">
              {ultimosRegistros.map((r) => {
                const func = r.funcionarios as any
                return (
                  <div key={r.id} className="flex items-start gap-3">
                    <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${r.tipo === 'entrada' ? 'bg-green-400' : 'bg-yellow-400'}`} />
                    <div className="min-w-0">
                      <p className="text-white text-xs font-medium truncate">{func?.nome}</p>
                      <p className="text-slate-500 text-xs truncate">{func?.empresa} • {func?.cargo}</p>
                      <p className="text-slate-600 text-xs mt-0.5">
                        {r.tipo === 'entrada' ? 'Entrou' : 'Saiu'} •{' '}
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
