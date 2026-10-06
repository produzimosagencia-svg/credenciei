/*
 * PADRÃO DE NOMES — evento, subevento e setor sempre em MAIÚSCULAS.
 * Roda com: node testes/nomes.mjs
 */
import { readFileSync } from 'node:fs'
import { nomeEmMaiusculo } from '../lib/format.ts'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

console.log('\n\x1b[1m1 · A função\x1b[0m')
ok(nomeEmMaiusculo('Acesso Livre') === 'ACESSO LIVRE', 'maiúsculas')
ok(nomeEmMaiusculo('  Muvuka   /  Pega no Cavaco ') === 'MUVUKA / PEGA NO CAVACO', 'espaços arrumados')
ok(nomeEmMaiusculo('Muvuka/Pega/Fervô') === 'MUVUKA/PEGA/FERVÔ', 'acento mantido (Fervô → FERVÔ)')
ok(nomeEmMaiusculo('Zig Tecnologia Instituição de Pagamento S.A.') === 'ZIG TECNOLOGIA INSTITUIÇÃO DE PAGAMENTO S.A.', 'ç, ã e ponto')
ok(nomeEmMaiusculo(null) === '' && nomeEmMaiusculo(undefined) === '', 'vazio não quebra')

console.log('\n\x1b[1m2 · Todo caminho que grava o nome usa a função\x1b[0m')
const actions = ler('lib/actions.ts')
const pedaco = (ini, tam = 3500) => { const i = actions.indexOf(ini); return i < 0 ? '' : actions.slice(i, i + tam) }
ok(pedaco('export async function criarEvento').includes('nomeEmMaiusculo(formData.get(\'nome\')'), 'criar evento (tela)')
ok(pedaco('export async function editarEvento').includes('nomeEmMaiusculo(formData.get(\'nome\')'), 'editar evento (tela)')
ok(pedaco('async function criarFornecedorOuLanca', 900).includes('nomeEmMaiusculo(formData.get(\'nome\')'), 'criar setor (tela e planilha)')
ok(pedaco('export async function editarFornecedor', 700).includes('nomeEmMaiusculo(formData.get(\'nome\')'), 'editar setor (tela)')
ok(pedaco('export async function criarSubevento', 700).includes('nomeEmMaiusculo('), 'criar subevento (tela)')
ok(pedaco('export async function editarSubevento', 700).includes('nomeEmMaiusculo('), 'editar subevento (tela)')
ok(actions.includes('nome: nomeEmMaiusculo(l.subgrupoUsado)'), 'subevento criado pela planilha de estrutura')
ok(actions.includes("fd.set('nome', nomeEmMaiusculo(l.fornecedor))"), 'setor criado pela planilha de estrutura')
ok(actions.includes("nomeEmMaiusculo((formData.get('evento_nome')"), 'primeiro evento da organização')
ok(ler('lib/ia/ferramentas/eventos.ts').match(/nomeEmMaiusculo\(String\(nome\)\)/g)?.length === 2, 'assistente de IA: criar e editar evento')
ok(ler('lib/ia/ferramentas/setores.ts').match(/nomeEmMaiusculo\(String\(nome\)\)/g)?.length === 2, 'assistente de IA: criar e editar setor')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
