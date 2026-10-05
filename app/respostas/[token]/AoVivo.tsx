'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Recarrega os dados do servidor sem recarregar a página nem perder o texto
 * digitado. Mais espaçado que o da aba Conversas porque aqui cada atualização
 * refaz o recorte de quem pertence ao disparo.
 */
export default function AoVivo({ intervaloMs = 8000 }: { intervaloMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, intervaloMs)
    return () => window.clearInterval(id)
  }, [intervaloMs, router])

  return (
    <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-green-700" title="Atualização automática ligada">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
      </span>
      Ao vivo
    </span>
  )
}
