import { redirect } from 'next/navigation'
import { getPerfil, meusSetores, supabaseAdmin } from '@/lib/supabase-server'
import AppShell from '@/components/AppShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  // Produtor é cliente do produto Gastos — não navega pelo credenciamento.
  if (perfil.role === 'produtor') redirect('/gastos')

  // Nome e foto da organização no cabeçalho, e os setores do supervisor pro
  // "Meus setores" do menu — buscados em paralelo: um não depende do outro, e
  // em série somavam duas idas ao banco na abertura de toda tela do admin. O
  // master não pertence a organização (→ "Plataforma"); `meusSetores` devolve
  // vazio pra quem não é supervisor, sem tocar no banco.
  const [orgResult, setores] = await Promise.all([
    perfil.organizacao_id
      ? supabaseAdmin
          .from('organizacoes')
          .select('nome, foto_perfil_path')
          .eq('id', perfil.organizacao_id)
          .single()
      : Promise.resolve({ data: null }),
    meusSetores(perfil),
  ])

  const org = orgResult.data
  const orgNome: string | null = org?.nome ?? null
  let fotoOrgUrl: string | null = null
  if (org?.foto_perfil_path) {
    const { data: assinada } = await supabaseAdmin.storage
      .from('presencas')
      .createSignedUrl(org.foto_perfil_path, 60 * 60)
    fotoOrgUrl = assinada?.signedUrl ?? null
  }

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
