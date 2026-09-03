'use client'
import { useEffect } from 'react'

/**
 * Efeito de "aparecer ao rolar": tudo que tem `data-revelar` começa
 * invisível e um pouco abaixo, e ganha a classe `visivel` quando entra na
 * tela. Quem desenha o efeito é o CSS (ver `[data-revelar]` em
 * landing.module.css); aqui só se observa a rolagem.
 *
 * Roda uma vez por elemento — o efeito é de chegada, não de vaivém. Com
 * reduced-motion o CSS já mostra tudo direto, então aqui nada muda.
 */
export default function Revelar() {
  useEffect(() => {
    const alvos = Array.from(document.querySelectorAll<HTMLElement>('[data-revelar]'))
    if (!alvos.length) return
    if (!('IntersectionObserver' in window)) {
      alvos.forEach(el => el.classList.add('visivel'))
      return
    }
    const obs = new IntersectionObserver(entradas => {
      for (const e of entradas) {
        if (!e.isIntersecting) continue
        e.target.classList.add('visivel')
        obs.unobserve(e.target)
      }
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.1 })
    alvos.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [])
  return null
}
