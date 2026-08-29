'use client'

import { useEffect, useRef } from 'react'

export default function ConversaRolagem({ ultimaMensagemId, children }: {
  ultimaMensagemId?: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const anterior = useRef<string | undefined>(undefined)

  useEffect(() => {
    const mudou = anterior.current !== ultimaMensagemId
    if (mudou) {
      ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: anterior.current ? 'smooth' : 'auto' })
      anterior.current = ultimaMensagemId
    }
  }, [ultimaMensagemId])

  return <div ref={ref} aria-live="polite" className="flex-1 space-y-2.5 overflow-y-auto p-4 lg:p-6">{children}</div>
}
