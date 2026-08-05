'use client'
import { HelpCircle } from 'lucide-react'
import { useTutorial } from './TutorialProvider'

/**
 * Reabre o roteiro da tela a qualquer momento. Só o ícone, sem "Ver
 * tutorial" escrito ao lado — ao lado de título e outros botões da mesma
 * fileira, o texto engordava a linha e desalinhava o conjunto.
 */
export default function TutorialButton() {
  const { iniciar, ativo } = useTutorial()
  if (!ativo) return null
  return (
    <button
      type="button"
      onClick={iniciar}
      aria-label="Ver tutorial desta tela"
      title="Ver tutorial"
      className="btn btn-secundario btn-icone"
    >
      <HelpCircle className="w-4 h-4" />
    </button>
  )
}
