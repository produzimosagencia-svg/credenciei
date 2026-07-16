import { redirect } from 'next/navigation'
import { getPerfil } from '@/lib/supabase-server'
import AppHeader from '@/components/AppHeader'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeader perfil={perfil} />
      <main className="max-w-6xl mx-auto p-4 md:p-8">{children}</main>
    </div>
  )
}
