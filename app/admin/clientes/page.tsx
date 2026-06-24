import { createClient } from '@/lib/supabase-server'
import { getPerfil } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Plus, Users, CalendarDays } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import ClienteActions from './ClienteActions'

export const revalidate = 0

export default async function ClientesPage() {
  const perfil = await getPerfil()
  if (perfil?.role !== 'admin') redirect('/admin')

  const supabase = await createClient()
  const { data: clientes } = await supabase
    .from('perfis')
    .select('*, eventos(count)')
    .eq('role', 'cliente')
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Clientes</h1>
          <p className="text-slate-500 text-sm mt-0.5">{clientes?.length ?? 0} cliente{clientes?.length !== 1 ? 's' : ''} cadastrado{clientes?.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/admin/clientes/novo"
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm px-4 py-2.5 rounded-xl font-semibold transition-all shadow-md shadow-orange-200"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </Link>
      </div>

      {!clientes?.length ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
          <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-semibold">Nenhum cliente cadastrado</p>
          <Link href="/admin/clientes/novo" className="inline-block mt-4 bg-orange-500 hover:bg-orange-600 text-white text-sm px-5 py-2.5 rounded-xl font-semibold transition-all shadow-md shadow-orange-200">
            Cadastrar primeiro cliente
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Cliente', 'E-mail', 'Eventos', 'Cadastrado em', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => {
                const eventoCount = (c.eventos as any)?.[0]?.count ?? 0
                return (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-slate-800 text-sm font-semibold">{c.nome}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-sm">{c.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-slate-500 text-sm">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {eventoCount}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {format(new Date(c.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3">
                      <ClienteActions clienteId={c.id} clienteNome={c.nome} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
