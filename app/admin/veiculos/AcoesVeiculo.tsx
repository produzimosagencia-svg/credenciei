'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { excluirVeiculo } from '@/lib/actions'
import ConfirmModal from '@/components/ConfirmModal'

/** Excluir um veículo da lista — o cadastro errado, ou o que não vem mais. */
export default function AcoesVeiculo({
  veiculoId, eventoId, placa,
}: {
  veiculoId: string
  eventoId: string
  placa: string
}) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [isPending, startTransition] = useTransition()

  const excluir = () => {
    startTransition(async () => {
      await excluirVeiculo(veiculoId, eventoId)
      setConfirmando(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => setConfirmando(true)}
        className="btn-press p-1.5 text-slate-400 hover:text-red-500 rounded-lg"
        aria-label={`Excluir veículo ${placa}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <ConfirmModal
        open={confirmando}
        onClose={() => setConfirmando(false)}
        onConfirm={excluir}
        isPending={isPending}
        mensagem={`Tirar a placa ${placa} da lista de veículos autorizados deste evento?`}
      />
    </>
  )
}
