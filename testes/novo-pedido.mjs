/*
 * NOVO PEDIDO DEPOIS DE UMA NEGATIVA — regra de 07/10/2026: quando o supervisor
 * nega um credenciamento, a pessoa pode tentar de novo pelo formulário (volta a
 * "aguardando aprovação"), mas só depois de 5 minutos.
 *
 * Roda com: node testes/novo-pedido.mjs   (Node 24 lê .ts direto)
 */
import { readFileSync } from 'node:fs'
import { minutosParaNovoPedido, ESPERA_NOVO_PEDIDO_MIN } from '../lib/credenciamento-constantes.ts'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const grupo = t => console.log(`\n\x1b[1m${t}\x1b[0m`)
const ler = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8')

const t0 = new Date('2026-10-07T12:00:00Z')
const depois = min => new Date(t0.getTime() + min * 60_000)

grupo('1 · A espera de 5 minutos')
ok(ESPERA_NOVO_PEDIDO_MIN === 5, 'são 5 minutos')
ok(minutosParaNovoPedido(t0.toISOString(), t0) === 5, 'recém negado: faltam 5')
ok(minutosParaNovoPedido(t0.toISOString(), depois(1)) === 4, 'depois de 1 min: faltam 4')
ok(minutosParaNovoPedido(t0.toISOString(), new Date(t0.getTime() + 4 * 60_000 + 30_000)) === 1, 'arredonda pra cima: com 30 s faltando, diz 1 minuto')
ok(minutosParaNovoPedido(t0.toISOString(), depois(5)) === 0, 'passados 5 min: já pode')
ok(minutosParaNovoPedido(t0.toISOString(), depois(60)) === 0, 'muito depois: já pode')
ok(minutosParaNovoPedido(null, t0) === 0 && minutosParaNovoPedido('lixo', t0) === 0, 'negativa antiga, sem data: libera (não trava quem não tem como saber)')

grupo('2 · O servidor')
const a = ler('lib/actions.ts')
ok(a.includes("if (statusDoPedido !== 'negado')") && a.includes('minutosParaNovoPedido(existente.decidido_em'), 'só quem está NEGADO entra na regra; os demais seguem como antes')
ok(a.includes('Seu pedido foi negado há pouco') && a.includes('pedidoNegadoId = existente.id as string'), 'antes dos 5 min recusa dizendo quanto falta; depois reabre o mesmo cadastro')
const reabrir = a.slice(a.indexOf('async function reabrirPedidoNegado'), a.indexOf('Base central de cadastros'))
ok(!reabrir.includes('.delete().eq(\'id\''), 'reabrir nunca apaga o cadastro (existe histórico a preservar)')
ok(/status_credenciamento: 'pendente'[\s\S]*motivo_negacao: null[\s\S]*decidido_em: null/.test(reabrir) && reabrir.includes(".eq('status_credenciamento', 'negado')"), 'volta a aguardando aprovação, limpa o motivo e só age se ainda estiver negado')
ok(reabrir.indexOf('upload(') < reabrir.indexOf("status_credenciamento: 'pendente'") && reabrir.indexOf('gravarDiasEscolhidos') < reabrir.indexOf("status_credenciamento: 'pendente'"), 'foto e dias (que podem falhar) vêm ANTES de virar o status')
ok(a.indexOf('if (pedidoNegadoId)') < a.indexOf('travaCotaHabilitada }'), 'não passa pela trava de cota (a pessoa já ocupa a vaga)')
const antesDoDedup = a.slice(a.indexOf('cpfEstaBloqueado(fornecedor.evento_id'), a.indexOf('const existente = existentes[0]'))
ok(antesDoDedup.includes('cpfEstaBloqueado('), 'CPF bloqueado continua bloqueado (a checagem vem antes)')
ok(reabrir.includes("acao: 'NOVO_PEDIDO_CREDENCIAMENTO'"), 'o novo pedido fica na auditoria')

grupo('3 · A tela da credencial')
const cred = ler('app/credential/[token]/page.tsx')
ok(cred.includes('minutosParaNovoPedido(') && cred.includes('Fazer um novo pedido') && cred.includes('/form/${fornecedor.token_formulario}'), 'negado vê a contagem e, passada a espera, o botão para o formulário')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
