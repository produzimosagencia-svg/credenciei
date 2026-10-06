'use client'

import { useParams } from 'next/navigation'

/**
 * As duas colunas do atendimento. No computador ficam lado a lado; no celular
 * cabe uma só, então a lista some quando há conversa aberta e volta quando não.
 *
 * Vive na moldura, e não em cada página, para a lista não ser remontada a cada
 * conversa clicada: a busca digitada e a posição da rolagem continuam onde
 * estavam.
 */
export default function Colunas({ lista, children }: { lista: React.ReactNode; children: React.ReactNode }) {
  const { telefone } = useParams<{ telefone?: string }>()

  return (
    <div className="grid h-full min-h-0 lg:grid-cols-[360px_minmax(0,1fr)]">
      <div className={`min-h-0 ${telefone ? 'hidden lg:block' : ''}`}>{lista}</div>
      <div className={`min-h-0 min-w-0 ${telefone ? '' : 'hidden lg:block'}`}>{children}</div>
    </div>
  )
}
