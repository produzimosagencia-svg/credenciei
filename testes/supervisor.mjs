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

console.log('\n\x1b[1m3 · Trava por dia no portão\x1b[0m')
const aut = trecho('async function autorizarPresenca', 24000)
ok(aut.includes('vagaNoSetorNoDia(') && aut.includes('setorLotado: true') && aut.includes("momento === 'entrada'"),
  'autorizarPresenca barra a ENTRADA quando o setor lotou, com setorLotado')
ok(aut.indexOf('vagaNoSetorNoDia(') > aut.indexOf('resolucao.jaEm'),
  'quem já entrou hoje (leitura repetida) nunca é barrado — a checagem vem depois')
ok((actions.match(/vagaNoSetorNoDia\(/g) ?? []).length >= 3, 'portão, biometria pelo celular e registro pelo celular conferem')
const esc = readFileSync(new URL('../lib/escala.ts', import.meta.url), 'utf8')
ok(esc.includes("origemDaPessoa === 'supervisor') return { ok: true }"), 'o crachá do supervisor não ocupa nem sofre a trava')
ok(esc.includes('if (erroContagem) return { ok: true }'), 'erro de leitura não tranca o portão')

console.log('\n\x1b[1m4 · Recuperação de senha sai na hora\x1b[0m')
const recup = trecho('export async function solicitarRecuperacaoSenha', 2600)
ok(recup.includes('enviarMensagemAgora(mensagemId)') && recup.includes('after('), 'o envio imediato roda depois da resposta (after), sem travar a tela')
const msgs = readFileSync(new URL('../lib/mensagens.ts', import.meta.url), 'utf8')
const agora = msgs.slice(msgs.indexOf('export async function enviarMensagemAgora'), msgs.indexOf('export async function enviarMensagemAgora') + 900)
ok(agora.includes(".eq('status', 'pendente')") && agora.includes("status: 'enviando'"), 'reivindica pelo status — se a fila chegar junto, só um envia (nunca duas mensagens)')
ok(agora.includes('WHATSAPP_PAUSADO'), 'respeita o interruptor de emergência do WhatsApp')

console.log('\n\x1b[1m5 · Base de funcionários: só o master edita\x1b[0m')
const baseAct = trecho('export async function editarDadosDaPessoaNaBase', 1800)
ok(/if \(!perfil \|\| !ehMaster\(perfil\.role\)\) return \{ erro: 'Só o master/.test(baseAct), 'a ação recusa quem não é master (o servidor decide, não a tela)')
ok(baseAct.includes('validarCpf(novoCpf)') && baseAct.includes('conflitos'), 'CPF novo: dígito válido e sem conflito com outra pessoa no mesmo evento')
const fichaPag = readFileSync(new URL('../app/admin/pessoas/[cpf]/page.tsx', import.meta.url), 'utf8')
ok(fichaPag.includes("if (!ehMaster(perfil.role)) redirect('/admin')") && fichaPag.includes('<EditarDadosPessoa'), 'a ficha já é só do master e traz o botão Editar dados')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
