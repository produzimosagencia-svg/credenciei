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
 * Pedidos de dados (POST das ações, APIs) passam direto, sem cópia nenhuma.
 *
 * TROCAR DE TELA SEM INTERNET (Juan, 19/10/2026: "clico no Registrar ponto e a tela não muda — queria alternar entre o
 * leitor e o Registrar ponto offline, e só cair se eu atualizar a página"). O Next troca de tela pedindo os dados da
 * tela nova ao servidor (pedido RSC) — sem internet esse pedido ficava pendurado. Agora, para as três telas do portão:
 *   * o pedido RSC falha RÁPIDO quando já se sabe que não há internet (ou estoura em 4 s) — o Next então abre a tela
 *     pela navegação normal do navegador, que este worker atende da cópia guardada, na hora;
 *   * as telas irmãs (leitor ↔ Registrar ponto) são guardadas junto com os arquivos delas assim que uma delas abre
 *     com internet — senão a tela que nunca foi aberta neste aparelho não teria cópia nenhuma.
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
/** Depois que a internet falhou há pouco, a espera encurta: quase certo que ainda não voltou. */
const ESPERA_PAGINA_CURTA_MS = 2500
/** Quanto esperar o pedido de dados de uma troca de tela antes de desistir (o Next abre a tela pela navegação normal). */
const ESPERA_RSC_MS = 4000
/** Por quanto tempo uma falha de internet é lembrada. */
const LEMBRA_FALHA_MS = 45_000
/** Uma cópia de tela guardada há menos que isto não é baixada de novo ao aquecer. */
const COPIA_NOVA_MS = 6 * 60 * 60 * 1000

/** Quando a internet falhou pela última vez (memória do worker; some quando ele é desligado — e tudo bem). */
let falhouEm = 0
const marcarFalha = () => { falhouEm = Date.now() }
const marcarInternet = () => { falhouEm = 0 }
const semInternetAgora = () => self.navigator.onLine === false || (falhouEm > 0 && Date.now() - falhouEm < LEMBRA_FALHA_MS)

self.addEventListener('install', () => { self.skipWaiting() })
// A internet voltou: as telas voltam a vir do servidor na hora (não precisa esperar a lembrança da falha passar).
self.addEventListener('online', marcarInternet)

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
    // Só os arquivos estáticos saem para dar lugar: as cópias das TELAS são poucas e são o que abre o portão sem internet.
    const chaves = (await cache.keys()).filter(k => new URL(k.url).pathname.startsWith('/_next/static/'))
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

/**
 * A cópia guardada da tela. Do mesmo endereço; senão, o que serve no lugar — sempre do mesmo evento:
 *   * pedido sem `?evento=`: qualquer cópia da tela (a do Registrar ponto abre direto no evento, sem a lista de eventos);
 *   * pedido COM `?evento=`: o leitor aceita a cópia sem evento (ele recebe todos os eventos da conta e escolhe), o
 *     Registrar ponto não (sem evento ele só mostraria a lista de eventos).
 */
function copiaDaTela(url) {
  const chave = url.pathname + url.search
  return caches.match(chave).then(c => {
    if (c) return c
    if (!url.searchParams.has('evento')) return caches.match(url.pathname, { ignoreSearch: true })
    return url.pathname === '/admin/localizar' ? null : caches.match(url.pathname)
  })
}

/** Tela do portão: da internet primeiro; sem resposta, a cópia guardada (por endereço, com o ?evento=). */
async function paginaDoPortao(req, url) {
  const chave = url.pathname + url.search
  // Já se sabe que está sem internet: a cópia guardada abre na hora, sem esperar a internet que não vem.
  if (semInternetAgora()) {
    const guardada = await copiaDaTela(url).catch(() => null)
    if (guardada) return guardada
  }
  const daInternet = fetch(req).then(resp => {
    marcarInternet()
    // Só guarda a página de verdade — não o redirecionamento para o login, nem erro.
    if (resp.ok && resp.type === 'basic' && !resp.redirected) void guardar(chave, resp.clone())
    return resp
  })
  daInternet.catch(() => { marcarFalha() })
  const copia = () => copiaDaTela(url)
  try {
    const demorou = new Promise(resolve => setTimeout(() => resolve(null), falhouEm > 0 ? ESPERA_PAGINA_CURTA_MS : ESPERA_PAGINA_MS))
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

/** O pedido de dados que o Next faz para trocar de tela por dentro do sistema (RSC). */
const ehPedidoDeDados = req => req.headers.get('RSC') === '1' || new URL(req.url).searchParams.has('_rsc')

/**
 * Sem internet o pedido de dados falha NA HORA (e com internet lenta, em 4 s): o Next entende a falha e abre a tela pela
 * navegação normal do navegador — que `paginaDoPortao` atende da cópia guardada. Com internet, passa direto.
 */
async function dadosDaTelaDoPortao(req) {
  if (semInternetAgora()) return Response.error()
  const controle = new AbortController()
  const prazo = setTimeout(() => controle.abort(), ESPERA_RSC_MS)
  try {
    const resp = await fetch(req, { signal: controle.signal })
    clearTimeout(prazo)
    marcarInternet()
    return resp
  } catch {
    clearTimeout(prazo)
    marcarFalha()
    return Response.error()
  }
}

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  let url
  try { url = new URL(req.url) } catch { return }
  if (url.origin !== self.location.origin) return
  if (ehArquivoEstatico(url)) { event.respondWith(arquivoEstatico(req)); return }
  if (!ehPaginaDoPortao(url)) return
  if (req.mode === 'navigate') event.respondWith(paginaDoPortao(req, url))
  else if (ehPedidoDeDados(req)) event.respondWith(dadosDaTelaDoPortao(req))
})

/** Os arquivos de /_next/static/ que o HTML da tela pede (scripts e estilos) — o que ela precisa para abrir sem internet. */
function arquivosDoHtml(html, base) {
  const achados = new Set()
  for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
    try { achados.add(new URL(m[1].replace(/&amp;/g, '&'), base).href) } catch { /* endereço estranho: ignora */ }
  }
  return [...achados]
}

