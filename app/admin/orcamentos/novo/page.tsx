import { redirect } from 'next/navigation'
import { getPerfil } from '@/lib/supabase-server'
import { podeGerenciarOrcamentos } from '@/lib/permissions'
import { PageHeader } from '@/components/ui/Superficie'
import OrcamentoForm from '../OrcamentoForm'

export default async function NovoOrcamentoPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarOrcamentos(perfil)) redirect('/admin')

  return (
    <div className="space-y-5">
      <PageHeader titulo="Novo orçamento" voltarPara="/admin/orcamentos" />
      <OrcamentoForm />
    </div>
  )
}
