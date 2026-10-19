/*
 * RESUMO DIÁRIO DO SUPERVISOR, STATUS DA CREDENCIAL NA EQUIPE e a CONFIRMAÇÃO DE ESCALA do Monte sua equipe
 * (Juan, 18/10/2026). O convite por telefone saiu ("não quero essas mensagens de convite"): quem é chamado de novo
 * recebe a confirmação de escala que já existe.
 *
 * Roda com: node testes/resumo-supervisor.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const R = await import(raiz + 'lib/resumo-supervisor-regras.ts')

console.log('1 · O resumo')
ok(R.textoDoResumo({ aprovar: 12, credenciaisFalharam: 3 }) === '12 pessoas aguardando sua aprovação e 3 credenciais que não chegaram no WhatsApp', 'as pendências numa frase, sem quebra de linha')
ok(R.textoDoResumo({ aprovar: 1, credenciaisFalharam: 0 }) === '1 pessoa aguardando sua aprovação', 'singular')
ok(R.textoDoResumo({ aprovar: 0, credenciaisFalharam: 0 }) === null, 'sem pendência, sem mensagem')
ok(R.normalizarTelefoneBR('+55 (27) 99999-0000') === '27999990000' && R.normalizarTelefoneBR('2700000000') === null, 'telefone do supervisor: com 55 vale; o genérico não')
const res = ler('lib/resumo-supervisor.ts')
ok(/if \(provedor\(\) === 'evolution'\) return true/.test(res) && /t\.status === 'APPROVED'/.test(res), 'só envia com o modelo aprovado na Meta (ou pela Evolution)')
ok(/if \(hora < 9 \|\| hora >= 12\) return/.test(res) && /resumo-\$\{perfilId\}-\$\{eventoId\}-\$\{hoje\}/.test(res) && /fluxoDesligado\('resumo_supervisor'\)/.test(res), 'uma vez por dia, por supervisor e evento, a partir das 9h; dá para desligar no painel')
ok(/await enviarResumosDoDia\(\)/.test(ler('app/api/cron/enviar-mensagens/route.ts')), 'o cron de mensagens roda o resumo')

console.log('\n2 · O convite fica guardado, desligado ("deixa isso comentado, não vamos usar agora")')
const pagina = ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx')
const cron = ler('app/api/cron/enviar-mensagens/route.ts')
ok(existsSync(raiz + 'lib/actions-convites.ts') && existsSync(raiz + 'app/admin/eventos/[id]/fornecedor/[fid]/ConvidarPorWhatsApp.tsx'), 'o código do convite continua no projeto')
ok(/^\/\/ import ConvidarPorWhatsApp/m.test(pagina) && !/^import ConvidarPorWhatsApp/m.test(pagina), 'o botão está comentado na equipe')
ok(/^\/\/ import \{ processarLembretesDeConvite \}/m.test(cron) && !/^\s*await processarLembretesDeConvite\(\)/m.test(cron), 'o lembrete está comentado no cron')
ok(!/lembrete_convite/.test(ler('lib/whatsapp-painel.ts')), 'sem o fluxo do convite no painel (não há o que ligar)')

console.log('\n3 · Chamado de novo = a confirmação de escala de sempre')
const hist = ler('lib/actions-historico.ts')
ok(/const comConfirmacao = await modeloPronto\(modelo\)/.test(hist) && /if \(comConfirmacao\) await enviarConfirmacaoDeEscalaAgora/.test(hist) && /else await agendarBoasVindasFuncionario/.test(hist), 'Monte sua equipe manda a confirmação de escala; sem o modelo aprovado, a boas-vindas (ninguém fica sem link)')
ok(/'confirmacao_subeventos' : 'confirmacao_escala'/.test(hist), 'evento com subgrupo usa a confirmação irmã')
const msg = ler('lib/mensagens.ts')
const agora = msg.slice(msg.indexOf('export async function enviarConfirmacaoDeEscalaAgora'), msg.indexOf('export async function enviarConfirmacaoDeEscalaAgora') + 1600)
ok(/tipo: 'confirmacao_escala',\s*data_ref: diaBRT\(evento\.data_inicio as string\)/.test(agora) && /await enviarMensagemAgora\(data\.id as string\)/.test(agora), 'mesma chave do agendamento normal (não manda duas) e sai na hora (não fica pendente para ser cancelada)')
ok(/eq\('funcionario_id', msg\.funcionario_id\)\.eq\('aprovado', true\)/.test(msg) && /listarDias\(diasDaPessoa\)/.test(msg), 'a confirmação mostra OS DIAS da escala da pessoa (quem vai na desmontagem não lê a data do show)')
ok(/\.in\('tipo', \['boas_vindas_funcionario', 'confirmacao_escala'\]\)/.test(ler('lib/credencial-whatsapp.ts')), 'o status da credencial na equipe enxerga a confirmação também')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