/** Guarda um arquivo estático que ainda não está guardado. */
async function guardarArquivo(cache, href) {
  if (await cache.match(href)) return
  const resp = await fetch(href, { credentials: 'same-origin' })
  if (resp.ok && resp.type === 'basic') await cache.put(href, resp)
}

/**
 * Guarda a TELA e os arquivos dela, para abrir sem internet mesmo que nunca tenha sido aberta neste aparelho. Uma cópia
 * guardada há menos de 6 h não é baixada de novo. Redirecionamento (para o login, ou tela que este perfil não abre) e
 * erro não são guardados.
 */
async function aquecerTela(cache, url) {
  const chave = url.pathname + url.search
  const existente = await cache.match(chave)
  if (existente) {
    const data = Date.parse(existente.headers.get('date') || '')
    if (Number.isFinite(data) && Date.now() - data < COPIA_NOVA_MS) return
  }
  const resp = await fetch(url.href, { credentials: 'same-origin' })
  if (!(resp.ok && resp.type === 'basic' && !resp.redirected)) return
  const html = await resp.clone().text()
  await cache.put(chave, resp)
  for (const href of arquivosDoHtml(html, url.href).slice(0, 150)) {
    try { await guardarArquivo(cache, href) } catch { /* um arquivo a menos */ }
  }
}

/*
 * A tela pede para guardar o que ELA JÁ CARREGOU antes de o worker existir (a primeira visita): sem isto, a primeira
 * recarga sem internet não teria os arquivos da página. E as telas IRMÃS (leitor ↔ Registrar ponto): guardadas inteiras,
 * com os arquivos delas, para a troca de tela funcionar sem internet.
 */
self.addEventListener('message', event => {
  const dados = event.data || {}
  if (dados.tipo !== 'guardar' || !Array.isArray(dados.urls)) return
  event.waitUntil((async () => {
    const cache = await caches.open(VERSAO)
    const irmas = Array.isArray(dados.irmas) ? dados.irmas : []
    for (const u of irmas.slice(0, 4)) {
      try {
        const url = new URL(u, self.location.origin)
        if (url.origin === self.location.origin && ehPaginaDoPortao(url)) await aquecerTela(cache, url)
      } catch { /* uma tela a menos */ }
    }
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
