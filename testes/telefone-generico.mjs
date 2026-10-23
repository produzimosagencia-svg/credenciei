/*
 * TELEFONE GENÉRICO (Juan, 23/10/2026): quem foi cadastrado com o telefone que só destrava o cadastro (DDD + zeros) não
 * recebe mensagem — o sistema nem tenta enviar — e a ficha diz "Sem telefone válido" em vez de um alarme vermelho que
 * parecia dizer que o registro falhou. Mensagem que a Meta não entrega vira "WhatsApp não entregue".
 *
 * Roda com: node testes/telefone-generico.mjs
 */
import { readFileSync } from 'node:fs'
import { telefoneValido } from '../lib/telefone.ts'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

console.log('1 · Que telefone serve')
ok(telefoneValido('(27) 99670-1243') && telefoneValido('27996701243') && telefoneValido('5527996701243') && telefoneValido('2733221100'), 'celular e fixo com DDD, com ou sem o 55')
ok(!telefoneValido('(00) 00000-0000') && !telefoneValido('00000000000'), 'o do Clemir ((00) 00000-0000) não serve')
ok(!telefoneValido('2700000000') && !telefoneValido('27000000000') && !telefoneValido('5527000000000'), 'o genérico do LUAN (DDD + zeros) não serve, com ou sem o 55')
ok(!telefoneValido('') && !telefoneValido(null) && !telefoneValido(undefined) && !telefoneValido('123') && !telefoneValido('996701243') && !telefoneValido('+55 27 9 9670-12435566'), 'vazio, curto (sem DDD) ou comprido demais não servem')

console.log('\n2 · A fila do WhatsApp não tenta enviar')
const msg = ler('lib/mensagens.ts')
const enviarUma = msg.slice(msg.indexOf('async function enviarUma('))
const guarda = enviarUma.indexOf('if (!telefoneValido(msg.telefone)) {')
ok(/import \{ telefoneValido \} from '\.\/telefone'/.test(msg) && guarda > 0 && guarda < enviarUma.indexOf('const envio = await montarEnvioTemplate(msg)') && guarda < enviarUma.indexOf('await enviarMensagem({'),
  'antes de montar e de chamar a Meta: telefone genérico ou incompleto é cancelado (não gasta a chamada)')
ok(/status: 'cancelado',\s*erro: 'Telefone genérico ou incompleto — a mensagem não foi enviada\. Corrija o telefone na ficha\.'/.test(enviarUma), 'cancelada com o motivo escrito (e não "falhou": não é alarme)')

console.log('\n3 · A ficha da equipe')
const tabela = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioTable.tsx')
ok(/SEM TELEFONE VÁLIDO/.test(tabela) && /nenhuma mensagem é enviada para esta pessoa\. O cadastro e as batidas estão certos/.test(tabela), 'selo âmbar "SEM TELEFONE VÁLIDO", dizendo que o cadastro e as batidas estão certos')
ok(/WHATSAPP NÃO ENTREGUE/.test(tabela) && !/CREDENCIAL NÃO CHEGOU/.test(tabela) && /só o WhatsApp não recebeu/.test(tabela), 'o selo vermelho é "WHATSAPP NÃO ENTREGUE" (não parece que o registro falhou)')
ok(/const semTelefoneValido = \(f: \{[^}]*\}\) => f\.credencial != null && !telefoneValido\(f\.telefone\)/.test(tabela) && /f\.credencial === 'falhou' \|\| semTelefoneValido\(f\)/.test(tabela), 'só acende para quem vale na equipe (aprovado, sem baixa) — e o filtro rápido pega os dois casos')
ok(/WhatsApp com problema/.test(tabela) && (tabela.match(/<SeloCredencial status=\{f\.credencial\} telefone=\{f\.telefone\} \/>/g) ?? []).length === 2, 'o filtro chama "WhatsApp com problema" e o selo recebe o telefone nas duas telas (computador e celular)')
ok(/from '@\/lib\/telefone'/.test(tabela) && /export \{ telefoneValido \}/.test(ler('lib/historico-supervisor-regras.ts')), 'uma regra só: ficha, fila do WhatsApp e "Monte sua equipe"')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
