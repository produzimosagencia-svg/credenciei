/*
 * LISTA MANUAL — entrada sem QR Code (Juan, 16/10/2026): convidados, prestadores, equipe interna. O admin cadastra,
 * a portaria acha pelo nome ou CPF e confirma a entrada. As regras puras rodando de verdade, e o resto (acesso,
 * concorrência, LGPD) conferido no código.
 *
 * Roda com: node testes/lista-manual.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const dir = mkdtempSync(join(tmpdir(), 'lista-manual-'))
writeFileSync(join(dir, 'format.ts'), ler('lib/format.ts'))
writeFileSync(join(dir, 'regras.ts'), ler('lib/lista-manual-regras.ts').replace("from './format'", "from './format.ts'"))
const R = await import(join(dir, 'regras.ts'))

console.log('1 · o cadastro (a mesma régua na tela e no servidor)')
const bom = R.lerPessoaDaLista({ nome: '  maria   eduarda  ', cpf: '178.936.537-60', telefone: '027 99735-6345', categoria: 'convidado / lista vip' })
ok(bom.ok && bom.dados.nome === 'maria eduarda' && bom.dados.cpf === '17893653760' && bom.dados.telefone === '27997356345' && bom.dados.categoria === 'Convidado / Lista VIP',
  'normaliza: espaços, CPF só dígitos, telefone sem o 0 da operadora, categoria na grafia padrão')
ok(!R.lerPessoaDaLista({ nome: 'Maria', categoria: 'Outro' }).ok, 'nome completo é obrigatório (nome e sobrenome)')
ok(!R.lerPessoaDaLista({ nome: 'Maria 2 Silva', categoria: 'Outro' }).ok, 'nome com número não passa')
ok(!R.lerPessoaDaLista({ nome: 'Maria Silva', cpf: '111.111.111-11', categoria: 'Outro' }).ok, 'CPF inválido não passa')
ok(R.lerPessoaDaLista({ nome: 'Maria Silva', categoria: 'Outro' }).ok, 'sem CPF passa (convidado estrangeiro, lista só com nome)')
ok(!R.lerPessoaDaLista({ nome: 'Maria Silva', telefone: '9999', categoria: 'Outro' }).ok, 'telefone curto não passa')
ok(R.lerPessoaDaLista({ nome: 'Maria Silva', telefone: '+55 (27) 99735-6345', categoria: 'Outro' }).dados?.telefone === '27997356345', 'telefone com +55 fica só com DDD e número')
ok(!R.lerPessoaDaLista({ nome: 'Maria Silva', categoria: '   ' }).ok, 'categoria é obrigatória')
ok(R.lerPessoaDaLista({ nome: 'Maria Silva', categoria: 'Imprensa' }).dados?.categoria === 'Imprensa', 'categoria nova entra como foi escrita')

console.log('\n2 · categorias e máscara')
ok(JSON.stringify(R.categoriasParaEscolher(['Imprensa', 'imprensa', 'OUTRO', 'Patrocinador'])) === JSON.stringify([...R.CATEGORIAS_PADRAO, 'Imprensa', 'Patrocinador']),
  'as padrão primeiro, depois as criadas no evento, sem repetir')
ok(R.mascararCpf('09047385748') === '***.473.857-**' && R.mascararCpf('123') === null && R.mascararCpf(null) === null, 'CPF mascarado: só o meio aparece')

console.log('\n3 · a busca da portaria')
const p = { nome: 'Gláucio Trancoso', cpf: '01872669727' }
ok(R.bateComABusca(p, 'glaucio') && R.bateComABusca(p, 'TRANC') && !R.bateComABusca(p, 'maria'), 'pelo nome, sem acento nem caixa')
ok(R.bateComABusca(p, '018.726') && R.bateComABusca(p, '01872669727'), 'pelo CPF (quem vê o CPF inteiro), com ou sem pontuação')
ok(!R.bateComABusca({ nome: 'Gláucio Trancoso', cpf: null }, '018726'), 'sem o CPF na tela (operador), dígitos não batem aqui — vão ao servidor')

console.log('\n4 · banco: uma lista por evento, sem duplicar, sem apagar')
const sql = ler('supabase/upgrade-lista-manual.sql')
ok(/create table if not exists lista_manual/.test(sql) && /evento_id\s+uuid not null references eventos\(id\) on delete cascade/.test(sql), 'tabela própria, presa ao evento')
ok(/create unique index if not exists lista_manual_evento_cpf_uniq\s+on lista_manual \(evento_id, cpf\) where cpf is not null and removido_em is null/.test(sql), 'o mesmo CPF não entra duas vezes na lista do MESMO evento')
ok(/check \(cpf is null or cpf ~ '\^\[0-9\]\{11\}\$'\)/.test(sql) && /enable row level security/.test(sql), 'CPF só dígitos; RLS ligado (service-role-only, como o resto)')
ok(/removido_em\s+timestamptz/.test(sql) && !/delete from lista_manual/.test(ler('lib/actions-lista-manual.ts')), 'tirar da lista não apaga (removido_em)')

console.log('\n5 · acesso: toda action confere de novo, e só no evento certo')
const acoes = ler('lib/actions-lista-manual.ts'), acesso = ler('lib/lista-manual.ts')
const exportadas = [...acoes.matchAll(/export async function (\w+)/g)].map(m => m[1])
ok(exportadas.length === 6, `6 actions: ${exportadas.join(', ')}`)
for (const nome of exportadas) {
  const corpo = acoes.slice(acoes.indexOf(`export async function ${nome}`)).split(/\nexport async function /)[0]
  ok(/await (exigirGerenciar|acessoAListaManual)\(eventoId\)/.test(corpo), `${nome}: confere o acesso ao evento`)
}
for (const nome of ['adicionarPessoaNaLista', 'editarPessoaDaLista', 'tirarDaLista', 'desfazerEntradaNaLista']) {
  const corpo = acoes.slice(acoes.indexOf(`export async function ${nome}`)).split(/\nexport async function /)[0]
  ok(/await exigirGerenciar\(eventoId\)/.test(corpo), `${nome}: só quem gerencia a lista`)
}
ok((acoes.match(/\.eq\('id', id\)\.eq\('evento_id', eventoId\)/g) ?? []).length >= 5, 'toda linha é lida/gravada pelo id E pelo evento (uma lista nunca mexe em outra)')
ok(/ehMaster\(perfil\.role\) && !ehDaOrganizacaoDoPerfil\(perfil, organizacaoId\)/.test(acesso) && /suporteTemEscopo\(perfil\.id/.test(acesso), 'evento da organização da pessoa (suporte: do escopo dele)')
ok(/perfil\.role === 'operador_portao' && !\(await eventosAindaVigentes\(\[eventoId\]\)\)\.has\(eventoId\)/.test(acesso), 'operador de portão: só evento que ainda vale (a regra do seletor)')
const perm = ler('lib/permissions.ts')
ok(/podeGerenciarListaManual = capacidade\('gerenciar_lista_manual', role =>\s+role === 'master' \|\| role === 'admin'\)/.test(perm), 'gerenciar: master e administrador')
ok(/podeConferirListaManual = capacidade\('conferir_lista_manual', role =>\s+podeEscanear\(role\) \|\| podeGerenciarListaManual\(role\)\)/.test(perm), 'conferir: quem lê o QR (operador de portão incluso) e quem gerencia')
ok(/chave: 'gerenciar_lista_manual'/.test(perm) && /chave: 'conferir_lista_manual'/.test(perm), 'as duas aparecem em Configurações → permissões (sem papel novo)')

console.log('\n6 · portaria: confirmar sem duplicar')
const confirmar = acoes.slice(acoes.indexOf('export async function confirmarEntradaNaLista')).split(/\nexport async function /)[0]
ok(/\.eq\('id', id\)\.eq\('evento_id', eventoId\)\.is\('removido_em', null\)\.is\('presente_em', null\)/.test(confirmar), 'o UPDATE só pega quem ainda não entrou — dois operadores ao mesmo tempo, um grava')
ok(/return \{ jaEntrou: true, pessoa:/.test(confirmar), 'o outro recebe "já entrou" (com horário e quem confirmou)')
ok(/confirmado_por_perfil_id: acesso\.perfil\.id, confirmado_por_nome: acesso\.perfil\.nome/.test(confirmar) && /'LISTA_MANUAL_ENTRADA'/.test(confirmar), 'grava quem confirmou e vai para a auditoria')
ok(/eventosAcontecendoHoje\(\[eventoId\]\)/.test(confirmar), 'só nos dias do evento, como o scanner')
const desfazer = acoes.slice(acoes.indexOf('export async function desfazerEntradaNaLista')).split(/\nexport async function /)[0]
ok(/porque\.length < 5/.test(desfazer) && /'LISTA_MANUAL_ENTRADA_DESFEITA'/.test(desfazer), 'desfazer uma entrada: com motivo, na auditoria')

console.log('\n7 · LGPD: o CPF inteiro não vai para a tela de quem só confere')
ok(/cpf: verCpfInteiro \? l\.cpf : null/.test(acesso) && /pessoasDaListaManual\(eventoParam, acesso\.podeGerenciar\)/.test(ler('app/admin/lista-manual/page.tsx')), 'só quem gerencia recebe o CPF inteiro; os outros, a máscara')
ok(/export async function buscarCpfNaListaManual/.test(acoes) && /return \{ ids: \(data \?\? \[\]\)\.map\(l => l\.id as string\) \}/.test(acoes), 'o operador busca o CPF no servidor, que devolve só os ids')
const painel = ler('app/admin/lista-manual/PainelListaManual.tsx')
ok(/cpfInteiroAberto \? formatCpf\(p\.cpf \?\? ''\) : p\.cpfMascarado/.test(painel), 'mesmo para quem gerencia, a tela mostra mascarado (o olho abre)')

console.log('\n8 · a tela')
ok(/Adicionar pessoa à lista/.test(painel) && /Confirmar entrada/.test(painel) && /JÁ ENTROU às/.test(painel), '"Adicionar pessoa à lista", "Confirmar entrada" e o aviso de entrada já registrada')
ok(/<AutoRefresh segundos=\{15\} \/>/.test(ler('app/admin/lista-manual/page.tsx')), 'a lista se atualiza sozinha (outro operador confirmou)')
ok(/href: '\/admin\/lista-manual', label: 'Lista manual'/.test(ler('components/AppShell.tsx')), 'item "Lista manual" no menu')
ok(/naListaManual > 0 &&/.test(ler('app/admin/bem-vindo/page.tsx')), 'na tela do operador, o botão aparece quando o evento tem alguém na lista')
const rotulos = ler('lib/auditoria-rotulos.ts')
ok(['LISTA_MANUAL_CADASTRO', 'LISTA_MANUAL_EDICAO', 'LISTA_MANUAL_REMOCAO', 'LISTA_MANUAL_ENTRADA', 'LISTA_MANUAL_ENTRADA_DESFEITA'].every(a => rotulos.includes(`${a}:`)), 'os rótulos das ações na auditoria')
ok(!/lista_manual/.test(ler('lib/actions.ts')), 'nada do credenciamento com QR foi tocado (lib/actions.ts não conhece a lista)')

console.log('\n9 · operador de portão só CONSULTA (Juan, 16/10/2026: "apenas ler")')
ok(/podeConfirmarEntradaListaManual = capacidade\('confirmar_entrada_lista_manual', role =>\s+podeGerenciarListaManual\(role\)\)/.test(perm), 'confirmar a entrada: master e administrador, por padrão')
ok(/operador_portao: \['confirmar_entrada_lista_manual'\]/.test(perm) && /chave: 'confirmar_entrada_lista_manual'/.test(perm), 'para um operador confirmar, liga-se a permissão para ele (sem mexer no código)')
ok(/if \(!acesso\.podeConfirmar\) return \{ erro:/.test(confirmar), 'o servidor recusa a confirmação de quem só consulta')
ok(/podeConfirmar: podeGerenciar \|\| podeConfirmarEntradaListaManual\(perfil\)/.test(acesso) && /podeConfirmar=\{acesso\.podeConfirmar\}/.test(ler('app/admin/lista-manual/page.tsx')), 'a tela só mostra "Confirmar entrada" para quem pode')

console.log('\n10 · aviso no WhatsApp (modelo da Meta `lista_manual_confirmacao`)')
const modelos = ler('lib/mensagens-modelos.ts'), doc = ler('supabase/TEMPLATES-WHATSAPP.md')
ok(/lista_manual_confirmacao: \(\[nome, evento, categoria, data, local\]\) =>/.test(modelos) && /## 10\. `lista_manual_confirmacao`/.test(doc), 'o texto no sistema e na receita da Meta, com as mesmas 5 variáveis')
ok(/entrada\.avisarWhatsapp === true \? await avisarNoWhatsapp\(eventoId, dados\) : false/.test(acoes), 'só avisa quando quem cadastra deixa marcado')
ok(/umaLinha/.test(acoes), 'nenhuma variável com quebra de linha (a Meta recusa)')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
