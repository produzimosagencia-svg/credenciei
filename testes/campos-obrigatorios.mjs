/*
 * NOME, CPF E TELEFONE OBRIGATÓRIOS EM TODO CADASTRO (Juan, 16/10/2026: "todos os campos de cadastro de nome, cpf e
 * telefone no sistema, é obrigatório"). Cada caminho que cria uma pessoa confere os três no servidor.
 *
 * Roda com: node testes/campos-obrigatorios.mjs
 */
import { readFileSync } from 'node:fs'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const acoes = ler('lib/actions.ts')
const trecho = (inicio, fim) => acoes.slice(acoes.indexOf(inicio), fim ? acoes.indexOf(fim) : undefined)

const publico = trecho('export async function cadastrarFuncionarioPublico').slice(0, 9000)
ok(/if \(!validarCpf\(cpf\)\)/.test(publico) && /if \(nome\.length < 2/.test(publico) && /if \(telefone\.length < 10 \|\| telefone\.length > 13\)/.test(publico), 'formulário público (link e portaria)')

const painel = trecho('export async function criarFuncionario(', 'export async function atribuirColaboradorAoEvento')
ok(/if \(!validarCpf\(cpf\)\)/.test(painel) && /nomeDoCadastro\.length < 2/.test(painel) && /telefoneDoCadastro\.length < 10/.test(painel), 'cadastro pelo painel da equipe (antes só conferia o CPF)')

const atribuir = trecho('export async function atribuirColaboradorAoEvento').slice(0, 4000)
ok(/telefoneDaBase\.length < 10/.test(atribuir), 'atribuir da base: sem telefone na base, não entra')

const ia = ler('lib/ia/ferramentas/funcionarios.ts')
ok(/fone\.length < 10 \|\| fone\.length > 13\) return/.test(ia) && /String\(nome \?\? ''\)\.trim\(\)\.length < 2\) return/.test(ia), 'IA (cadastrar_funcionario)')

const imp = ler('lib/importacao.ts')
ok(/motivo: f\.nome \? 'sem_cpf' : 'sem_nome'/.test(imp), 'planilha: linha sem nome ou sem CPF sai COM o motivo (antes sumia em silêncio)')
ok(/motivo: 'sem_telefone'/.test(imp) && imp.indexOf("motivo: 'sem_telefone'") < imp.indexOf('TRAVA DE COTA'), 'planilha: sem telefone (nem na base) sai — conferido antes de gastar a cota')
ok(imp.indexOf('const conhecidos') < imp.indexOf("motivo: 'sem_telefone'"), 'planilha: o telefone da base do Credenciei completa a linha antes da conferência')
const tela = ler('app/admin/eventos/[id]/ImportarFuncionarios.tsx')
ok(["'sem_telefone'", "'sem_nome'", "'sem_cpf'"].every(m => tela.includes(`f.motivo === ${m}`)), 'a tela da importação explica cada motivo')

const regras = ler('lib/lista-manual-regras.ts')
ok(/if \(!cpf\) return \{ ok: false, erro: 'Informe o CPF\.' \}/.test(regras) && /if \(!telefone\) return \{ ok: false, erro: 'Informe o telefone, com DDD\.' \}/.test(regras), 'lista manual')

const veiculo = trecho('function camposDoVeiculo(').slice(0, 3000)
ok(/Informe o nome completo do condutor/.test(veiculo) && /CPF do condutor inválido/.test(veiculo) && /Informe o telefone\/WhatsApp do condutor/.test(veiculo), 'veículo (condutor)')

const pedido = ler('lib/pedido-setor-regras.ts')
ok(/Informe o nome completo \$\{quem\}/.test(pedido) && /O CPF \$\{quem\} não é válido/.test(pedido) && /Informe o WhatsApp \$\{quem\}/.test(pedido), 'pedido de setor (responsável e supervisores)')

ok(/if \(telefone\.length < 10 \|\| telefone\.length > 13\) \{\s*throw new Error\('Informe um telefone válido para enviar o acesso pelo WhatsApp\.'\)/.test(acoes) && /Informe o CPF do supervisor, com 11 dígitos/.test(acoes), 'supervisor')

// Telefone corrigido depois do cadastro: a credencial (boas-vindas) sai se nunca saiu (LOJA OFICIAL, LUAN 16/10/2026).
const editarTel = trecho('export async function editarTelefoneFuncionario(').slice(0, 6000)
ok(/\.eq\('tipo', 'boas_vindas_funcionario'\)\.limit\(1\)/.test(editarTel) && /await agendarBoasVindasFuncionario\(\{ eventoId, funcionarioId, telefone: novo \}\)/.test(editarTel) && /statusCredenciamentoValido\(f\.status_credenciamento as string\) !== 'aprovado'/.test(editarTel),
  'corrigir o telefone de quem nunca recebeu a credencial manda a credencial (só aprovado, sem baixa, uma vez)')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
