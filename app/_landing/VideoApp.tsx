'use client'
import { useEffect, useRef, useState } from 'react'
import { Play } from 'lucide-react'

/**
 * O vídeo da seção "Em breve" (abertura do app).
 *
 * ─── AUTOPLAY NEM SEMPRE FUNCIONA, E NÃO TEM COMO FORÇAR ────────────────────
 *
 * `autoPlay`/`muted` como atributo JSX não basta no celular — iOS/Android só
 * deixam autoplay tocar quando `muted` é setado como PROPRIEDADE do elemento
 * (não só o atributo HTML que o React manda no SSR), daí o `ref` + `.play()`
 * explícito abaixo. Mas isso é só PARTE do problema: iOS com o Modo de Baixo
 * Consumo ligado BLOQUEIA autoplay de vídeo de propósito, pra economizar
 * bateria — mostra um ícone de play cortado no lugar do vídeo, e nenhum
 * código de site consegue passar por cima disso (aconteceu no celular do
 * Juan, 30/09/2026). Por isso: SEMPRE com `poster` (nunca uma tela preta
 * enquanto não toca) e um botão de play visível por cima — quando o
 * autoplay é bloqueado, a pessoa ainda vê do que se trata e pode tocar pra
 * ver (toque de verdade sempre passa, mesmo com autoplay bloqueado).
 */
export default function VideoApp({ className }: { className?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [tocando, setTocando] = useState(false)

  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    v.defaultMuted = true
    // Rejeita em silêncio quando o navegador bloqueia autoplay — o botão de
    // play manual (abaixo) é o plano B nesse caso, não um erro pra tratar.
    v.play().catch(() => {})

    /*
     * REFORÇO: o PRIMEIRO toque/clique em QUALQUER lugar da página — não
     * precisa ser no vídeo — já conta como gesto do usuário pro navegador, e
     * isso é o suficiente pra tocar mesmo quando o autoplay puro foi
     * bloqueado (Modo de Baixo Consumo, preferência de Auto-Play do
     * Safari). Sem isto, só tocava se a pessoa achasse e apertasse o botão
     * de play EM CIMA do vídeo — na prática, quase ninguém precisa mais
     * fazer isso, porque o primeiro toque em QUALQUER coisa da página já
     * resolve. Só um disparo (`once`), só enquanto ainda não está tocando.
     */
    const tentarComGesto = () => { if (v.paused) v.play().catch(() => {}) }
    document.addEventListener('pointerdown', tentarComGesto, { once: true, passive: true })
    return () => document.removeEventListener('pointerdown', tentarComGesto)
  }, [])

  const tocarManual = () => {
    videoRef.current?.play().catch(() => {})
  }

  return (
    <div className="relative">
      <video
        ref={videoRef}
        className={className}
        src="/videos/abertura-app.mp4"
        poster="/videos/abertura-app-poster.jpg"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        onPlaying={() => setTocando(true)}
        onPause={() => setTocando(false)}
      />
      {!tocando && (
        <button
          type="button"
          onClick={tocarManual}
          aria-label="Tocar vídeo"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <Play className="w-7 h-7 text-slate-900 translate-x-0.5" fill="currentColor" />
          </span>
        </button>
      )}
    </div>
  )
}
