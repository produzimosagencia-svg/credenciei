import { redirect } from 'next/navigation'
import { getPerfil } from '@/lib/supabase-server'
import AppShell from '@/components/AppShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  return <AppShell perfil={perfil}>{children}</AppShell>
}
