'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

const INTERVALO_MS = 15_000

/** Atualiza a página sozinha (polling) — sem UI própria. */
export default function AutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), INTERVALO_MS)
    return () => clearInterval(id)
  }, [router])

  return null
}
