/*
 * ATRASO = DEPOIS DO FIM DA JANELA DE ENTRADA (Juan, 09/10/2026, véspera do dia principal do VITAL: "considera atraso
 * só quem chega depois das 16h" — janela 14h–16h). Antes valia o início, e quase todo mundo que entrava dentro da
 * janela, nos setores com meio, obrigava o porteiro a digitar motivo.
 *
 * Roda com: node testes/atraso-depois-da-janela.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const actions = readFileSync(raiz + 'lib/actions.ts', 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

ok(/const limiteDoAtraso = esperado\.entrada \? \(esperado\.entradaLimite \?\? esperado\.entrada\) : null/.test(actions), 'o limite do atraso é o FIM da janela (sem fim, o início; sem horário, nenhum)')
ok(/if \(limiteDoAtraso && agora\.getTime\(\) > new Date\(limiteDoAtraso\)\.getTime\(\)\) \{\s*precisaJustificativaAtraso = true/.test(actions), 'só pede motivo depois desse limite')
ok(!/if \(esperado\.entrada && agora\.getTime\(\) > new Date\(esperado\.entrada\)\.getTime\(\)\)/.test(actions), 'a régua antiga (início da janela) saiu')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
