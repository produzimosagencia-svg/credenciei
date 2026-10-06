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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-2xs font-semibold text-emerald-300" title="Atualização automática ligada">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      Ao vivo
    </span>
  )
}
