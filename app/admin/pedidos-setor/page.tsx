import { redirect } from 'next/navigation'
import { Building2 } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { veTodosEventos } from '@/lib/permissions'
import { podeDecidirPedidos } from '@/lib/pedido-setor-regras'
import { pendentesPorEvento } from '@/lib/pedidos-setor-consulta'
import { PageHeader } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'

export const revalidate = 0

/**
 * Pedidos de setor, pelo menu — pede o evento primeiro (a fila é sempre DE um evento) e mostra quantos setores
 * esperam decisão em cada um. Só admin e master.
 */
export default async function PedidosSetorPontePage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeDecidirPedidos(perfil.role)) redirect('/admin')

  const eventos = await eventosQuePossoAbrir()
  const pendentes = await pendentesPorEvento(eventos.map(e => e.id))
  const ordenados = [...eventos].sort((a, b) => (pendentes.get(b.id) ?? 0) - (pendentes.get(a.id) ?? 0))

  return (
    <div className="space-y-5">
      <PageHeader titulo="Pedidos de setor" descricao="Escolha o evento para ver os setores que os fornecedores pediram" />
      <EscolherEvento
        eventos={ordenados}
        href={id => `/admin/eventos/${id}/pedidos-setor`}
        icone={<Building2 className="w-3.5 h-3.5" />}
        titulo="Em qual evento?"
        descricao="O número mostra quantos setores aguardam a sua decisão"
        vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para receber pedidos de setor.' }}
        mostrarOrganizacao={veTodosEventos(perfil)}
        contagens={Object.fromEntries(pendentes)}
      />
    </div>
  )
}
