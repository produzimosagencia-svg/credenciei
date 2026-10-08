/*
 * CONTAGEM DA EQUIPE — o supervisor conta como uma pessoa do setor que cobre (Juan, 07/10/2026).
 * O caso real: Daniel supervisiona o GOTE - LIMPEZA do BLOCO, mas o crachá dele é um só por evento
 * (fica na ARQUIBANCADA) — e o cartão do Bloco dizia "0 pessoas de 10".
 *
 * Roda com: node testes/equipe.mjs
 */
import { readFileSync } from 'node:fs'
import { supervisoresSemCrachaPorSetor } from '../lib/equipe.ts'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }

const daniel = { cpf: '085.957.457-14' }
const supervisores = { BLOCO: [daniel], ARQ: [daniel], MUV: [daniel] }
const funcionarios = [{ cpf: '08595745714', fornecedor_id: 'ARQ' }, { cpf: '11111111111', fornecedor_id: 'BLOCO' }]

const r = supervisoresSemCrachaPorSetor(supervisores, funcionarios)
ok(r.BLOCO === 1 && r.MUV === 1, 'o supervisor conta nos setores onde NÃO tem crachá')
ok(r.ARQ === undefined, 'onde ele tem crachá já está na contagem — não conta em dobro')
ok(Object.keys(supervisoresSemCrachaPorSetor({}, funcionarios)).length === 0, 'sem supervisores, nada a somar')
ok(supervisoresSemCrachaPorSetor({ X: [daniel, { cpf: '08595745714' }] }, []).X === 1, 'a mesma pessoa listada duas vezes conta uma só')
ok(Object.keys(supervisoresSemCrachaPorSetor({ X: [{ cpf: null }] }, [])).length === 0, 'supervisor sem CPF não entra na conta')

const card = readFileSync(new URL('../app/admin/eventos/[id]/FornecedorCard.tsx', import.meta.url), 'utf8')
ok(/const pessoas = count \+ supervisoresSemCracha/.test(card) && /\{pessoas\} \{pessoas === 1/.test(card), 'o cartão mostra as pessoas com o supervisor incluído')
ok(/brl\(valor \* count\)/.test(card), 'o valor total continua só sobre quem tem crachá')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
