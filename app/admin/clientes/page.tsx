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
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-slate-400 text-sm mt-0.5">{clientes?.length ?? 0} cliente{clientes?.length !== 1 ? 's' : ''} cadastrado{clientes?.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/admin/clientes/novo"
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Novo Cliente
        </Link>
      </div>

      {!clientes?.length ? (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-16 text-center">
          <Users className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-400 font-medium">Nenhum cliente cadastrado</p>
          <Link href="/admin/clientes/novo" className="inline-block mt-4 bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            Cadastrar primeiro cliente
          </Link>
        </div>
      ) : (
        <div className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#30363d]">
                {['Cliente', 'E-mail', 'Eventos', 'Cadastrado em', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-slate-500 font-medium uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {clientes.map(c => {
                const eventoCount = (c.eventos as any)?.[0]?.count ?? 0
                return (
                  <tr key={c.id} className="border-b border-[#30363d]/40 hover:bg-[#1c2128] transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-white text-sm font-medium">{c.nome}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-sm">{c.email}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-slate-400 text-sm">
                        <CalendarDays className="w-3.5 h-3.5" />
                        {eventoCount}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
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
