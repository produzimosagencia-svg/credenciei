/*
 * O seletor de data/hora abre num PORTAL (Juan, 18/10/2026: o do autoatendimento "não funciona ao clicar em Limpar,
 * Cancelar ou Aplicar, pelo mobile"). Dentro de um <label>, o toque no celular era repassado ao botão do campo e o
 * quadro reabria na hora.
 *
 * Roda com: node testes/seletor-horario-portal.mjs
 */
import { readFileSync } from 'node:fs'
const ler = c => readFileSync(new URL(`../${c}`, import.meta.url), 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }
const dtp = ler('components/DateTimePicker.tsx')
ok(/import \{ createPortal \} from 'react-dom'/.test(dtp) && /\{open && createPortal\(/.test(dtp) && /document\.body,\s*\)\}/.test(dtp), 'o quadro do seletor abre em document.body (fora de label e de caixa com overflow)')
ok(/<DateTimePicker modo="hora"/.test(ler('app/admin/eventos/[id]/editar/ConfiguracaoDoAutoatendimento.tsx')), 'o autoatendimento usa o seletor (o caso do relato)')
console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
