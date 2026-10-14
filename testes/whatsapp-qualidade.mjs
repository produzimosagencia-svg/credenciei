/*
 * QUALIDADE VERMELHA NÃO É QUEDA (Juan, 14/10/2026: "tem mensagem falando que tá fora do ar ainda"). Duas campanhas de
 * marketing (12 mil mensagens) deixaram o número RED na Meta; o sistema tratava RED como "fora do ar" e a fila PARAVA
 * — as mensagens do evento ficaram presas. RED ainda entrega: vira aviso, e a fila só para com o número restrito/banido.
 *
 * Roda com: node testes/whatsapp-qualidade.mjs
 */
import { readFileSync } from 'node:fs'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }
const meta = ler('lib/whatsapp-meta.ts'), checks = ler('lib/performance-checks.ts'), tela = ler('app/admin/whatsapp/page.tsx')
ok(/const bloqueado = situacao === 'BANNED' \|\| situacao === 'RESTRICTED'/.test(meta) && /conectada: !bloqueado/.test(meta) && !/qualidade !== 'RED'/.test(meta), 'só número restrito ou banido conta como fora do ar (a fila continua com RED)')
ok(/qualidade === 'RED'[\s\S]{0,40}\?/.test(meta) && /aviso,/.test(meta), 'RED vira aviso')
ok(/aviso: conectada \? \(aviso \?\? null\) : null/.test(checks), 'no monitor (Performance), RED é atenção, não indisponível')
ok(/No ar, com qualidade baixa\./.test(tela), 'na tela do WhatsApp: "No ar, com qualidade baixa"')
console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
