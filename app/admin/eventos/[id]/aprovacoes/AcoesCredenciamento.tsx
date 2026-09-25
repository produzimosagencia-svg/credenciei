'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { aprovarCredenciamento, negarCredenciamento } from '@/lib/actions'
import ConfirmModal from '@/components/ConfirmModal'

/** Aprovar (direto, mesma aspereza de `alternarAtivacao`) ou negar (com confirmação e motivo opcional). */
export default function AcoesCredenciamento({
  funcionarioId, fornecedorId, eventoId, nome,
}: {
  funcionarioId: string
  fornecedorId: string
  eventoId: string
  nome: string
}) {
  const router = useRouter()
  const [negando, setNegando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Falha de rede de verdade (não um {error} do servidor) não pode passar em
  // branco: sem isto os botões só voltavam a ficar clicáveis, sem explicar
  // por quê — bem no meio da fila de aprovação, na porta do evento.
  const aprovar = () => {
    setErro(null)
    startTransition(async () => {
      try {
        const r = await aprovarCredenciamento(funcionarioId, fornecedorId, eventoId)
        if (!r.ok) { setErro(r.error); return }
        router.refresh()
      } catch {
        setErro('Não consegui aprovar — confira a internet e tente de novo.')
      }
    })
  }

  const negar = () => {
    setErro(null)
    startTransition(async () => {
      try {
        const r = await negarCredenciamento(funcionarioId, fornecedorId, eventoId, motivo)
        if (!r.ok) { setErro(r.error); return }
        setNegando(false)
        setMotivo('')
        router.refresh()
      } catch {
        setErro('Não consegui negar — confira a internet e tente de novo.')
      }
    })
  }

  return (
    <div className="flex items-center gap-1 justify-end flex-wrap">
      {erro && <p className="text-red-600 text-2xs w-full text-right">{erro}</p>}

      <button
        onClick={aprovar} disabled={isPending}
        className="btn-press inline-flex items-center gap-1 text-2xs font-semibold rounded-lg px-2 py-1 text-green-700 hover:bg-green-50 disabled:opacity-50"
      >
        <Check className="w-3.5 h-3.5" /> Aprovar
      </button>
      <button
        onClick={() => setNegando(true)} disabled={isPending}
        className="btn-press inline-flex items-center gap-1 text-2xs font-semibold rounded-lg px-2 py-1 text-red-600 hover:bg-red-50 disabled:opacity-50"
      >
        <X className="w-3.5 h-3.5" /> Negar
      </button>

      <ConfirmModal
        open={negando}
        onClose={() => setNegando(false)}
        onConfirm={negar}
        isPending={isPending}
        titulo="Negar credenciamento?"
        mensagem={`Você está prestes a negar o credenciamento de ${nome}. Depois de confirmar, ela será informada de que o acesso não foi autorizado.`}
        labelConfirmar="Negar credenciamento"
        labelConfirmando="Negando..."
      >
        <textarea
          value={motivo}
          onChange={e => setMotivo(e.target.value)}
          placeholder="Motivo da negativa (opcional)"
          rows={2}
          className="input w-full text-sm resize-none"
        />
      </ConfirmModal>
    </div>
  )
}
