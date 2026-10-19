'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Recarrega os dados da tela (Server Component) de tempos em tempos, só com a aba à vista. */
export default function AtualizarSozinho({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) router.refresh() }, segundos * 1000)
    return () => clearInterval(id)
  }, [router, segundos])
  return null
}
