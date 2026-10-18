/*
 * Registrar ponto (Juan, 18/10/2026):
 *   - o MEIO só aparece (e só é aceito) para quem é de equipe com batida de meio;
 *   - SAÍDA só com a ENTRADA do turno registrada ("muita gente dando saída sem ter dado entrada") — também no
 *     lançamento manual;
 *   - na credencial, "Escanear e registrar" só com o cartaz da portaria LIGADO (caso da Lais).
 *
 * Roda com: node testes/registro-de-ponto-regras.mjs
 */
import { readFileSync } from 'node:fs'
const ler = c => readFileSync(new URL(`../${c}`, import.meta.url), 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }
const a = ler('lib/actions.ts')
const ficha = a.slice(a.indexOf('async function fichaDoFuncionario('))
ok(/const etapasDaEquipe = ORDEM_ETAPAS\.filter\(e => e\.momento !== 'meio' \|\| exigeMeio \|\| feitos\.has\('meio'\)\)/.test(ficha), 'a ficha só mostra o meio para equipe com meio (ou se o meio já foi batido)')
const ep = a.slice(a.indexOf('async function etapaPermitida('))
ok(/Esta equipe não tem batida de meio/.test(ep) && /\.eq\('tipo', 'entrada'\)\.eq\('data_ref', dataRef\)/.test(ep), 'o servidor recusa meio de equipe sem meio e saída sem entrada no turno')
const assist = a.slice(a.indexOf('export async function registrarPresencaAssistida('))
ok(/await etapaPermitida\(func\.id, func\.fornecedor_id as string, evento\.id, momento, refAssistido\.dataRef\)/.test(assist.slice(0, 14000)), 'Registrar ponto usa a régua')
const manual = a.slice(a.indexOf('export async function lancarPontoManual('))
ok(/const \{ data: temEntrada \}[\s\S]{0,300}Lance a entrada \(com o horário real\) antes da saída/.test(manual.slice(0, 9000)), 'lançamento manual também recusa saída sem entrada no dia')
const tela = ler('app/admin/localizar/LocalizarFuncionario.tsx')
ok(/Esta equipe não tem batida de meio — só entrada e saída/.test(tela) && /func\.etapas\.length === 2 \? 'grid-cols-2' : 'grid-cols-3'/.test(tela), 'a tela: duas etapas em duas colunas; supervisor avisado quando a equipe não tem meio')
ok(/temCartazNoLocal=\{!!evento\?\.token_portaria && \(evento as \{ portaria_ativa\?: boolean \| null \} \| null\)\?\.portaria_ativa === true\}/.test(ler('app/credential/[token]/page.tsx')), 'credencial: escanear o cartaz só com o cartaz ligado')
console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
