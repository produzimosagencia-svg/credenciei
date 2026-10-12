/*
 * Tela do setor: escolher um dia em "Escala por dia" mostra as BATIDAS daquele dia (Juan, 12/10/2026: "entra em um
 * setor e vê os dias batidos de entrada, tá bugado"). Antes o botão só filtrava quem estava escalado e as colunas
 * Entrada/Meio/Saída continuavam em hoje.
 *
 * Roda com: node testes/setor-por-dia.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const pagina = ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx'), tabela = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioTable.tsx')
ok(/\.in\('data_ref', diaEscolhido \? \[diaEscolhido\] :/.test(pagina), 'com ?dia=, o servidor busca as batidas daquele dia')
ok(/const diaDe = \(funcId: string\) => diaEscolhido \?\? diaPorFunc\.get\(funcId\) \?\? hoje/.test(pagina), 'e as colunas de todo mundo passam a ser daquele dia')
ok(/router\.push\(dia \? `\$\{caminho\}\?dia=\$\{dia\}` : caminho, \{ scroll: false \}\)/.test(tabela), 'o botão do dia troca o endereço (o servidor recarrega as colunas)')
ok(/!\(diaFiltro === diaSelecionado && \(f\.entrada \|\| f\.meio \|\| f\.fim\)\)/.test(tabela), 'quem bateu ponto no dia aparece mesmo sem estar escalado nele')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
