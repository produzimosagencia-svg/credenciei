/*
 * MODO SEM INTERNET DO PORTÃO (Juan, 18/10/2026: "a internet caiu no Luan Santana, muita gente ficou muito tempo sem
 * bater"). Este service worker só faz uma coisa: deixar as telas do portão ABRIREM sem internet, se o operador
 * recarregar a página ou o celular fechar a aba. As batidas em si ficam na fila do aparelho (lib/fila-offline.ts).
 *
 * O que ele toca, e nada além disso:
 *   * as três telas do portão (/scan, /admin/scanner, /admin/localizar) — sempre da internet primeiro; a cópia
 *     guardada só aparece quando a internet não responde;
 *   * os arquivos de /_next/static/ — que têm o nome do conteúdo (mudou o código, mudou o nome), então a cópia
 *     guardada nunca fica velha.
 * Pedidos de dados (POST das ações, RSC, APIs) passam direto, sem cópia nenhuma.
 *
 * Para DESLIGAR em todos os aparelhos: troque o corpo deste arquivo por
 *   self.addEventListener('install', () => self.skipWaiting())
 *   self.addEventListener('activate', e => e.waitUntil(self.registration.unregister()))
 */
const VERSAO = 'portao-v1'
const PAGINAS = ['/scan', '/admin/scanner', '/admin/localizar']
/** Teto de arquivos guardados: cada deploy traz arquivos novos, os antigos saem primeiro. */
const MAX_ARQUIVOS = 400
/** Com internet lenta, quanto esperar a página antes de mostrar a cópia guardada. */
const ESPERA_PAGINA_MS = 7000

self.addEventListener('install', () => { self.skipWaiting() })

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const nomes = await caches.keys()
    await Promise.all(nomes.filter(n => n.startsWith('portao-') && n !== VERSAO).map(n => caches.delete(n)))
    await self.clients.claim()
  })())
})

const ehPaginaDoPortao = url => PAGINAS.includes(url.pathname)
const ehArquivoEstatico = url => url.pathname.startsWith('/_next/static/')

async function aparar(cache) {
  try {
    const chaves = await cache.keys()
    if (chaves.length > MAX_ARQUIVOS) await Promise.all(chaves.slice(0, chaves.length - MAX_ARQUIVOS).map(k => cache.delete(k)))
  } catch { /* aparar é bônus */ }
}

async function guardar(chave, resposta) {
  try {
    const cache = await caches.open(VERSAO)
    await cache.put(chave, resposta)
    await aparar(cache)
  } catch { /* sem espaço: segue sem guardar */ }
}

/** Arquivo estático: a cópia guardada, ou da internet (e guarda). Qualquer falha cai na internet, como sem o worker. */
async function arquivoEstatico(req) {
  try {
    const guardado = await caches.match(req)
    if (guardado) return guardado
  } catch { /* segue para a internet */ }
  const resp = await fetch(req)
  if (resp.ok && resp.type === 'basic') void guardar(req, resp.clone())
  return resp
}

/** Tela do portão: da internet primeiro; sem resposta, a cópia guardada (por endereço, com o ?evento=). */
async function paginaDoPortao(req, url) {
  const chave = url.pathname + url.search
  const daInternet = fetch(req).then(resp => {
    // Só guarda a página de verdade — não o redirecionamento para o login, nem erro.
    if (resp.ok && resp.type === 'basic' && !resp.redirected) void guardar(chave, resp.clone())
    return resp
  })
  daInternet.catch(() => { /* tratado abaixo */ })
  const copia = () => caches.match(chave).then(c => c || caches.match(url.pathname, { ignoreSearch: true }))
  try {
    const demorou = new Promise(resolve => setTimeout(() => resolve(null), ESPERA_PAGINA_MS))
    const primeira = await Promise.race([daInternet, demorou])
    if (primeira) return primeira
    // Internet lenta: com cópia, mostra a cópia; sem cópia, continua esperando a internet.
    return (await copia()) || (await daInternet)
  } catch {
    const guardada = await copia()
    if (guardada) return guardada
    throw new Error('sem internet e sem cópia guardada')
  }
}

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  let url
  try { url = new URL(req.url) } catch { return }
  if (url.origin !== self.location.origin) return
  if (ehArquivoEstatico(url)) { event.respondWith(arquivoEstatico(req)); return }
  if (req.mode === 'navigate' && ehPaginaDoPortao(url)) event.respondWith(paginaDoPortao(req, url))
})

/*
 * A tela pede para guardar o que ELA JÁ CARREGOU antes de o worker existir (a primeira visita): sem isto, a primeira
 * recarga sem internet não teria os arquivos da página.
 */
self.addEventListener('message', event => {
  const dados = event.data || {}
  if (dados.tipo !== 'guardar' || !Array.isArray(dados.urls)) return
  event.waitUntil((async () => {
    const cache = await caches.open(VERSAO)
    for (const u of dados.urls.slice(0, 200)) {
      try {
        const url = new URL(u, self.location.origin)
        if (url.origin !== self.location.origin) continue
        const ehPagina = ehPaginaDoPortao(url)
        if (!ehPagina && !ehArquivoEstatico(url)) continue
        const chave = ehPagina ? url.pathname + url.search : url.href
        if (await cache.match(chave)) continue
        const resp = await fetch(url.href, { credentials: 'same-origin' })
        if (resp.ok && resp.type === 'basic' && !resp.redirected) await cache.put(chave, resp)
      } catch { /* um arquivo a menos */ }
    }
    await aparar(cache)
  })())
})
