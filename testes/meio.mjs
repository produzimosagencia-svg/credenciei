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
ok(/d\.tipo === 'principal' \? d\.exige_meio !== false : d\.meio_fora_do_evento === true/.test(meio), 'dia do evento pede (salvo se desligado); montagem e desmontagem só se ligadas de propósito')
ok(/linhas\.some\(diaPedeMeio\)/.test(corpoDia) && /filter\(diaPedeMeio\)/.test(corpoDias), 'as duas leituras usam a mesma regra')
ok(/semNova/.test(meio), 'sem a coluna nova no banco, montagem e desmontagem continuam sem meio (não quebra)')
const acoesMeio = ler('lib/actions.ts')
ok(/atualizar\('meio_fora_do_evento', deMontagem\)/.test(acoesMeio) && /atualizar\('exige_meio', doEvento\)/.test(acoesMeio), 'a tela grava cada tipo de dia na sua chave')
ok(/meio_fora_do_evento boolean not null default false/.test(ler('supabase/upgrade-meio-montagem.sql')), 'a chave de montagem/desmontagem nasce desligada')
for (const [arq, nome] of [['lib/mensagens.ts', 'lembretes de WhatsApp'], ['lib/pendencias.ts', 'pendências'], ['app/credential/[token]/page.tsx', 'credencial']]) {
  ok(/diaExigeMeio\(/.test(ler(arq)), `${nome} perguntam pela mesma regra (diaExigeMeio)`)
}

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
