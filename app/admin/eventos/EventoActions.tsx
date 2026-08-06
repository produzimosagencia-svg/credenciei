'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Trash2, Power } from 'lucide-react'
import { toggleAtivoEvento, deletarEvento } from '@/lib/actions'
import ConfirmModal from '@/components/ConfirmModal'
import { MenuAcoes, ItemMenu } from '@/components/ui/MenuAcoes'

export default function EventoActions({ eventoId, ativo, podeExcluir = false }: { eventoId: string; ativo: boolean; podeExcluir?: boolean }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <div className="relative">
      <MenuAcoes disabled={isPending} rotulo="Ações do evento">
        {fechar => (
          <>
            <ItemMenu
              onClick={() => { fechar(); router.push(`/admin/eventos/${eventoId}/editar`) }}
            >
              <Pencil className="w-3.5 h-3.5" /> Editar
            </ItemMenu>
            <ItemMenu
              onClick={() => { fechar(); startTransition(() => toggleAtivoEvento(eventoId, ativo)) }}
            >
              <Power className="w-3.5 h-3.5" />
              {ativo ? 'Encerrar' : 'Reativar'}
            </ItemMenu>
            {podeExcluir && (
              <ItemMenu tom="perigo" onClick={() => { fechar(); setConfirmOpen(true) }}>
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </ItemMenu>
            )}
          </>
        )}
      </MenuAcoes>

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => startTransition(() => deletarEvento(eventoId))}
        isPending={isPending}
        mensagem="Tem certeza? Isso vai apagar o evento e todos os dados relacionados."
      />
    </div>
  )
}
