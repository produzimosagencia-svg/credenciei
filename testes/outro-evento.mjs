/*
 * CADASTRO EM OUTRO EVENTO NÃO IMPEDE TRABALHAR NESTE (regra do Juan: o CPF só não pode estar em dois setores do
 * MESMO evento). No leitor facial, o rosto de quem trabalhou em outro evento era mostrado como "CADASTRADA EM OUTRO
 * EVENTO — isso não autoriza a entrada", e a equipe do VITAL achou que a pessoa não podia ser cadastrada (08/10/2026).
 *
 * Roda com: node testes/outro-evento.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const acoes = ler('lib/actions.ts')
ok(/ainda não está cadastrada neste evento/.test(acoes) && /Ela PODE trabalhar aqui/.test(acoes), 'o leitor diz que falta o cadastro NESTE evento e que ela pode trabalhar')
ok(!/não autoriza a entrada neste evento/.test(acoes.replace(/\/\*[\s\S]*?\*\//g, '')), 'a frase que parecia proibição saiu')
ok(/AINDA NÃO CADASTRADA NESTE EVENTO/.test(ler('app/scan/FaceScannerView.tsx')), 'o título da tela também')
const cadastro = acoes.slice(acoes.indexOf('export async function cadastrarFuncionarioPublico'), acoes.indexOf('export async function cadastrarFuncionarioPublico') + 20000)
ok(/Anti-duplicidade POR EVENTO/.test(cadastro) && /Em eventos\s*\/\/ DIFERENTES, mesmo no mesmo dia, o cadastro é livre/.test(cadastro), 'o cadastro só barra o mesmo CPF no MESMO evento')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
