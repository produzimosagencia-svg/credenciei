'use client'
import { HelpCircle } from 'lucide-react'
import { useTutorial } from './TutorialProvider'

/** Botão "Ver tutorial" — reabre o roteiro da tela a qualquer momento. */
export default function TutorialButton() {
  const { iniciar, ativo } = useTutorial()
  if (!ativo) return null
  return (
    <button
      type="button"
      onClick={iniciar}
      className="btn-press flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-brand-600 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm transition-colors shrink-0"
    >
      <HelpCircle className="w-3.5 h-3.5" />
      Ver tutorial
    </button>
  )
}
