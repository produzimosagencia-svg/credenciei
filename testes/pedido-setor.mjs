/*
 * PEDIDO DE SETOR (formulário público → fila do admin → aprovar/negar) — as REGRAS, executadas de verdade
 * (lib/pedido-setor-regras.ts): o que o formulário aceita, estado do pedido, link com prazo e como um setor
 * aprovado vira o cadastro. Pedido do Juan, 08/10/2026.
 *
 * Roda com: node testes/pedido-setor.mjs
 */
import { register } from 'node:module'
import { readFileSync } from 'node:fs'

register('./_hook-ts.mjs', import.meta.url)
const R = await import('../lib/pedido-setor-regras.ts')

let falhas = 0
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const erro = (r, trecho, m) => ok(r.ok === false && r.erro.toLowerCase().includes(trecho.toLowerCase()), `${m}${r.ok === false ? '' : ' (aceitou!)'}${r.ok === false && !r.erro.toLowerCase().includes(trecho.toLowerCase()) ? ` — veio: ${r.erro}` : ''}`)

const CPF = '529.982.247-25' // válido
const CPF2 = '111.444.777-35' // válido
const sup = { nome: 'Maria da Silva', cpf: CPF, telefone: '(27) 99999-1234' }
const comDias = { dias: ['2026-10-10', '2026-10-11', '2026-10-12'], subeventoIds: ['sub1', 'sub2'] }
const semDias = { dias: [], subeventoIds: null }
const pedido = (setores, extra = {}) => ({ contato: sup, setores, ...extra })
const setor = (extra = {}) => ({ nome: 'gote - limpeza', subeventoId: 'sub1', quantidade: 10, porDia: { '2026-10-10': 8, '2026-10-11': 6 }, ...extra })

console.log('Pedido válido')
let r = R.normalizarPedidoPublico(pedido([setor()]), comDias)
ok(r.ok, 'um setor com dias e subevento é aceito')
ok(r.ok && r.valor.setores[0].nome === 'GOTE - LIMPEZA', 'o nome do setor vira maiúsculo, como no resto do sistema')
ok(r.ok && r.valor.contato.telefone === '27999991234' && r.valor.contato.cpf === '52998224725', 'telefone e CPF ficam só com dígitos')
ok(r.ok && r.valor.setores[0].supervisor.nome === 'Maria da Silva', 'sem supervisor próprio, o setor usa o responsável do pedido')
ok(r.ok && r.valor.setores[0].quantidade === 10 && r.valor.setores[0].porDia['2026-10-10'] === 8, 'total e pessoas por dia ficam como enviados')

r = R.normalizarPedidoPublico(pedido([setor({ nome: 'BAR', subeventoId: 'sub2' }), setor({ nome: 'Bar', subeventoId: 'sub1' })]), comDias)
ok(r.ok, 'o mesmo nome em subeventos diferentes é permitido (o GOTE - LIMPEZA do Vital)')
r = R.normalizarPedidoPublico(pedido([setor(), setor({ nome: 'GOTE  - limpeza ' })]), comDias)
erro(r, 'mais de uma vez', 'o mesmo setor duas vezes no pedido é barrado (ignora caixa e espaços)')

r = R.normalizarPedidoPublico(pedido([setor({ supervisor: { nome: 'João Souza', cpf: CPF2, telefone: '27988887777' } })]), comDias)
ok(r.ok && r.valor.setores[0].supervisor.cpf === '11144477735', 'um setor pode ter supervisor próprio')
r = R.normalizarPedidoPublico(pedido([setor({ supervisor: { nome: 'João Souza', cpf: '123', telefone: '27988887777' } })]), comDias)
erro(r, 'cpf', 'supervisor próprio com CPF inválido é recusado')

console.log('\nEvento sem dias nem subeventos')
r = R.normalizarPedidoPublico(pedido([{ nome: 'Som', quantidade: '5' }]), semDias)
ok(r.ok && r.valor.setores[0].subeventoId === null && Object.keys(r.valor.setores[0].porDia).length === 0, 'vale só o total; ninguém precisa escolher dia nem subevento')
r = R.normalizarPedidoPublico(pedido([{ nome: 'Som' }]), semDias)
erro(r, 'quantos colaboradores', 'sem o total o pedido não passa')

