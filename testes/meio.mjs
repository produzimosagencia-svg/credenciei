/*
 * BATIDA DO MEIO SÓ NOS DIAS DO EVENTO (regra do Juan, repetida em 08/10/2026): montagem e desmontagem nunca
 * pedem o meio — nem na credencial, nem nas pendências, nem nos lembretes de WhatsApp. A regra mora inteira em
 * lib/meio.ts; os quatro lugares que perguntam "este dia pede o meio?" passam por ela.
 *
 * Roda com: node testes/meio.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const meio = ler('lib/meio.ts')
const corpoDia = meio.slice(meio.indexOf('export async function diaExigeMeio'), meio.indexOf('export async function diasComMeio'))
const corpoDias = meio.slice(meio.indexOf('export async function diasComMeio'))
ok(/const ehDiaDoEvento = \(tipo: unknown\) => tipo === 'principal'/.test(meio), 'dia do evento = dia principal')
ok(/ehDiaDoEvento\(d\.tipo\) && d\.exige_meio !== false/.test(corpoDia), 'um dia pede o meio só se for dia do evento E a chave estiver ligada')
ok(/ehDiaDoEvento\(d\.tipo\) && d\.exige_meio !== false/.test(corpoDias), 'a lista de dias com meio também exclui montagem e desmontagem')
ok(/\.eq\('tipo', 'principal'\)/.test(ler('lib/actions.ts').slice(ler('lib/actions.ts').indexOf('export async function obterConfiguracaoDoMeio'))), 'a tela de configuração só oferece os dias do evento')
for (const [arq, nome] of [['lib/mensagens.ts', 'lembretes de WhatsApp'], ['lib/pendencias.ts', 'pendências'], ['app/credential/[token]/page.tsx', 'credencial']]) {
  ok(/diaExigeMeio\(/.test(ler(arq)), `${nome} perguntam pela mesma regra (diaExigeMeio)`)
}

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
