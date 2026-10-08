/*
 * IMPORTAÇÃO DE EQUIPE — O ZERO DA ESQUERDA DO CPF (08/10/2026). Numa célula numérica do Excel o CPF
 * 012.345.678-90 vira o número 1234567890 (10 dígitos) — mesmo que a tela da planilha mostre o zero. A
 * importação o tratava como CPF inválido e a pessoa SUMIA: quem mandou a planilha achava que estava cadastrada
 * (caso real: Wilian Rufino, que não existia no sistema). Agora o zero volta, e as linhas que mesmo assim não
 * passam aparecem na lista, com nome e CPF.
 *
 * Roda com: node testes/importacao-cpf.mjs
 */
import { register } from 'node:module'
import { readFileSync } from 'node:fs'

register('./_hook-ts.mjs', import.meta.url)
const { normalizarCpfPlanilha } = await import('../lib/estrutura-regras.ts')
const { validarCpf } = await import('../lib/format.ts')

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

console.log('O zero da esquerda')
ok(validarCpf('01234567890'), 'o CPF de teste (começa com zero) é válido com os 11 dígitos')
ok(!validarCpf('1234567890'), '… e inválido sem o zero — por isso a linha era descartada')
ok(normalizarCpfPlanilha(1234567890) === '01234567890', 'número 1234567890 (célula numérica) volta a ter o zero')
ok(normalizarCpfPlanilha('1234567890') === '01234567890', 'texto com 10 dígitos também')
ok(normalizarCpfPlanilha('234567890') === '00234567890', 'dois zeros perdidos (9 dígitos) voltam os dois')
ok(normalizarCpfPlanilha('012.345.678-90') === '01234567890', 'CPF com pontos e traço fica só com dígitos')
ok(normalizarCpfPlanilha('52998224725') === '52998224725', 'CPF de 11 dígitos não muda')
ok(normalizarCpfPlanilha('') === '' && normalizarCpfPlanilha(undefined) === '', 'vazio continua vazio')
ok(!validarCpf(normalizarCpfPlanilha('1234567891')), 'CPF digitado errado de verdade continua recusado (os dígitos verificadores seguem valendo)')

console.log('\nNa importação')
const imp = ler('lib/importacao.ts')
ok(/cpf: normalizarCpfPlanilha\(cpfDigitado\)/.test(imp), 'o CPF da planilha passa por aqui antes de ser validado')
ok(imp.indexOf('const duplicados = ignorados.length') < imp.indexOf("motivo: 'cpf_invalido'"), 'as linhas de CPF inválido entram na lista DEPOIS de contar duplicados (a mensagem "todos já cadastrados" não muda)')
ok(/ignorados\.push\(\{ nome: f\.nome \?\? '', cpf: f\.cpfDigitado, setor: null, motivo: 'cpf_invalido' \}\)/.test(imp), 'cada linha descartada por CPF aparece com nome e o CPF como veio na planilha')
ok(/motivo === 'cpf_invalido'/.test(ler('app/admin/eventos/[id]/ImportarFuncionarios.tsx')), 'a tela explica "CPF inválido — confira os números na planilha"')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