console.log('\nO que é recusado')
erro(R.normalizarPedidoPublico(pedido([]), comDias), 'pelo menos um setor', 'pedido sem setor')
erro(R.normalizarPedidoPublico(pedido(Array.from({ length: 13 }, (_, i) => setor({ nome: `S${i}` }))), comDias), 'até 12', 'mais de 12 setores num pedido')
erro(R.normalizarPedidoPublico({ contato: { ...sup, cpf: '111.111.111-11' }, setores: [setor()] }, comDias), 'cpf', 'CPF com dígitos iguais')
erro(R.normalizarPedidoPublico({ contato: { ...sup, cpf: '529.982.247-26' }, setores: [setor()] }, comDias), 'cpf', 'CPF com dígito verificador errado')
erro(R.normalizarPedidoPublico({ contato: { ...sup, telefone: '9999' }, setores: [setor()] }, comDias), 'whatsapp', 'telefone curto')
erro(R.normalizarPedidoPublico({ contato: { ...sup, nome: 'Jo' }, setores: [setor()] }, comDias), 'nome', 'nome curto')
erro(R.normalizarPedidoPublico(pedido([setor({ subeventoId: '' })]), comDias), 'subevento', 'evento de subeventos exige escolher o subevento')
erro(R.normalizarPedidoPublico(pedido([setor({ subeventoId: 'outro-evento' })]), comDias), 'não existe', 'subevento de outro evento')
erro(R.normalizarPedidoPublico(pedido([setor({ porDia: {} })]), comDias), 'pelo menos um dia', 'evento com dias exige ao menos um dia com número')
erro(R.normalizarPedidoPublico(pedido([setor({ porDia: { '2026-10-10': 0, '2026-10-11': '' } })]), comDias), 'pelo menos um dia', 'dia com 0 ou vazio não conta')
erro(R.normalizarPedidoPublico(pedido([setor({ porDia: { '2026-12-25': 3 } })]), comDias), 'não faz parte', 'dia que não é do evento')
erro(R.normalizarPedidoPublico(pedido([setor({ porDia: { '2026-10-10': 12 } })]), comDias), 'mais que o total', 'um dia com mais gente que o total do setor')
erro(R.normalizarPedidoPublico(pedido([setor({ quantidade: 1.5 })]), comDias), 'número inteiro', 'quantidade com vírgula')
erro(R.normalizarPedidoPublico(pedido([setor({ quantidade: 999999 })]), comDias), 'número inteiro', 'quantidade absurda')
erro(R.normalizarPedidoPublico(pedido([setor({ quantidade: -3 })]), comDias), 'número inteiro', 'quantidade negativa')
erro(R.normalizarPedidoPublico(pedido([setor()], { observacao: 'x'.repeat(501) }), comDias), 'observação', 'observação enorme')
erro(R.normalizarPedidoPublico(null, comDias), 'nome', 'corpo vazio não derruba')
erro(R.normalizarPedidoPublico(pedido([setor(), setor({ nome: 'BAR', quantidade: 'abc' })]), comDias), 'Setor 2', 'o erro diz em qual setor está o problema')

console.log('\nTelefone')
ok(R.normalizarTelefone('+55 (27) 99999-1234') === '27999991234', 'tira o 55 do país')
ok(R.normalizarTelefone('2733221100') === '2733221100', 'fixo de 10 dígitos serve')
ok(R.normalizarTelefone('123') === null && R.normalizarTelefone('') === null, 'curto ou vazio não serve')

console.log('\nEstado do pedido')
ok(R.statusDoPedido([{ status: 'pendente' }, { status: 'aprovado' }]) === 'pendente', 'enquanto sobra setor sem decisão, o pedido está pendente')
ok(R.statusDoPedido([{ status: 'aprovado' }, { status: 'aprovado' }]) === 'aprovado', 'todos aprovados')
ok(R.statusDoPedido([{ status: 'negado' }, { status: 'negado' }]) === 'negado', 'todos negados')
ok(R.statusDoPedido([{ status: 'aprovado' }, { status: 'negado' }]) === 'parcial', 'aprovado em parte')
ok(R.statusDoPedido([]) === 'pendente' && R.statusDoItemValido('lixo') === 'pendente', 'vazio ou desconhecido = pendente')

