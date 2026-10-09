/*
 * "EDITAR SETOR" DENTRO DA EQUIPE (pedido do Juan, 09/10/2026): o lápis do card do setor também no cabeçalho da
 * página da equipe, ao lado de Pendências — o mesmo modal, só para quem `editarFornecedor` aceita.
 *
 * Roda com: node testes/editar-setor-na-equipe.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const pagina = ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx')
const pend = pagina.indexOf('Pendências\n            </Link>')
const bloco = pagina.slice(pend, pagina.indexOf('Escanear QR', pend))
ok(pend > -1 && /<FornecedorModal\s+mode="editar"\s+comoBotao/.test(bloco), 'o lápis fica logo depois de Pendências')
ok(/\{podeGerenciarEventos\(perfil\) && \(\s*<FornecedorModal/.test(bloco), 'só para quem pode editar setor (mesma régua de editarFornecedor)')
ok(/subevento_id=\{fornecedor\.subevento_id \?\? null\}/.test(bloco) && /quantidade_estimada=/.test(bloco), 'abre com os dados atuais do setor')
ok(/props as any\)\.comoBotao/.test(ler('app/admin/eventos/[id]/FornecedorModal.tsx')), 'o modal tem o gatilho em forma de botão')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
