/*
 * BAIXA NUMA EQUIPE, CADASTRO EM OUTRA (Juan, 16/10/2026: "quando a pessoa estiver com o cadastro dessa forma em uma
 * equipe [com BAIXA], ela pode sim se cadastrar em outra" — caso da Thainara, baixa no CARREGADORES IMF). A ficha da
 * baixa fica onde está; o cadastro novo é uma ficha nova na outra equipe. Regra em lib/ficha-no-evento.ts.
 *
 * Roda com: node testes/baixa-outra-equipe.mjs
 */
import { readFileSync, mkdtempSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const dir = mkdtempSync(join(tmpdir(), 'ficha-'))
copyFileSync(raiz + 'lib/ficha-no-evento.ts', join(dir, 'ficha-no-evento.ts'))
const { fichaQueImpedeCadastro, fichaQueVale, semFichasDeBaixaRepetidas } = await import(join(dir, 'ficha-no-evento.ts'))

console.log('1 · a regra')
const baixaA = { id: 'a', fornecedor_id: 'A', descredenciado_em: '2026-10-16T13:49:50Z' }
const ativaB = { id: 'b', fornecedor_id: 'B', descredenciado_em: null }
ok(fichaQueImpedeCadastro([baixaA], 'B') === null, 'baixa no A não impede o cadastro no B')
ok(fichaQueImpedeCadastro([baixaA], 'A') === baixaA, 'baixa no A impede uma ficha repetida no próprio A (o caminho é "Trazer de volta")')
ok(fichaQueImpedeCadastro([ativaB], 'C') === ativaB, 'ficha que vale no B continua impedindo o C (uma equipe por evento)')
ok(fichaQueImpedeCadastro([baixaA, ativaB], 'A') === ativaB, 'com baixa no A e ficha que vale no B, o A responde pelo B ("já credenciado pelo B")')
ok(fichaQueImpedeCadastro([ativaB], 'B') === ativaB, 'no mesmo fornecedor, devolve a ficha dele (a credencial de sempre)')
ok(fichaQueImpedeCadastro([], 'A') === null && fichaQueImpedeCadastro(null, 'A') === null, 'sem ficha, cadastra')
ok(fichaQueVale([baixaA, ativaB]) === ativaB && fichaQueVale([baixaA]) === baixaA && fichaQueVale([]) === null, 'a ficha que vale é a sem baixa')
const achados = [{ ...baixaA, cpf: '1' }, { ...ativaB, cpf: '1' }, { id: 'c', cpf: '2', fornecedor_id: 'C', descredenciado_em: 'x' }]
ok(semFichasDeBaixaRepetidas(achados).map(f => f.id).join() === 'b,c', 'na busca, some a ficha de baixa de quem tem outra que vale; baixa sozinha continua aparecendo')

console.log('\n2 · todos os caminhos de cadastro usam a regra')
const acoes = ler('lib/actions.ts')
const formulario = acoes.slice(acoes.indexOf('export async function cadastrarFuncionarioPublico'))
ok(/const fichaQueImpede = fichaQueImpedeCadastro\(existentes/.test(formulario) && /descredenciado_em, subevento_id/.test(formulario), 'formulário (link e portaria)')
ok(/Você recebeu baixa nesta equipe\./.test(formulario), 'formulário da MESMA equipe da baixa: explica, não devolve o QR que não vale')
const painel = acoes.slice(acoes.indexOf('export async function criarFuncionario('), acoes.indexOf('export async function atribuirColaboradorAoEvento'))
ok(/fichaQueImpedeCadastro\(existentes, fornecedorId\)/.test(painel), 'cadastro pelo painel')
const atribuir = acoes.slice(acoes.indexOf('export async function atribuirColaboradorAoEvento'))
ok(/fichaQueImpedeCadastro\(jaNoEvento, fornecedorId\)/.test(atribuir.slice(0, 4000)), 'atribuir da base')
ok(/fichaQueImpedeCadastro\(fichas, fornecedorId\)/.test(ler('lib/importacao.ts')), 'importação por planilha')
ok(/fichaQueImpedeCadastro\(data, opcoes\.destino\)/.test(ler('lib/ia/ferramentas/funcionarios.ts')) && /cpfJaNoEvento\(digitos, r\.setor\.evento_id, \{ destino:/.test(ler('lib/ia/ferramentas/funcionarios.ts')), 'IA (cadastrar_funcionario)')
ok(/fichaQueImpedeCadastro\(jaTem, setor\.id/.test(ler('lib/actions-lixeira.ts')), 'restaurar da lixeira')

console.log('\n3 · quem procura pelo CPF acha a ficha que vale')
const portaria = acoes.slice(acoes.indexOf('export async function identificarNaPortaria'))
ok(/const func = fichaQueVale\(fichas\)/.test(portaria) && /if \(!func \|\| func\.descredenciado_em\) return \{ naoEncontrado: true \}/.test(portaria) && !/maybeSingle\(\)\s*\n\s*\n\s*if \(!func\) return \{ naoEncontrado/.test(portaria),
  'portaria (QR fixo): sem maybeSingle (estourava com duas fichas); só com baixa, segue para o cadastro')
ok(/const f = fichaQueVale\(achados\)/.test(acoes.slice(acoes.indexOf('export async function conferirCredenciamentoPorCpf'))), 'conferência por CPF no portão')
ok(/const existente = fichaQueVale\(existentes\)/.test(acoes.slice(acoes.indexOf('async function crachaNoEvento'))), 'crachá do supervisor')
ok(/descredenciado_em, subeventos\(nome\), fornecedores!inner\(id, nome, evento_id/.test(acoes) && /let visiveis = semFichasDeBaixaRepetidas\(achados\.filter\(dentroDoEscopo\)\)/.test(acoes), 'Registrar ponto: a ficha da baixa não aparece ao lado da que vale')
ok(!/\.eq\('cpf', dados\.cpf_pessoa as string\)\s*\.eq\('fornecedores\.evento_id', eventoId\)\s*\.maybeSingle\(\)/.test(acoes), 'aviso para uma pessoa: sem maybeSingle')

console.log('\n4 · "Trazer de volta" não deixa a pessoa em duas equipes')
const volta = acoes.slice(acoes.indexOf('export async function recredenciarFuncionario'), acoes.indexOf('export async function liberarDescredenciamentosIndevidos'))
ok(/\.neq\('id', funcionarioId\)\.is\('descredenciado_em', null\)/.test(volta) && /dê baixa nela lá primeiro/.test(volta), 'com ficha valendo em outra equipe, recusa e diz onde')
ok(/ficha\.fornecedor_id !== fornecedorId/.test(volta), 'e confere que a pessoa é da equipe aberta')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