console.log('\nLink com prazo')
const agora = new Date('2026-10-10T12:00:00Z')
ok(R.situacaoDoLink({ ativo: false }, agora).aberto === false, 'desligado recusa')
ok(R.situacaoDoLink({ ativo: false }, agora).motivo === 'desligado', '… e diz que está desligado')
ok(R.situacaoDoLink({ ativo: true, prazo: null }, agora).aberto === true, 'ligado e sem prazo aceita')
ok(R.situacaoDoLink({ ativo: true, prazo: '2026-10-11T00:00:00Z' }, agora).aberto === true, 'antes do prazo aceita')
const vencido = R.situacaoDoLink({ ativo: true, prazo: '2026-10-09T00:00:00Z' }, agora)
ok(vencido.aberto === false && vencido.motivo === 'prazo', 'depois do prazo diz "pedidos encerrados"')

console.log('\nDo pedido aprovado para o cadastro')
const aprov = R.normalizarSetor(setor(), comDias, '', R.normalizarPedidoPublico(pedido([setor()]), comDias).valor.contato)
const campos = R.camposParaCriarFornecedor(aprov.valor)
ok(campos.nome === 'GOTE - LIMPEZA' && campos.quantidade_estimada === '10' && campos.subevento_id === 'sub1', 'nome, total e subevento vão para o cadastro')
ok(campos.supervisor_cpf === '52998224725' && campos.supervisor_telefone === '27999991234', 'o supervisor vai com CPF e telefone só de dígitos')
ok(campos.trava_presente === '1' && campos['trava_2026-10-10'] === '8' && campos['trava_2026-10-11'] === '6' && !('trava_2026-10-12' in campos), 'as pessoas por dia viram o limite por dia (só os dias pedidos)')
const semSub = R.camposParaCriarFornecedor({ ...aprov.valor, subeventoId: null, porDia: {} })
ok(!('subevento_id' in semSub) && !('trava_presente' in semSub), 'sem subevento e sem dias, esses campos nem aparecem')

console.log('\nTextos')
ok(R.descreverDias({ '2026-10-11': 6, '2026-10-10': 8 }) === 'Sáb 10/10: 8 · Dom 11/10: 6', 'os dias saem em ordem, com a semana')
ok(R.descreverDias({}) === '', 'sem dias, vazio')
ok(R.setoresNoTexto(['A', 'B', 'C']) === 'A, B e C' && R.setoresNoTexto(['Só']) === 'Só', 'lista de setores na mensagem')
ok(R.setoresNoTexto(['A\nB']) === 'A B', 'sem quebra de linha (a Meta recusa parâmetro com quebra)')
ok(R.motivoNoTexto('  Passou do orçamento.\n') === 'Passou do orçamento', 'o motivo vai numa linha e sem ponto repetido')
ok(R.podeDecidirPedidos('admin') && R.podeDecidirPedidos('master') && !R.podeDecidirPedidos('gerente') && !R.podeDecidirPedidos('supervisor') && !R.podeDecidirPedidos(undefined), 'só admin e master decidem')


console.log('\nSegurança e fiação')
const acoes = ler('lib/actions-pedidos-setor.ts')
const consulta = ler('lib/pedidos-setor-consulta.ts')
const proxy = ler('proxy.ts')
const sql = ler('supabase/upgrade-pedidos-de-setor.sql')
const eventoPag = ler('app/admin/eventos/[id]/page.tsx')
const menu = ler('components/AppShell.tsx')
const corpo = nome => acoes.slice(acoes.indexOf(`export async function ${nome}`), acoes.indexOf('\nexport async function', acoes.indexOf(`export async function ${nome}`) + 10) === -1 ? undefined : acoes.indexOf('\nexport async function', acoes.indexOf(`export async function ${nome}`) + 10))

