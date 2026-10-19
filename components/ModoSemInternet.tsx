'use client'
import { useEffect } from 'react'
import { eventoDoPortao, guardarEventoDoPortao, percebeuRede, semRedeAgora } from '@/lib/rede-do-portao'

/** As telas do portão — as mesmas que o service worker (public/sw.js) guarda. */
const TELAS = ['/scan', '/admin/scanner', '/admin/localizar']

/** As telas que o operador alterna com esta — guardadas junto, para a troca funcionar sem internet. */
const IRMAS: Record<string, string[]> = {
  '/scan': ['/admin/localizar'],
  '/admin/scanner': ['/admin/localizar'],
  '/admin/localizar': ['/scan', '/admin/scanner'],
}

/**
 * Liga o modo sem internet nas telas do portão (public/sw.js): a página volta a abrir mesmo sem internet, se o
 * operador recarregar. Só existe nas telas que o usam (leitor e Registrar ponto) — o resto do sistema não registra
 * nada. Falhar aqui não muda nada na tela: ela continua funcionando com internet, como sempre.
 *
 * TROCAR DE TELA SEM INTERNET (Juan, 19/10/2026: "clico no Registrar ponto e a tela não muda"):
 *   * junto com esta tela, o worker guarda as telas irmãs (leitor ↔ Registrar ponto) e os arquivos delas;
 *   * sem internet, o clique num link para outra tela do portão abre a tela guardada pela navegação normal, direto —
 *     o Next tentaria pedir os dados ao servidor e ficaria esperando. Com internet, nada disto age.
 */
export default function ModoSemInternet({ eventoId }: { eventoId?: string }) {
  useEffect(() => {
    if (eventoId) guardarEventoDoPortao(eventoId)
  }, [eventoId])

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
        // As telas irmãs, no mesmo evento — só com internet (sem ela não há o que baixar).
        const evento = eventoId || eventoDoPortao()
        const irmas = navigator.onLine === false ? [] : (IRMAS[location.pathname] ?? []).map(p => (evento ? `${p}?evento=${evento}` : p))
        reg.active.postMessage({ tipo: 'guardar', urls: [location.href, ...arquivos], irmas })
      })
      .catch(() => { /* navegador sem service worker: a tela segue igual */ })
    return () => { cancelado = true }
  }, [eventoId])

  useEffect(() => {
    const aoClicar = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      if (!semRedeAgora()) return
      const link = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || (link.target && link.target !== '_self') || link.hasAttribute('download')) return
      let url: URL
      try { url = new URL(link.href, location.href) } catch { return }
      if (url.origin !== location.origin || !TELAS.includes(url.pathname)) return
      // Sem evento no endereço, abre a tela do evento em que este aparelho está trabalhando (a cópia guardada é dele).
      const evento = eventoId || eventoDoPortao()
      if (evento && !url.searchParams.has('evento')) url.searchParams.set('evento', evento)
      e.preventDefault()
      e.stopPropagation()
      location.assign(`${url.pathname}${url.search}${url.hash}`)
    }
    // Na captura, antes do Next: o clique no link do Next pediria os dados ao servidor e ficaria esperando a internet.
    document.addEventListener('click', aoClicar, true)
    const aoVoltar = () => percebeuRede()
    window.addEventListener('online', aoVoltar)
    return () => {
      document.removeEventListener('click', aoClicar, true)
      window.removeEventListener('online', aoVoltar)
    }
  }, [eventoId])

  return null
}
