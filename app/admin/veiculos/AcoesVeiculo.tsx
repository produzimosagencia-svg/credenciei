'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Check, Ban, XCircle } from 'lucide-react'
import { excluirVeiculo, alterarStatusVeiculo } from '@/lib/actions'
import ConfirmModal from '@/components/ConfirmModal'
import type { StatusVeiculo } from '@/lib/veiculos-constantes'
import QrVeiculoModal from './QrVeiculoModal'

/** Excluir, aprovar/bloquear/cancelar e ver o QR — as ações por linha da listagem. */
export default function AcoesVeiculo({
  veiculoId, eventoId, placa, status,
}: {
  veiculoId: string
  eventoId: string
  placa: string
  status: StatusVeiculo
}) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const excluir = () => {
    startTransition(async () => {
      await excluirVeiculo(veiculoId, eventoId)
      setConfirmando(false)
      router.refresh()
    })
  }

  const mudarStatus = (novo: StatusVeiculo) => {
    setErro(null)
    startTransition(async () => {
      const r = await alterarStatusVeiculo(veiculoId, eventoId, novo)
      if (!r.ok) { setErro(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1 justify-end flex-wrap">
      {erro && <p className="text-red-600 text-2xs w-full text-right">{erro}</p>}

      {status === 'pendente' && (
        <button
          onClick={() => mudarStatus('ativo')} disabled={isPending}
          className="btn-press inline-flex items-center gap-1 text-2xs font-semibold rounded-lg px-2 py-1 text-green-700 hover:bg-green-50"
        >
          <Check className="w-3.5 h-3.5" /> Aprovar
        </button>
      )}
      {(status === 'ativo' || status === 'pendente') && (
        <button
          onClick={() => mudarStatus('bloqueado')} disabled={isPending}
          className="btn-press p-1.5 text-slate-400 hover:text-amber-600 rounded-lg"
          aria-label={`Bloquear veículo ${placa}`}
        >
          <Ban className="w-3.5 h-3.5" />
        </button>
      )}
      {status !== 'cancelado' && (
        <button
          onClick={() => mudarStatus('cancelado')} disabled={isPending}
          className="btn-press p-1.5 text-slate-400 hover:text-red-500 rounded-lg"
          aria-label={`Cancelar veículo ${placa}`}
        >
          <XCircle className="w-3.5 h-3.5" />
        </button>
      )}
      {status === 'bloqueado' && (
        <button
          onClick={() => mudarStatus('ativo')} disabled={isPending}
          className="btn-press inline-flex items-center gap-1 text-2xs font-semibold rounded-lg px-2 py-1 text-green-700 hover:bg-green-50"
        >
          <Check className="w-3.5 h-3.5" /> Reativar
        </button>
      )}

      <QrVeiculoModal veiculoId={veiculoId} eventoId={eventoId} placa={placa} />

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
    </div>
  )
}
