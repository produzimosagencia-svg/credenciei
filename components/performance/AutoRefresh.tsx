'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Atualiza a página sozinha, sem long-poll nem WebSocket — o projeto não tem infra de realtime hoje. */
export default function AutoRefresh({ segundos = 30 }: { segundos?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), segundos * 1000)
    return () => clearInterval(id)
  }, [router, segundos])
  return null
}
