'use client'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { deletarUsuario } from '@/lib/actions'
import ConfirmModal from '@/components/ConfirmModal'
import { MenuAcoes, ItemMenu } from '@/components/ui/MenuAcoes'

export default function UsuarioActions({ usuarioId, usuarioNome }: { usuarioId: string; usuarioNome: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const confirmarExclusao = () => {
    startTransition(async () => {
      await deletarUsuario(usuarioId)
      router.refresh()
      setConfirmOpen(false)
    })
  }

  return (
    <div className="relative">
      <MenuAcoes disabled={isPending} rotulo={`Ações de ${usuarioNome}`}>
        {fechar => (
          <ItemMenu tom="perigo" onClick={() => { fechar(); setConfirmOpen(true) }}>
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </ItemMenu>
        )}
      </MenuAcoes>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmarExclusao}
        isPending={isPending}
        mensagem={`Excluir usuário "${usuarioNome}"? Todos os eventos e dados vinculados a ele serão removidos.`}
      />
    </div>
  )
}
