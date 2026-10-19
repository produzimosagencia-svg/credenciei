/*
 * O SERVICE WORKER DO PORTÃO, DE VERDADE (Juan, 19/10/2026: "clico no Registrar ponto e a tela não muda — queria
 * alternar entre o leitor e o Registrar ponto sem internet"). O public/sw.js roda aqui dentro de um ambiente simulado
 * (cache, rede e relógio de mentira) e o teste faz os pedidos que o navegador faria:
 *
 *   1. troca de tela (pedido de dados do Next): sem internet falha NA HORA, com internet passa, e a falha é lembrada;
 *   2. abrir a tela (navegação): sem internet abre a cópia guardada — e nunca a cópia de OUTRO evento;
 *   3. guardar as telas irmãs com os arquivos delas, sem baixar de novo o que está recente, sem guardar redirecionamento;
 *   4. o limite de arquivos nunca apaga as cópias das telas.
 *
 * Roda com: node testes/service-worker-portao.mjs
 */
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const raiz = new URL('..', import.meta.url).pathname
const codigo = readFileSync(raiz + 'public/sw.js', 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const ORIGEM = 'https://credenciei.test'
const esperar = ms => new Promise(r => setTimeout(r, ms))

function montar() {
  const ouvintes = {}
  const guardados = new Map()
  const rede = { estado: 'ok', chamadas: [], rotas: new Map() }

  const achar = (k, { ignoreSearch } = {}) => {
    const alvo = new URL(typeof k === 'string' ? k : k.url, ORIGEM)
    for (const [href, r] of guardados) {
      const u = new URL(href)
      if (ignoreSearch ? u.pathname === alvo.pathname : u.href === alvo.href) return r.clone()
    }
    return undefined
  }
  const cache = {
    put: async (k, r) => { guardados.set(new URL(typeof k === 'string' ? k : k.url, ORIGEM).href, r) },
    match: async (k, o) => achar(k, o),
    keys: async () => [...guardados.keys()].map(url => ({ url })),
    delete: async k => guardados.delete(new URL(typeof k === 'string' ? k : k.url, ORIGEM).href),
  }
  const fetchFalso = (req, init = {}) => {
    const url = new URL(typeof req === 'string' ? req : req.url, ORIGEM).href
    rede.chamadas.push(url)
    if (rede.estado === 'cai') return Promise.reject(new TypeError('Failed to fetch'))
    if (rede.estado === 'trava') return new Promise((_, rej) => { init.signal?.addEventListener('abort', () => rej(new Error('abortado'))) })
    const rota = rede.rotas.get(url)
    const resp = new Response(rota?.html ?? 'nao achei', { status: rota ? 200 : 404, headers: { date: rota?.date ?? new Date().toUTCString(), 'content-type': 'text/html' } })
    Object.defineProperty(resp, 'type', { value: 'basic' })
    if (rota?.redirecionada) Object.defineProperty(resp, 'redirected', { value: true })
    return Promise.resolve(resp)
  }

  const eu = {
    location: { origin: ORIGEM },
    navigator: { onLine: true },
    addEventListener: (tipo, f) => { (ouvintes[tipo] ??= []).push(f) },
    skipWaiting() {},
    clients: { claim: async () => {} },
  }
  const caixa = {
    self: eu, fetch: fetchFalso, Response, Request, Headers, URL, AbortController, console, clearTimeout,
    // As esperas longas do worker (4 s, 7 s) viram 20 ms: o teste não precisa esperar de verdade.
    setTimeout: (f, ms, ...a) => setTimeout(f, ms >= 1000 ? 20 : ms, ...a),
    caches: { open: async () => cache, match: async (k, o) => achar(k, o), keys: async () => ['portao-v1'], delete: async () => true },
  }
  vm.runInNewContext(codigo, caixa)

  const pedir = req => {
    let resposta = null
    for (const f of ouvintes.fetch ?? []) f({ request: req, respondWith: p => { resposta = p } })
    return resposta
  }
  const navegar = caminho => ({ method: 'GET', url: ORIGEM + caminho, mode: 'navigate', headers: new Headers() })
  const dados = caminho => ({ method: 'GET', url: ORIGEM + caminho, mode: 'cors', headers: new Headers({ RSC: '1' }) })
  const mensagem = async dadosDaMensagem => {
    let espera = null
    for (const f of ouvintes.message ?? []) f({ data: dadosDaMensagem, waitUntil: p => { espera = p } })
    await espera
  }
  const semInternet = () => { eu.navigator.onLine = false; rede.estado = 'cai' }
  const comInternet = () => { eu.navigator.onLine = true; rede.estado = 'ok' }
  const guardar = (caminho, html) => cache.put(caminho, new Response(html, { headers: { date: new Date().toUTCString() } }))
  const tentar = async p => { try { return { resp: await p } } catch (erro) { return { erro } } }
  return { ouvintes, guardados, rede, eu, pedir, navegar, dados, mensagem, semInternet, comInternet, guardar, tentar }
}

console.log('1 · Trocar de tela (o pedido de dados do Next)')
{
  const t = montar()
  t.semInternet()
  let r = await t.pedir(t.dados('/admin/localizar?evento=ev-1&_rsc=abc'))
  ok(r.type === 'error' && !t.rede.chamadas.length, 'sem internet o pedido falha NA HORA, sem nem tentar a rede — o Next abre a tela pela navegação normal')

  t.comInternet()
  t.rede.rotas.set(`${ORIGEM}/admin/localizar?evento=ev-1&_rsc=abc`, { html: 'flight' })
  r = await t.pedir(t.dados('/admin/localizar?evento=ev-1&_rsc=abc'))
  ok(r.status === 200 && (await r.text()) === 'flight' && t.rede.chamadas.length === 1, 'com internet o pedido passa direto, sem alteração')

  t.rede.estado = 'cai'
  r = await t.pedir(t.dados('/admin/localizar?evento=ev-1&_rsc=def'))
  const depois = t.rede.chamadas.length
  r = await t.pedir(t.dados('/admin/localizar?evento=ev-1&_rsc=ghi'))
  ok(r.type === 'error' && t.rede.chamadas.length === depois, 'o pedido que não chega falha, e a falha é lembrada: o próximo nem espera a rede')

  t.rede.estado = 'ok'
  t.ouvintes.online[0]()
  await t.pedir(t.dados('/admin/localizar?evento=ev-1&_rsc=jkl'))
  ok(t.rede.chamadas.length === depois + 1, 'o evento "online" apaga a lembrança: com a internet de volta o pedido vai à rede')

  const lenta = montar()
  lenta.rede.estado = 'trava'
  r = await lenta.pedir(lenta.dados('/scan?evento=ev-1&_rsc=lenta'))
  ok(r.type === 'error', 'internet que não responde: o pedido desiste depois da espera (4 s de verdade) e o Next segue pela navegação normal')

  ok(t.pedir({ method: 'POST', url: ORIGEM + '/admin/localizar', mode: 'cors', headers: new Headers({ RSC: '1' }) }) === null
    && t.pedir(t.dados('/admin/eventos/abc?_rsc=x')) === null
    && t.pedir({ method: 'GET', url: 'https://outro.site/admin/localizar', mode: 'cors', headers: new Headers({ RSC: '1' }) }) === null,
  'só GET, só do próprio site e só as 3 telas do portão: o resto do sistema passa direto')
}

console.log('\n2 · Abrir a tela sem internet (a cópia guardada)')
{
  const t = montar()
  await t.guardar('/admin/localizar?evento=ev-1', '<html>localizar ev-1</html>')
  await t.guardar('/scan', '<html>scan sem evento</html>')
  t.semInternet()

  let r = await t.pedir(t.navegar('/admin/localizar?evento=ev-1'))
  ok((await r.text()) === '<html>localizar ev-1</html>' && !t.rede.chamadas.length, 'sem internet a tela abre da cópia na hora, sem esperar a rede')

  r = await t.pedir(t.navegar('/admin/localizar'))
  ok((await r.text()) === '<html>localizar ev-1</html>', 'o link sem evento abre a cópia do Registrar ponto (direto no evento, sem a lista de eventos)')

  r = await t.tentar(t.pedir(t.navegar('/admin/localizar?evento=ev-2')))
  ok(r.erro, 'o Registrar ponto de OUTRO evento sem cópia não abre a cópia do evento errado')

  r = await t.pedir(t.navegar('/scan?evento=ev-2'))
  ok((await r.text()) === '<html>scan sem evento</html>', 'o leitor aceita a cópia sem evento (ele recebe todos os eventos da conta e escolhe)')

  const so1 = montar()
  await so1.guardar('/scan?evento=ev-1', '<html>scan ev-1</html>')
  so1.semInternet()
  r = await so1.tentar(so1.pedir(so1.navegar('/scan?evento=ev-2')))
  ok(r.erro, 'e nunca a cópia do leitor de outro evento')

  const on = montar()
  await on.guardar('/admin/localizar?evento=ev-1', '<html>velha</html>')
  on.rede.rotas.set(`${ORIGEM}/admin/localizar?evento=ev-1`, { html: '<html>nova</html>' })
  r = await on.pedir(on.navegar('/admin/localizar?evento=ev-1'))
  ok((await r.text()) === '<html>nova</html>', 'com internet a tela vem do servidor (a cópia é só para quando não há internet)')
  await esperar(10)
  ok((await on.guardados.get(`${ORIGEM}/admin/localizar?evento=ev-1`).text()) === '<html>nova</html>', 'e a cópia guardada é renovada')

  const lenta = montar()
  await lenta.guardar('/admin/localizar?evento=ev-1', '<html>copia</html>')
  lenta.rede.estado = 'trava'
  r = await lenta.pedir(lenta.navegar('/admin/localizar?evento=ev-1'))
  ok((await r.text()) === '<html>copia</html>', 'internet lenta demais (Wi-Fi sem sinal de verdade): depois da espera mostra a cópia guardada')

  const aut = montar()
  await aut.guardar('/_next/static/chunks/a.js', 'console.log(1)')
  aut.semInternet()
  r = await aut.pedir({ method: 'GET', url: ORIGEM + '/_next/static/chunks/a.js', mode: 'no-cors', headers: new Headers() })
  ok((await r.text()) === 'console.log(1)' && !aut.rede.chamadas.length, 'os arquivos do código saem da cópia guardada')
}

console.log('\n3 · Guardar as telas irmãs, com os arquivos delas')
{
  const t = montar()
  const pagina = `${ORIGEM}/admin/localizar?evento=ev-1`
  t.rede.rotas.set(pagina, { html: '<html><link rel="stylesheet" href="/_next/static/chunks/b.css?dpl=d1"><script src="/_next/static/chunks/a.js?dpl=d1" async></script><img src="/logo.png"></html>' })
  t.rede.rotas.set(`${ORIGEM}/_next/static/chunks/a.js?dpl=d1`, { html: 'a' })
  t.rede.rotas.set(`${ORIGEM}/_next/static/chunks/b.css?dpl=d1`, { html: 'b' })
  t.rede.rotas.set(`${ORIGEM}/scan?evento=ev-1`, { html: '<html>scan</html>' })

  await t.mensagem({ tipo: 'guardar', urls: [`${ORIGEM}/scan?evento=ev-1`], irmas: ['/admin/localizar?evento=ev-1', '/admin/qualquer-outra'] })
  ok(t.guardados.has(pagina) && t.guardados.has(`${ORIGEM}/_next/static/chunks/a.js?dpl=d1`) && t.guardados.has(`${ORIGEM}/_next/static/chunks/b.css?dpl=d1`), 'a tela irmã é guardada junto com os scripts e estilos que ela pede')
  ok(!t.guardados.has(`${ORIGEM}/logo.png`) && !t.rede.chamadas.some(u => u.includes('qualquer-outra')), 'e só isso: imagens fora do código e telas que não são do portão ficam de fora')
  ok(t.guardados.has(`${ORIGEM}/scan?evento=ev-1`), 'a própria tela (que já estava aberta) também fica guardada')

  const chamadasAntes = t.rede.chamadas.filter(u => u === pagina).length
  await t.mensagem({ tipo: 'guardar', urls: [], irmas: ['/admin/localizar?evento=ev-1'] })
  ok(t.rede.chamadas.filter(u => u === pagina).length === chamadasAntes, 'uma cópia guardada há menos de 6 horas não é baixada de novo')

  t.rede.rotas.set(pagina, { html: '<html>nova versão</html>' })
  const velha = new Response('<html>velha</html>', { headers: { date: new Date(Date.now() - 7 * 3600_000).toUTCString() } })
  await t.guardados.set(pagina, velha)
  await t.mensagem({ tipo: 'guardar', urls: [], irmas: ['/admin/localizar?evento=ev-1'] })
  ok((await t.guardados.get(pagina).text()) === '<html>nova versão</html>', 'já uma cópia de mais de 6 horas é renovada')

  const redir = montar()
  redir.rede.rotas.set(`${ORIGEM}/admin/scanner?evento=ev-1`, { html: '<html>login</html>', redirecionada: true })
  await redir.mensagem({ tipo: 'guardar', urls: [], irmas: ['/admin/scanner?evento=ev-1'] })
  ok(!redir.guardados.size, 'redirecionamento (para o login, ou tela que este perfil não abre) não é guardado')

  const falha = montar()
  falha.rede.estado = 'cai'
  let quebrou = false
  try { await falha.mensagem({ tipo: 'guardar', urls: [], irmas: ['/admin/localizar?evento=ev-1'] }) } catch { quebrou = true }
  ok(!quebrou, 'sem internet na hora de guardar não dá erro: a tela segue como está')
}

console.log('\n4 · O limite de arquivos')
{
  const t = montar()
  await t.guardar('/admin/localizar?evento=ev-1', '<html>localizar</html>')
  await t.guardar('/scan?evento=ev-1', '<html>scan</html>')
  for (let n = 0; n < 405; n++) await t.guardar(`/_next/static/chunks/x${n}.js`, `x${n}`)
  await t.mensagem({ tipo: 'guardar', urls: [], irmas: [] })
  const estaticos = [...t.guardados.keys()].filter(k => k.includes('/_next/static/'))
  ok(estaticos.length === 400 && !estaticos.some(k => k.endsWith('/x0.js')) && estaticos.some(k => k.endsWith('/x404.js')), 'passou de 400 arquivos: saem os mais antigos')
  ok(t.guardados.has(`${ORIGEM}/admin/localizar?evento=ev-1`) && t.guardados.has(`${ORIGEM}/scan?evento=ev-1`), 'mas as cópias das telas nunca saem (são as primeiras da fila e as mais importantes)')
}

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
