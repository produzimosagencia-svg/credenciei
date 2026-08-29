'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { marcarConversaComoLida } from '@/lib/actions-whatsapp'

/** Atualiza os Server Components sem recarregar a página nem perder o texto digitado. */
export default function AtualizacaoAoVivo({ intervaloMs = 3000, telefone, ultimaRecebidaEm }: {
  intervaloMs?: number
  telefone?: string
  ultimaRecebidaEm?: string
}) {
  const router = useRouter()
  const ultimaMarcada = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!telefone || !ultimaRecebidaEm || ultimaMarcada.current === ultimaRecebidaEm) return
    ultimaMarcada.current = ultimaRecebidaEm
    marcarConversaComoLida(telefone).then(() => router.refresh()).catch(() => undefined)
  }, [router, telefone, ultimaRecebidaEm])

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
