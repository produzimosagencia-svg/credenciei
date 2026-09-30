'use client'
import { useEffect, useRef } from 'react'

/**
 * O vídeo da seção "Em breve" (abertura do app). Client Component só por
 * causa disto: `autoPlay`/`muted` como atributo JSX não é suficiente no
 * celular — iOS/Android só deixam autoplay tocar quando `muted` é setado
 * como PROPRIEDADE do elemento de vídeo (não só o atributo HTML que o React
 * manda no SSR), e mesmo assim alguns navegadores recusam o autoplay
 * silenciosamente sem isto. Sem o `ref` + `play()` explícito, o vídeo
 * carregava mas nunca começava a rodar — no celular do Juan aparecia como
 * "não carrega" (30/09/2026).
 */
export default function VideoApp({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    v.defaultMuted = true
    // `play()` devolve uma Promise que rejeita em silêncio quando o
    // navegador bloqueia autoplay (ex.: economia de dados ligada) — sem
    // pegar o erro, isso aparecia no console como "Unhandled Promise
    // Rejection" à toa; o vídeo simplesmente fica parado no 1º quadro.
    v.play().catch(() => {})
  }, [])

  return (
    <video
      ref={videoRef}
      className={className}
      src="/videos/abertura-app.mp4"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
    />
  )
}
