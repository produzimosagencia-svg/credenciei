import { redirect } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { listarExcluidos } from '@/lib/lixeira'
import { PageHeader, Secao, EmptyState, Aviso } from '@/components/ui/Superficie'
import ListaExcluidos from './ListaExcluidos'

export const revalidate = 0

/**
 * Excluídos (lixeira) — só o master. Cada exclusão de funcionário guarda antes uma cópia completa
 * (lib/lixeira.ts); daqui o master devolve a pessoa com o MESMO QR, as batidas e os dias de trabalho.
 */
export default async function ExcluidosPage({ searchParams }: { searchParams: Promise<{ busca?: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!ehMaster(perfil.role)) redirect('/admin')

  const { busca } = await searchParams
  const excluidos = await listarExcluidos(busca)

  return (
    <div className="space-y-5">
      <PageHeader titulo="Excluídos" descricao="Pessoas excluídas de uma equipe — restaure com o mesmo QR, as batidas e os dias de trabalho" />
      {excluidos === null ? (
        <Aviso tom="atencao">Falta rodar a atualização do banco (<code>upgrade-lixeira-funcionarios.sql</code>) para a lixeira funcionar.</Aviso>
      ) : (
        <>
          <form className="flex gap-2">
            <input name="busca" defaultValue={busca ?? ''} placeholder="Nome ou CPF" className="input flex-1" />
            <button className="btn btn-secundario">Buscar</button>
          </form>
          <Secao tom="acento" icone={<Trash2 className="w-3.5 h-3.5" />} titulo={`${excluidos.length} excluído${excluidos.length === 1 ? '' : 's'}`}
            descricao="Só existem aqui as exclusões feitas depois que a lixeira foi ligada" corpoClassName={excluidos.length ? '' : 'p-4'}>
            {!excluidos.length
              ? <EmptyState icone={<Trash2 className="w-7 h-7" />} titulo={busca ? 'Ninguém encontrado com essa busca' : 'Nenhuma exclusão na lixeira'} />
              : <ListaExcluidos excluidos={excluidos} />}
          </Secao>
        </>
      )}
    </div>
  )
}