ok(/pathname\.startsWith\('\/pedido-setor\/'\)/.test(proxy), 'o formulário e a página de acompanhamento são públicos (sem login)')
for (const nome of ['alternarLinkPedidoSetor', 'trocarTokenPedidoSetor', 'salvarItemDoPedido', 'aprovarItemDoPedido', 'negarItensDoPedido']) {
  ok(/decisorDoEvento\(/.test(corpo(nome)), `${nome}: só passa quem é admin/master do evento`)
}
ok(/podeDecidirPedidos\(perfil\.role\) \|\| !podeGerenciarUsuarios\(perfil\)|!podeDecidirPedidos\(perfil\.role\) \|\| !podeGerenciarUsuarios\(perfil\)/.test(acoes), 'decidir exige admin/master E a permissão de criar acessos')
ok(!/ehMaster\(perfil\.role\) && evento\.organizacao_id/.test(acoes) && /ev\.organizacao_id !== perfil\.organizacao_id/.test(acoes), 'admin só decide pedidos dos eventos da própria organização')
const publica = corpo('enviarPedidoDeSetor')
ok(/verificarTurnstile/.test(publica) && /podePassar/.test(publica), 'o envio público passa pelo captcha e pelo limite de envios')
ok(/situacaoDoLink/.test(publica) && /normalizarPedidoPublico/.test(publica), '… e confere link aberto, prazo e todas as regras no servidor')
ok(/delete\(\)\.eq\('id', criado\.id\)/.test(publica), 'se os setores não gravam, o pedido vazio é desfeito')
const aprovar = corpo('aprovarItemDoPedido')
ok(/criarFornecedor\(item\.evento_id, formulario\)/.test(aprovar), 'aprovar cria o setor pelo MESMO caminho da tela de fornecedores (supervisor, mensagem e limite por dia)')
ok(aprovar.indexOf(".eq('status', 'pendente')") < aprovar.indexOf('criarFornecedor('), 'a decisão é reservada ANTES de criar (dois cliques não criam o setor duas vezes)')
ok(/await desfazer\(\)/.test(aprovar), 'se a criação falhar, o setor volta a pendente e o erro vai para quem aprovou')
ok(/Já existe um setor/.test(aprovar), 'setor com o mesmo nome no mesmo subevento não é criado de novo')
const negar = corpo('negarItensDoPedido')
ok(/template: 'pedido_setor_reprovado'/.test(negar) && /agendarTemplateSupervisor/.test(negar), 'negar manda a mensagem de reprovação pela fila oficial')
ok(/motivoNoTexto/.test(negar) && /razao\.length < 3/.test(negar), 'o motivo é obrigatório')
ok(!/throw new Error/.test(acoes), 'nenhuma ação lança erro (o Next esconde a mensagem em produção)')
ok(/podeDecidirPedidos\(perfil\.role\)\) return 0/.test(corpo('contarPedidosPendentes')), 'o número do menu só existe para admin/master')
ok(/enable row level security/.test(sql) && (sql.match(/enable row level security/g) ?? []).length === 3, 'as três tabelas novas só abrem pelo servidor (RLS ligado)')
ok(/pedido_setor_ativo boolean not null default false/.test(sql), 'o link nasce FECHADO em todo evento')

