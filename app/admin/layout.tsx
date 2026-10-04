import { redirect } from 'next/navigation'
import { getPerfil, meusSetoresDoEventoAtual, meusSetores, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos } from '@/lib/permissions'
import AppShell from '@/components/AppShell'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  // Produtor é cliente do produto Gastos — não navega pelo credenciamento.
  if (perfil.role === 'produtor') redirect('/gastos')

  // Nome e foto da organização no cabeçalho, e os setores do supervisor pro
  // "Meus setores" do menu — buscados em paralelo: um não depende do outro, e
  // em série somavam duas idas ao banco na abertura de toda tela do admin. O
  // master não pertence a organização (→ "Plataforma").
  //
  // `meusVinculos` é separado de `setores` (`meusSetoresDoEventoAtual`, preso
  // ao evento do `fornecedor_id` ATUAL) — decide só se o item "Meus eventos"
  // aparece no menu, pra quem tem QUALQUER vínculo de `supervisor_setores`,
  // mesmo sem papel de supervisor (achado ao vivo, 04/10/2026, caso da Mara
  // Lúcia: ela é operadora de portão, sem `fornecedor_id`, e o vínculo dela
  // com a Stoked nunca aparecia no menu por causa disso).
  const [orgResult, setores, temEventoComBiometria, meusVinculos] = await Promise.all([
    perfil.organizacao_id
      ? supabaseAdmin
          .from('organizacoes')
          .select('nome, foto_perfil_path')
          .eq('id', perfil.organizacao_id)
          .single()
      : Promise.resolve({ data: null }),
    meusSetoresDoEventoAtual(perfil),
    organizacaoUsaBiometria(perfil.organizacao_id as string | null, podeGerenciarEventos(perfil)),
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
      temEventoComBiometria={temEventoComBiometria}
      temVinculoSupervisor={meusVinculos.length > 0}
    >
      {children}
    </AppShell>
  )
}

/**
 * O menu mostra "Biometria" só pra quem tem pelo menu UM evento configurado
 * pra usar (pedido do Juan, 02/10/2026: cliente que só usa QR Code via um
 * item no menu apontando pra uma funcionalidade que não existe pra ele).
 * Master sempre vê — gerencia evento de qualquer organização, inclusive uma
 * que ainda nem criou o primeiro evento com biometria. `null`/erro (coluna
 * nova, migração pendente) cai pro lado SEGURO de mostrar, não esconder —
 * nunca tirar acesso a uma funcionalidade por causa de uma checagem extra
 * falhando.
 */
async function organizacaoUsaBiometria(organizacaoId: string | null, relevante: boolean): Promise<boolean> {
  if (!relevante) return false
  if (!organizacaoId) return true
  try {
    const { count } = await supabaseAdmin
      .from('eventos')
      .select('id', { count: 'exact', head: true })
      .eq('organizacao_id', organizacaoId)
      .in('metodo_identificacao', ['biometria', 'biometria_qr'])
    return (count ?? 0) > 0
  } catch {
    return true
  }
}
