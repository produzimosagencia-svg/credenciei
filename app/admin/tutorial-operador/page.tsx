import { redirect } from 'next/navigation'
import { getPerfil } from '@/lib/supabase-server'
import { ehMaster, podeGerenciarUsuarios } from '@/lib/permissions'
import { PageHeader } from '@/components/ui/Superficie'
import FrameGuia from '../tutorial-supervisor/FrameGuia'

export const revalidate = 0

/**
 * Tutorial operador — o guia animado do operador de portão (acesso, scanner, subeventos, Registrar ponto e o
 * "não recebi o QR Code"), aberto pelo menu da foto de perfil. Master e administrador também entram, pra
 * poder mostrar o guia a quem designam.
 */
export default async function TutorialOperadorPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (perfil.role !== 'operador_portao' && !ehMaster(perfil.role) && !podeGerenciarUsuarios(perfil)) redirect('/admin')

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Tutorial operador"
        descricao="Como usar o scanner, o Registrar ponto e o que fazer quando a pessoa não recebeu o QR Code."
        voltarPara="/admin"
        acoes={<a href="/guia-operador" target="_blank" rel="noopener" className="btn btn-secundario">Abrir em tela cheia</a>}
      />
      <FrameGuia src="/guia-operador" titulo="Tutorial do operador de portão" />
    </div>
  )
}
