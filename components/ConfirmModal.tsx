'use client'
import { AlertTriangle } from 'lucide-react'

/**
 * Modal de confirmação genérico (substitui window.confirm() nativo).
 * Controlado pelo pai: quem chama já tem seu próprio useTransition/isPending
 * e decide o que fazer em onConfirm (redirect, router.refresh, try/catch...).
 */
export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  titulo = 'Confirmar exclusão',
  mensagem,
  isPending,
  zIndexClassName = 'z-50',
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  titulo?: string
  mensagem: string
  isPending?: boolean
  zIndexClassName?: string
}) {
  if (!open) return null
  return (
    <div className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4`} onClick={() => !isPending && onClose()}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <div className="min-w-0">
            <h2 className="text-slate-800 font-bold">{titulo}</h2>
            <p className="text-slate-500 text-sm mt-1">{mensagem}</p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            {isPending ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>
  )
}
