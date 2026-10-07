import { redirect } from 'next/navigation'
import { getPerfil } from '@/lib/supabase-server'
import { ehMaster, podeGerenciarUsuarios } from '@/lib/permissions'
import { PageHeader } from '@/components/ui/Superficie'
import FrameGuia from './FrameGuia'

export const revalidate = 0

/**
 * Tutorial supervisor — o guia animado de acesso e cadastro de equipe (por link
 * e por planilha), aberto pelo menu da foto de perfil. O supervisor é o público;
 * master e administrador também entram, pra poder mostrar o guia a quem designam.
 */
export default async function TutorialSupervisorPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (perfil.role !== 'supervisor' && !ehMaster(perfil.role) && !podeGerenciarUsuarios(perfil)) redirect('/admin')

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Tutorial supervisor"
        descricao="Como funciona o seu acesso e como montar a equipe, por link e por planilha."
        voltarPara="/admin"
        acoes={<a href="/guia-supervisor" target="_blank" rel="noopener" className="btn btn-secundario">Abrir em tela cheia</a>}
      />
      <FrameGuia />
    </div>
  )
}
