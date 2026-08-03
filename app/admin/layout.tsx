import { redirect } from 'next/navigation'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import AppShell from '@/components/AppShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  // Foto da organização no cabeçalho: dá identidade visual ao painel de cada
  // cliente. O master não pertence a nenhuma organização → cai nas iniciais.
  let fotoOrgUrl: string | null = null
  if (perfil.organizacao_id) {
    const { data: org } = await supabaseAdmin
      .from('organizacoes')
      .select('foto_perfil_path')
      .eq('id', perfil.organizacao_id)
      .single()
    if (org?.foto_perfil_path) {
      const { data: assinada } = await supabaseAdmin.storage
        .from('presencas')
        .createSignedUrl(org.foto_perfil_path, 60 * 60)
      fotoOrgUrl = assinada?.signedUrl ?? null
    }
  }

  return <AppShell perfil={perfil} fotoOrgUrl={fotoOrgUrl}>{children}</AppShell>
}
