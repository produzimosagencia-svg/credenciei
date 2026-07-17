'use client'
import { Loader2 } from 'lucide-react'
import { useFormStatus } from 'react-dom'

/**
 * Overlay de carregamento em tela cheia — feedback visual pra qualquer etapa
 * do sistema que demora (salvar, criar, importar). Sem ele, o envio de um
 * formulário de página inteira parecia travado até o redirect chegar.
 */
export function LoadingOverlay({ mensagem = 'Salvando...' }: { mensagem?: string }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" aria-live="polite" aria-busy="true">
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl px-10 py-7 flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-brand-500 animate-spin" />
        <p className="text-slate-700 text-sm font-semibold">{mensagem}</p>
      </div>
    </div>
  )
}

/**
 * Versão pra formulários de server action (sem estado próprio no client):
 * basta colocar DENTRO do <form> — aparece sozinha enquanto o envio está
 * pendente, via useFormStatus.
 */
export function FormLoadingOverlay({ mensagem }: { mensagem?: string }) {
  const { pending } = useFormStatus()
  if (!pending) return null
  return <LoadingOverlay mensagem={mensagem} />
}
