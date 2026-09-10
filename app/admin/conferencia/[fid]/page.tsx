import { notFound, redirect } from 'next/navigation'
import { getPerfil, meusSetores, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos, ehMaster } from '@/lib/permissions'
import { suporteTemEscopo } from '@/lib/suporte'
import { estadoConferencia } from '@/lib/conferencia'
import { PageHeader } from '@/components/ui/Superficie'
import ConferenciaEquipe from './ConferenciaEquipe'

export const revalidate = 0

/**
 * Conferência de equipe de UM setor (`fid` = fornecedor).
 *
 * Quem entra: o supervisor DO setor (o alvo do pedido), o admin/master da
 * organização e o suporte no escopo. A régua é a mesma de `exigirSetor` em
 * lib/actions-conferencia.ts — repetida aqui só pra decidir se abre a tela.
 */
export default async function ConferenciaPage({ params }: { params: Promise<{ fid: string }> }) {
  const { fid } = await params
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const { data: setor } = await supabaseAdmin
    .from('fornecedores')
    .select('id, evento_id, eventos(organizacao_id)')
    .eq('id', fid)
    .maybeSingle()
  if (!setor) notFound()
  const orgId = (setor.eventos as unknown as { organizacao_id: string | null } | null)?.organizacao_id ?? null

  let permitido = ehMaster(perfil.role)
    || (podeGerenciarEventos(perfil) && !!orgId && orgId === perfil.organizacao_id)
  if (!permitido && perfil.role === 'supervisor') {
    permitido = (await meusSetores(perfil)).some(s => s.id === fid)
  }
  if (!permitido && perfil.role === 'suporte') {
    permitido = await suporteTemEscopo(perfil.id, { eventoId: setor.evento_id as string, organizacaoId: orgId ?? undefined })
  }
  if (!permitido) notFound()

  const estado = await estadoConferencia(fid)
  if (!estado) notFound()

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        voltarPara={`/admin/eventos/${estado.eventoId}/fornecedor/${fid}`}
        titulo="Conferência de equipe"
        descricao={`${estado.setorNome} · ${estado.eventoNome}`}
      />
      <ConferenciaEquipe estado={estado} />
    </div>
  )
}
