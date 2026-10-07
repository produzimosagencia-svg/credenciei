/*
 * OPERADOR DE PORTÃO — escolhe o evento em que vai trabalhar (pedido de 07/10/2026).
 * Dois buracos que já aconteceram: a tela de boas-vindas não dizia qual evento valia, e
 * "Registro de ponto" listava os eventos pelos SETORES (que o operador não tem) e vinha vazio.
 *
 * Roda com: node testes/operador.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const bemVindo = ler('app/admin/bem-vindo/page.tsx')
const localizar = ler('app/admin/localizar/page.tsx')

ok(/Em qual evento você vai trabalhar\?/.test(bemVindo), 'a boas-vindas pergunta em qual evento o operador vai trabalhar')
ok(/\/admin\/localizar\?evento=\$\{e\.id\}/.test(bemVindo), 'cada evento abre o Registro de ponto já dentro dele')
ok(/\/scan\?evento=\$\{e\.id\}/.test(bemVindo) && /hoje\.has\(e\.id\)/.test(bemVindo), 'o Scanner abre o evento escolhido, só se acontece hoje')
ok(/perfil\.role === 'operador_portao'\)\s*\?\s*await eventosQuePossoAbrir\(\)/.test(localizar), 'Registro de ponto lista os eventos da organização para o operador')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