const tipoPublico = consulta.slice(consulta.indexOf('export type PedidoPublico'), consulta.indexOf('export async function pedidoPublicoPorToken'))
ok(!/cpf|telefone/i.test(tipoPublico), 'a página pública de acompanhamento nunca recebe CPF nem telefone')
ok(/\[a-f0-9\]\{32\}/.test(consulta), 'o endereço de acompanhamento só aceita o código esperado')
ok(/verPedidosDeSetor = podeDecidirPedidos\(perfil\.role\)/.test(eventoPag) && /\{verPedidosDeSetor && \(\s*<PedidosSetorCard/.test(eventoPag), 'o cartão do evento só aparece para admin/master')
ok(/podeDecidirPedidos\(role\)/.test(menu) && /Pedidos \(setor e equipe\)/.test(menu), 'o item do menu só aparece para admin/master')

console.log('\nMensagem de reprovação')
const modelos = ler('lib/mensagens-modelos.ts')
const { renderizarMensagem } = await import('../lib/mensagens-modelos.ts')
const texto = renderizarMensagem('pedido_setor_reprovado', ['Maria', 'BAR e LIMPEZA', 'VITAL', 'Passou do orçamento'])
ok(texto?.includes('Olá, Maria!') && texto.includes('BAR e LIMPEZA') && texto.includes('VITAL') && texto.includes('Motivo: Passou do orçamento.'), 'o texto leva nome, setores, evento e motivo')
ok(texto != null && !texto.startsWith('Maria') && !texto.trimEnd().endsWith('Passou do orçamento'), 'não começa nem termina numa variável (regra da Meta)')
ok(/pedido_setor_reprovado/.test(ler('supabase/TEMPLATES-WHATSAPP.md')), 'o modelo está documentado para cadastrar na Meta')
ok(/'pedido_setor_reprovado'/.test(ler('lib/mensagens.ts')), 'a fila oficial aceita este modelo')

console.log('\nMais colaboradores (supervisor → admin)')
let a = R.normalizarAmpliacao({ atual: 10, desejada: '15', motivo: 'Demanda do bar aumentou' })
ok(a.ok && a.valor.desejada === 15, 'pedir 15 quando o combinado é 10 passa')
erro(R.normalizarAmpliacao({ atual: 10, desejada: 10, motivo: 'Demanda do bar' }), 'maior que o de hoje', 'pedir o mesmo número (ou menos) não é pedir mais')
erro(R.normalizarAmpliacao({ atual: 10, desejada: 15, motivo: 'ok' }), 'motivo', 'o motivo é obrigatório')
erro(R.normalizarAmpliacao({ atual: null, desejada: '', motivo: 'Demanda' }), 'quantos colaboradores', 'sem número não passa')
ok(R.normalizarAmpliacao({ atual: null, desejada: 3, motivo: 'Setor sem combinado' }).ok, 'setor sem combinado aceita qualquer número')
ok(R.lerQuantidadeAprovada('7') === 7 && R.lerQuantidadeAprovada('0') === null && R.lerQuantidadeAprovada('x') === null, 'o número aprovado é inteiro e positivo')
ok(R.respostaDaAmpliacao({ aprovado: true, aprovada: 12, desejada: 15 }) === 'APROVADO — o setor agora tem 12 colaboradores combinados (você pediu 15)', 'aprovado com menos: diz quanto ficou e quanto pediu')
ok(R.respostaDaAmpliacao({ aprovado: true, aprovada: 15, desejada: 15 }) === 'APROVADO — o setor agora tem 15 colaboradores combinados', 'aprovado como pediu')
ok(R.respostaDaAmpliacao({ aprovado: false, motivo: 'Fora do orçamento.' }) === 'NÃO APROVADO — Fora do orçamento', 'negado leva o motivo')

const solicitar = corpo('solicitarMaisColaboradores')
ok(/perfil\.role !== 'supervisor' \|\| !\(await alcancaSetor\(perfil, fornecedorId\)\)/.test(solicitar), 'só o supervisor DESTE setor pede')
ok(/eq\('status', 'pendente'\)\.limit\(1\)/.test(solicitar) && /já tem um pedido aguardando/.test(solicitar), 'um pedido aberto por setor de cada vez')
for (const nome of ['aprovarAmpliacao', 'negarAmpliacao']) ok(/decisorDoEvento\(/.test(corpo(nome)), `${nome}: só admin/master do evento`)
const aprovarA = corpo('aprovarAmpliacao')
ok(aprovarA.indexOf(".eq('status', 'pendente')") < aprovarA.indexOf("update({ quantidade_estimada: aprovada })"), 'a decisão é reservada antes de mudar o combinado do setor')
ok(/template: 'ampliacao_resposta'/.test(acoes), 'a resposta vai para o supervisor pelo modelo ampliacao_resposta')
ok(/ampliacao_resposta/.test(ler('supabase/TEMPLATES-WHATSAPP.md')) && /ampliacao_resposta: \(\[nome, setor, evento, resposta\]\)/.test(ler('lib/mensagens-modelos.ts')), 'o modelo está escrito e documentado para cadastrar na Meta')
ok(/supervisorDesteSetor && \(\s*<SolicitarMaisColaboradores/.test(ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx')), 'o botão aparece só para o supervisor do setor')
ok(/<PainelAmpliacoes/.test(ler('app/admin/eventos/[id]/pedidos-setor/page.tsx')), 'os pedidos de mais colaboradores aparecem na fila do admin')
ok(/pedidos_ampliacao/.test(corpo('contarPedidosPendentes')), 'o número do menu soma os pedidos de mais colaboradores')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
