import { redirect } from 'next/navigation'
import { getPerfil } from '@/lib/supabase-server'
import Sidebar from '@/components/Sidebar'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil()
  console.log('[admin/layout] perfil:', perfil?.email, perfil?.role)
  if (!perfil) redirect('/login')

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar perfil={perfil} />
      <main className="flex-1 p-8 overflow-auto">{children}</main>
    </div>
  )
}
