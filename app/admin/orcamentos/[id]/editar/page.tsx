import { redirect, notFound } from 'next/navigation'
import { getPerfil } from '@/lib/supabase-server'
import { podeGerenciarOrcamentos } from '@/lib/permissions'
import { orcamentoPorId } from '@/lib/orcamentos'
import { PageHeader } from '@/components/ui/Superficie'
import { numeroOrcamento } from '@/lib/orcamentos-constantes'
import OrcamentoForm from '../../OrcamentoForm'

export default async function EditarOrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarOrcamentos(perfil)) redirect('/admin')

  const { id } = await params
  const orcamento = await orcamentoPorId(id)
  if (!orcamento) notFound()

  return (
    <div className="space-y-5">
      <PageHeader titulo={`Orçamento ${numeroOrcamento(orcamento.numero)}`} voltarPara="/admin/orcamentos" />
      <OrcamentoForm orcamentoExistente={orcamento} />
    </div>
  )
}
