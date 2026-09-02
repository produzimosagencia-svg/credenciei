'use client'
import { createPortal } from 'react-dom'
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
  /*
   * Renderiza num portal, fora da árvore de quem chamou.
   *
   * Sem isto, o cartão "Ao vivo" (`.evento-vivo`, `overflow: hidden` pro
   * canto arredondado) cortava o fundo escurecido do modal nas bordas dele —
   * a confirmação de excluir evento aparecia com o "AO VIVO" e o título
   * vazando por cima, sem escurecer. `overflow: hidden` corta QUALQUER
   * descendente, mesmo um com `position: fixed`, contanto que ele continue
   * dentro da árvore — só escapar de verdade (portal pro body) resolve, e
   * resolve pros outros nove lugares que usam este componente também.
   *
   * `open` sempre começa `false` em quem chama (é o `useState` inicial de
   * todo mundo que usa este modal) e só vira `true` num clique — nunca na
   * primeira renderização —, então chegar aqui já significa client-side, sem
   * precisar do estado "montado" que o portal costuma pedir.
   */
  if (!open) return null

  return createPortal(
    <div className={`fixed inset-0 ${zIndexClassName} flex items-center justify-center p-4`} onClick={() => !isPending && onClose()}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
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
            className="btn-press min-h-9 px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 disabled:opacity-50 disabled:active:scale-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="btn-press min-h-9 px-4 py-2 bg-red-500 hover:bg-red-600 disabled:opacity-50 disabled:active:scale-100 text-white text-sm font-semibold rounded-xl shadow-sm shadow-red-500/20"
          >
            {isPending ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
