/*
 * REGRAS DO SUPERVISOR (conferidas no código-fonte, sem banco):
 *   1. supervisor não pode ser Gestor de credenciamento (operador_portao)
 *   2. supervisor com setores em várias áreas passa em qualquer portão dessas áreas
 *
 * Roda com: node testes/supervisor.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const actions = readFileSync(new URL('../lib/actions.ts', import.meta.url), 'utf8')
const trecho = (inicio, tam = 1400) => { const i = actions.indexOf(inicio); return i < 0 ? '' : actions.slice(i, i + tam) }

console.log('\n\x1b[1m1 · Supervisor não é Gestor de credenciamento\x1b[0m')
const vincular = trecho('async function vincularSupervisorAoSetor')
ok(/role === 'operador_portao'\) throw new Error\(SUPERVISOR_NAO_E_GESTOR\)/.test(vincular),
  'todo vínculo de supervisor (tela, importação, IA) recusa quem é Gestor')
const operador = trecho('async function criarOperadorPortariaOuLanca', 4000)
ok(operador.includes('SUPERVISOR_NAO_E_GESTOR') && operador.includes("from('supervisor_setores')"),
  'criar Gestor recusa CPF que é supervisor ou que ainda tem vínculo de supervisor')

console.log('\n\x1b[1m2 · Um QR, vários setores, uma diária\x1b[0m')
const area = trecho('SUPERVISOR EM VÁRIAS ÁREAS', 2200)
ok(area.includes("origem === 'supervisor'") && area.includes("from('supervisor_setores')") && area.includes('areaLiberada'),
  'portão de área confere todas as áreas onde o supervisor tem setor')
ok(area.includes(".eq('fornecedores.evento_id', eventoId)"), 'só as áreas DESTE evento contam')
const cracha = trecho('async function crachaNoEvento', 2600)
ok(cracha.includes(".eq('cpf', p.cpf)") && cracha.includes('return { qrToken: existente.qr_token'),
  'o crachá é um por CPF por evento: reaproveitado nos demais setores')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
