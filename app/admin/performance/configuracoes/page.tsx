import { redirect } from 'next/navigation'
import { getPerfil } from '@/lib/supabase-server'
import { podeGerenciarPerformance } from '@/lib/permissions'
import { listarServicos } from '@/lib/performance'
import { PageHeader } from '@/components/ui/Superficie'
import ConfigServicos from './ConfigServicos'

export const revalidate = 0

export default async function ConfiguracoesPerformancePage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarPerformance(perfil)) redirect('/admin')

  const servicos = await listarServicos()

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Configurações do Painel de Performance"
        descricao="Intervalo de checagem, limiares de atenção/crítico e serviços monitorados"
        voltarPara="/admin/performance"
      />
      <ConfigServicos servicos={servicos} />
    </div>
  )
}
