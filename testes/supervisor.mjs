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

console.log('\n\x1b[1m1 · Supervisor e Gestor de credenciamento SE COMBINAM (regra de 07/10/2026) — com troca de perfil\x1b[0m')
const vincular = trecho('async function vincularSupervisorAoSetor')
ok(vincular.includes("garantirFuncaoExtra(perfilId, 'supervisor'") && !vincular.includes('SUPERVISOR_NAO_E_GESTOR'),
  'todo vínculo de supervisor (tela, importação, IA) dá a função de supervisor como EXTRA a quem já tem outra — não recusa mais')
const operador = trecho('async function criarOperadorPortariaOuLanca', 4000)
ok(operador.includes("garantirFuncaoExtra(existente.id, 'operador_portao'") && !operador.includes('SUPERVISOR_NAO_E_GESTOR'),
  'criar Gestor para quem já é supervisor dá a função de Gestor como EXTRA, sem tocar na conta dela')

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

console.log('\n\x1b[1m6 · Link de recuperação de senha\x1b[0m')
const conv = readFileSync(new URL('../lib/supervisor-convite.ts', import.meta.url), 'utf8')
ok(recup.includes("finalidade: 'recuperacao'"), '"Esqueci a senha" cria o convite marcado como recuperação')
ok(conv.includes("finalidade: convite.estado.finalidade ?? 'acesso'"), 'convite antigo (sem o campo) continua sendo de primeiro acesso')
const conteudo = readFileSync(new URL('../app/supervisor/criar-senha/[token]/ConteudoCriarSenha.tsx', import.meta.url), 'utf8')
ok(conteudo.includes('{!recuperacao && (') && conteudo.includes('<CartaoDeEntrada>'), 'recuperação não mostra evento/fornecedor e usa a moldura do login')

console.log('\n\x1b[1m7 · Login por CPF acha conta com e-mail de verdade\x1b[0m')
const login = readFileSync(new URL('../app/api/auth/login/route.ts', import.meta.url), 'utf8')
ok(login.includes('auth.admin.getUserById') && login.includes('soDigitos && digitos.length === 11'), 'CPF que não bate com o e-mail interno procura a conta pelo CPF cadastrado')
ok(login.indexOf('signInWithPassword({\n    email: identificador') < login.indexOf('getUserById'), 'a primeira tentativa continua sendo a de sempre; a busca só entra se ela falhar')

console.log('\n\x1b[1m8 · Supervisor só bate o MEIO\x1b[0m')
const perm = readFileSync(new URL('../lib/permissions.ts', import.meta.url), 'utf8')
ok(perm.includes("soBateMeio = (role?: string) => role === 'supervisor'"), 'a régua única existe e vale pro papel supervisor')
ok(trecho('export async function lancarPontoManual', 6000).includes("agindoComoSupervisor && momento !== 'meio'"), 'lançamento manual recusa entrada/saída do supervisor no servidor')
ok(trecho('export async function registrarPresencaAssistida', 1500).includes("soBateMeio(perfil.role) && momento !== 'meio'"), 'registro de ponto recusa entrada/saída do supervisor no servidor')
const hist = readFileSync(new URL('../components/HistoricoBatidas.tsx', import.meta.url), 'utf8')
ok((hist.match(/editavel && !somenteMeio/g) ?? []).length === 3, 'histórico tira o lápis de entrada e saída do supervisor')
ok(readFileSync(new URL('../app/admin/lancar-ponto/LancarPonto.tsx', import.meta.url), 'utf8').includes('etapasVisiveis')
  && readFileSync(new URL('../app/admin/localizar/LocalizarFuncionario.tsx', import.meta.url), 'utf8').includes('soMeio'), 'as duas telas só oferecem o meio')

