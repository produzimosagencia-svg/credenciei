'use client'
import { useEffect } from 'react'

/**
 * Liga o modo sem internet nas telas do portão (public/sw.js): a página volta a abrir mesmo sem internet, se o
 * operador recarregar. Só existe nas telas que o usam (leitor e Registrar ponto) — o resto do sistema não registra
 * nada. Falhar aqui não muda nada na tela: ela continua funcionando com internet, como sempre.
 */
export default function ModoSemInternet() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return
    let cancelado = false
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .then(() => navigator.serviceWorker.ready)
      .then(reg => {
        if (cancelado || !reg.active) return
        // O que esta tela já carregou antes de o worker existir: a própria página e os arquivos dela.
        const arquivos = performance.getEntriesByType('resource')
          .map(e => e.name)
          .filter(u => u.startsWith(`${location.origin}/_next/static/`))
        reg.active.postMessage({ tipo: 'guardar', urls: [location.href, ...arquivos] })
      })
      .catch(() => { /* navegador sem service worker: a tela segue igual */ })
    return () => { cancelado = true }
  }, [])
  return null
}
