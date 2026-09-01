import { redirect } from 'next/navigation'
import { getPerfil, meusSetores, supabaseAdmin } from '@/lib/supabase-server'
import AppShell from '@/components/AppShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  // Nome e foto da organização no cabeçalho: é o "contexto" da barra superior
  // (marca › organização), que diz de quem é o painel aberto. O master não
  // pertence a nenhuma organização → o AppShell mostra "Plataforma".
  let fotoOrgUrl: string | null = null
  let orgNome: string | null = null
  if (perfil.organizacao_id) {
    const { data: org } = await supabaseAdmin
      .from('organizacoes')
      .select('nome, foto_perfil_path')
      .eq('id', perfil.organizacao_id)
      .single()
    orgNome = org?.nome ?? null
    if (org?.foto_perfil_path) {
      const { data: assinada } = await supabaseAdmin.storage
        .from('presencas')
        .createSignedUrl(org.foto_perfil_path, 60 * 60)
      fotoOrgUrl = assinada?.signedUrl ?? null
    }
  }

  // Os setores do supervisor alimentam o "Meus setores" do menu. Devolve
  // vazio para os outros papéis, e o item some sozinho.
  const setores = await meusSetores(perfil)

  return (
    <AppShell
      perfil={perfil}
      fotoOrgUrl={fotoOrgUrl}
      orgNome={orgNome}
      setores={setores}
      setorAtualId={(perfil.fornecedor_id as string | null) ?? null}
    >
      {children}
    </AppShell>
  )
}
