import { notFound, redirect } from 'next/navigation'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { podeDecidirPedidos } from '@/lib/pedido-setor-regras'
import { contextoDoPedido, pedidosDoEvento } from '@/lib/pedidos-setor-consulta'
import { PageHeader, Aviso } from '@/components/ui/Superficie'
import PainelPedidosSetor from './PainelPedidosSetor'

export const revalidate = 0

/**
 * A fila de pedidos de setor de UM evento — só admin e master decidem (decisão do Juan, 08/10/2026).
 * O formulário público que alimenta esta fila é aberto e fechado no cartão "Pedidos de setor" da tela do evento.
 */
export default async function PedidosSetorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventoId } = await params
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeDecidirPedidos(perfil.role)) redirect(`/admin/eventos/${eventoId}`)

  const { data: evento } = await supabase.from('eventos').select('id, nome, organizacao_id').eq('id', eventoId).single()
  if (!evento) notFound()
  if (!ehMaster(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) notFound()

  const [pedidos, contexto] = await Promise.all([pedidosDoEvento(eventoId), contextoDoPedido(eventoId)])

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Pedidos de setor"
        descricao={`${evento.nome as string} — edite o que for preciso e aprove ou negue cada setor`}
        voltarPara={`/admin/eventos/${eventoId}`}
      />
      {pedidos === null ? (
        <Aviso tom="atencao">Falta rodar a atualização do banco (<code>upgrade-pedidos-de-setor.sql</code>) para esta tela funcionar.</Aviso>
      ) : (
        <PainelPedidosSetor eventoId={eventoId} pedidos={pedidos} dias={contexto.diasComFase} subeventos={contexto.subeventos} />
      )}
    </div>
  )
}
