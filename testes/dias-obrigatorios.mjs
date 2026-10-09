/*
 * DIAS DE TRABALHO SEMPRE OBRIGATÓRIOS num evento de escala por dia (pedido do Juan, 08/10/2026: "ele precisa
 * pelo menos marcar um dia ... se tentar enviar mesmo assim, trava, manda mensagem de erro"). O formulário
 * público já recusava zero dias; o que faltava era a APROVAÇÃO: cadastro sem `escala.status` (planilha, ou
 * evento que ligou a escala depois) aprovava direto com ZERO dias — "QR vale todo dia".
 *
 * Roda com: node testes/dias-obrigatorios.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const acoes = ler('lib/actions.ts')
const aprovar = acoes.slice(acoes.indexOf('export async function aprovarCredenciamento'), acoes.indexOf('export async function aprovarCredenciamentosEmLote'))
ok(/if \(await eventoUsaEscalaPorDia\(eventoId\)\) \{/.test(aprovar) && !/escala\?\.status && await eventoUsaEscalaPorDia/.test(aprovar), 'aprovarCredenciamento confere os dias SEMPRE que o evento usa escala, não só quando já tinha escala.status')
ok(/conferirDiasPermitidos\(diasAprovados \?\? pedidos, disponiveis\)/.test(aprovar), '… e recusa lista vazia pela mesma função que o formulário público usa')

const regras = ler('lib/escala-regras.ts')
ok(/if \(!dias\.length\) return \{ ok: false, erro: 'Selecione pelo menos um dia de trabalho\.' \}/.test(regras), 'a regra pura já recusava lista vazia (usada também no ajuste de escala)')

const form = ler('app/form/[token]/FormularioFuncionario.tsx')
ok(/if \(diasEscala && !diasEscolhidos\.length\) \{/.test(form) && /Selecione pelo menos um dia em que você vai trabalhar\./.test(form), 'o formulário público já trava o envio e mostra o erro')
ok(/!!diasEscala && !diasEscolhidos\.length/.test(form), '… e o botão de enviar já fica desabilitado sem nenhum dia marcado')

const aprovDias = ler('components/AprovacaoComDias.tsx')
ok(/const exigeDias = detalhe\.usaEscala && !detalhe\.ehSupervisor$/m.test(aprovDias), 'a tela de aprovação/ajuste exige dia em QUALQUER evento de escala, mesmo sem escala.status prévio (exceto supervisor, liberado para todos os dias)')
ok(/Marque pelo menos um dia de trabalho\./.test(aprovDias) && /Marque pelo menos um dia\. Para tirar a pessoa do evento, use Desativar ou Descredenciar\./.test(aprovDias), 'as duas ações (aprovar e salvar dias) mostram o erro antes de chamar o servidor')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