// ── Criar supervisor na página do SUBEVENTO: candidatos = evento inteiro (caso Lucy, 07/10/2026) ──
{
  const sub = readFileSync(new URL('../app/admin/eventos/[id]/subevento/[sid]/page.tsx', import.meta.url), 'utf8')
  const lista = readFileSync(new URL('../app/admin/eventos/[id]/ListaDeSetores.tsx', import.meta.url), 'utf8')
  ok(/candidatosASupervisor\s*=\s*async/.test(sub) && /\.eq\('evento_id', eventoId\)/.test(sub), 'o subevento busca os candidatos a supervisor no EVENTO inteiro')
  ok(/candidatosASupervisor=\{candidatosRows/.test(sub), 'a página do subevento passa essa lista à ListaDeSetores')
  ok(/funcionariosDoEvento=\{candidatosASupervisor \?\? funcionariosDoEvento\}/.test(lista), 'o cartão do setor usa a lista do evento inteiro em "Criar supervisor"')
}

// ── Mais um setor no MESMO evento não manda outra mensagem (Juan, 07/10/2026) ──
{
  const a = readFileSync(new URL('../lib/actions.ts', import.meta.url), 'utf8')
  ok(/if \(jaEraDesteEvento\) \{[\s\S]{0,400}avisado: false/.test(a), 'quem já foi avisado neste evento só ganha o setor, sem mensagem')
  ok(/jaFoiAvisadoNesteEvento\(\[telefone, existente\.telefone/.test(a), 'a checagem considera também o telefone que já está no cadastro')
  ok(/\.eq\('evento_id', eventoId\)\s*\.eq\('tipo', 'disparo_manual'\)/.test(a), 'o corte é por EVENTO (evento novo continua avisando)')
}

// ── Tirar supervisor de UM setor NÃO apaga a conta nem os outros setores (Juan, 08/10/2026) ──
{
  const a = readFileSync(new URL('../lib/actions.ts', import.meta.url), 'utf8')
  const modal = readFileSync(new URL('../app/admin/eventos/[id]/SupervisorModal.tsx', import.meta.url), 'utf8')
  const card = readFileSync(new URL('../app/admin/eventos/[id]/FornecedorCard.tsx', import.meta.url), 'utf8')
  const i = a.indexOf('export async function removerSupervisorDoSetor')
  const corpo = a.slice(i, a.indexOf('/**\n * Tira SÓ a função de operador de portão', i))
  ok(i > 0 && /from\('supervisor_setores'\)\.delete\(\)\.eq\('perfil_id', perfilId\)\.eq\('fornecedor_id', fornecedorId\)/.test(corpo.replace(/\s+/g, ' ')), 'a remoção apaga só o vínculo daquele setor')
  ok(!/deleteUser|from\('perfis'\)\.delete|deletarUsuario/.test(corpo), 'a remoção nunca apaga a conta nem o login')
  ok(!/deletarUsuario/.test(modal) && /removerSupervisorDoSetor\(props\.supervisor\.id, props\.fornecedorId\)/.test(modal), 'o botão do cartão do setor usa a remoção por setor')
  ok(/fornecedorId=\{f\.id\}/.test(card), 'o cartão passa o setor que está sendo editado')
  ok(/if \(!restantes\.length && alvo\.role !== 'supervisor'\) await removerFuncaoExtra\(perfilId, 'supervisor'\)/.test(corpo), 'só a função de supervisor sai quando acabam os setores — as outras funções ficam')
}

// ── Credencial do supervisor com vários setores: um QR só, e o topo mostra o evento e os setores (Juan, 08/10/2026) ──
{
  const cred = readFileSync(new URL('../app/credential/[token]/page.tsx', import.meta.url), 'utf8')
  ok(/from\('supervisor_setores'\)[\s\S]{0,160}eq\('fornecedores\.evento_id', evento\.id\)/.test(cred), 'a credencial busca os setores do supervisor NESTE evento')
  ok(/Supervisor de \{setoresDoSupervisor\.join\(' • '\)\}/.test(cred), 'o topo mostra "Supervisor de" e todos os setores')
  ok(/variosSetores \? '' : fornecedor\?\.nome/.test(cred), 'com vários setores, o setor do crachá não aparece sozinho')
}

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
