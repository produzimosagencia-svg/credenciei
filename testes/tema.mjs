/*
 * TEMA — o CLARO é o padrão do sistema interno (decisão de 07/10/2026); só fica
 * escuro quem escolheu escuro. O teste EXECUTA o script que roda antes da
 * hidratação (app/layout.tsx) contra um navegador de mentira.
 *
 * Roda com: node testes/tema.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const script = layout.match(/\{"(var p=location\.pathname;[^\n]*?)"\}/)?.[1]
ok(!!script, 'o script do tema está no layout raiz')

/** Roda o script num "navegador" com este caminho e este localStorage; devolve o atributo data-tema que ficou. */
function rodar(caminho, storage) {
  const attrs = {}
  const location = { pathname: caminho }
  const localStorage = { getItem: k => { if (storage === 'quebrado') throw new Error('bloqueado'); return storage?.[k] ?? null } }
  const document = { documentElement: { setAttribute: (k, v) => { attrs[k] = v } } }
  new Function('location', 'localStorage', 'document', script)(location, localStorage, document)
  return attrs['data-tema'] ?? null
}

console.log('\n\x1b[1m1 · Sistema interno: claro por padrão\x1b[0m')
ok(rodar('/admin', {}) === 'claro', 'quem nunca escolheu vê o CLARO (/admin)')
ok(rodar('/encarregado/abc', {}) === 'claro' && rodar('/scan', {}) === 'claro', 'também na área do Encarregado e no scanner')
ok(rodar('/admin/eventos/1', { 'credenciei-tema': 'claro' }) === 'claro', 'quem escolheu claro continua no claro')
ok(rodar('/admin', { 'credenciei-tema': 'escuro' }) === null, 'quem escolheu ESCURO continua no escuro')
ok(rodar('/admin', 'quebrado') === 'claro', 'navegador que bloqueia o armazenamento (aba anônima) também abre no claro')

console.log('\n\x1b[1m2 · Landing: claro por padrão, escuro por escolha (09/10/2026)\x1b[0m')
ok(rodar('/', {}) === 'claro', 'a landing abre no CLARO para quem nunca escolheu')
ok(rodar('/', { 'credenciei-tema': 'escuro' }) === null, 'quem escolheu escuro vê a landing escura')
const landing = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8')
ok(landing.includes('<TemaLanding'), 'a landing tem o botão de trocar o tema')
ok(!landing.includes('<Link href="/login"') && landing.includes('<a href="/login"'),
  'o "Entrar" recarrega a página, pra o login (sempre escuro) não herdar o tema claro da landing')

console.log('\n\x1b[1m3 · O resto continua escuro\x1b[0m')
ok(rodar('/login', {}) === null && rodar('/credential/abc', {}) === null && rodar('/form/abc', {}) === null, 'login, credencial e formulário público seguem escuros')

console.log('\n\x1b[1m4 · A chave de volta pro escuro\x1b[0m')
const tema = readFileSync(new URL('../components/Tema.tsx', import.meta.url), 'utf8')
ok(tema.includes("localStorage.setItem(CHAVE_TEMA, tema)") && tema.includes("else html.removeAttribute('data-tema')"), 'escolher escuro grava a escolha (senão voltaria pro claro a cada tela)')
ok(tema.includes("() => 'claro' as Tema"), 'o servidor já responde claro (sem piscar o ícone do botão)')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
