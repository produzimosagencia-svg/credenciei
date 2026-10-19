/*
 * CONVITE POR WHATSAPP, RESUMO DO SUPERVISOR E STATUS DA CREDENCIAL NA EQUIPE (Juan, 18/10/2026).
 *
 * 1. As regras (lib/convites-regras.ts) de verdade: a lista colada, o telefone, o texto do resumo.
 * 2. O servidor e a tela, pelo código-fonte.
 *
 * Roda com: node testes/convites-e-resumo.mjs
 */
import { readFileSync } from 'node:fs'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const R = await import(raiz + 'lib/convites-regras.ts')

console.log('1 · A lista colada e o telefone')
const lidas = R.lerListaDeConvites('Ana Silva 27 99999-0000\n(27) 98888-1111 - Bruno\n+55 27 97777-2222\nsó um nome\nAna de novo 27999990000\n27 0000-0000 genérico\n\n27 3333-4444 Fixo')
ok(lidas.filter(l => !l.erro).map(l => l.telefone).join() === '27999990000,27988881111,27977772222,2733334444', 'acha o telefone em qualquer posição, tira o 55, junta repetidos: ' + lidas.filter(l => !l.erro).map(l => l.telefone).join())
ok(lidas.find(l => l.telefone === '27999990000').nome === 'Ana Silva' && lidas.find(l => l.telefone === '27988881111').nome === 'Bruno', 'o nome que vem junto fica')
ok(lidas.filter(l => l.erro).map(l => l.linha).join('|') === 'só um nome|27 0000-0000 genérico', 'linha sem telefone e o telefone genérico voltam com o motivo')
ok(R.mesmoTelefone('27999990000', '2799990000') && R.mesmoTelefone('5527999990000', '(27) 99999-0000') && !R.mesmoTelefone('27999990000', '27999990001'), 'o mesmo número com ou sem o 9 e o 55')
ok(R.normalizarTelefoneBR('27 8999-0000') === '2789990000' && R.normalizarTelefoneBR('27 89999-0000') === null && R.normalizarTelefoneBR('2700000000') === null, '11 dígitos só com o 9; genérico não vale')
ok(R.telefoneMascarado('27999990000') === '(27) 9••••-0000', 'na tela o telefone aparece mascarado')

console.log('\n2 · O resumo do supervisor')
ok(R.textoDoResumo({ aprovar: 12, credenciaisFalharam: 3, convidadosSemCadastro: 5 }) === '12 pessoas aguardando sua aprovação, 3 credenciais que não chegaram no WhatsApp e 5 convidados que ainda não se cadastraram', 'as três pendências numa frase, sem quebra de linha')
ok(R.textoDoResumo({ aprovar: 1, credenciaisFalharam: 0, convidadosSemCadastro: 0 }) === '1 pessoa aguardando sua aprovação', 'singular')
ok(R.textoDoResumo({ aprovar: 0, credenciaisFalharam: 0, convidadosSemCadastro: 0 }) === null, 'sem pendência, sem mensagem')

console.log('\n3 · O servidor')
const conv = ler('lib/convites.ts')
const acoes = ler('lib/actions-convites.ts')
ok(/if \(provedor\(\) === 'evolution'\) return true/.test(conv) && /t\.status === 'APPROVED'/.test(conv), 'só envia com o modelo aprovado na Meta (ou pela Evolution)')
ok(/if \(!\(await modeloPronto\(MODELO_CONVITE\)\)\)/.test(acoes) && /O convite por WhatsApp começa a funcionar quando a Meta aprovar/.test(acoes), 'convite sem o modelo aprovado: avisa na tela, não envia')
ok(/acessoAEquipe\(fornecedorId\)/.test(acoes) && /motivoCadastroTravado\(a\.evento\.id/.test(acoes) && /O link de cadastro desta equipe está desligado/.test(acoes), 'mesma régua da equipe, cadastro travado e link desligado')
ok(/Este telefone \$\{onde\}\./.test(acoes) && /Já foi convidado para esta equipe\./.test(acoes), 'quem já está no evento ou já foi convidado não recebe de novo')
ok(/if \(hora < 8 \|\| hora >= 21\) return/.test(conv) && /\.is\('lembrado_em', null\)\.is\('cadastrado_em', null\)\.is\('cancelado_em', null\)/.test(conv), 'lembrete: uma vez, entre 8h e 21h, só para quem não se cadastrou nem foi cancelado')
ok(/\.update\(\{ lembrado_em: new Date\(\)\.toISOString\(\) \}\)\.eq\('id', c\.id\)\.is\('lembrado_em', null\)\.select\('id'\)/.test(conv), 'marca antes de enfileirar: duas varreduras juntas não mandam dois lembretes')
ok(/if \(hora < 9 \|\| hora >= 12\) return/.test(conv) && /CHAVE_RESUMO/.test(conv) && /resumo-\$\{perfilId\}-\$\{eventoId\}-\$\{hoje\}/.test(conv), 'resumo: uma vez por dia, por supervisor e evento, a partir das 9h')
ok(/if \(!texto \|\| !perfil \|\| perfil\.ativo === false/.test(conv), 'resumo sem pendência (ou supervisor sem telefone) não sai')
ok(/fluxoDesligado\('resumo_supervisor'\)/.test(conv) && /fluxoDesligado\('lembrete_convite'\)/.test(conv) && /chave: 'resumo_supervisor'/.test(ler('lib/whatsapp-painel.ts')), 'os dois dá para desligar no painel do WhatsApp')
const cron = ler('app/api/cron/enviar-mensagens/route.ts')
ok(/await processarLembretesDeConvite\(\)/.test(cron) && /await enviarResumosDoDia\(\)/.test(cron), 'o cron de mensagens roda as duas varreduras')
const modelos = ler('lib/mensagens-modelos.ts')
const doc = ler('supabase/TEMPLATES-WHATSAPP.md')
ok(['convite_cadastro_equipe', 'lembrete_convite_equipe', 'resumo_pendencias_supervisor'].every(m => modelos.includes(`${m}: (`) && doc.includes(`\`${m}\``)), 'os três modelos novos têm texto e guia para cadastrar na Meta')
ok(/create table if not exists convites_equipe/.test(ler('supabase/upgrade-convites-equipe.sql')) && /Falta rodar o SQL supabase\/upgrade-convites-equipe\.sql/.test(acoes), 'SQL da tabela; sem ele, a tela avisa')

console.log('\n4 · Status da credencial na lista da equipe')
const pagina = ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx')
const tabela = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioTable.tsx')
ok(/statusDasCredenciais\(\(funcionarios \?\? \[\]\)\s*\.filter\(f => !f\.descredenciado_em && statusCredenciamentoValido/.test(pagina) && /credencial: credenciais\.get\(f\.id as string\) \?\? null/.test(pagina), 'a página busca o status de quem está valendo na equipe')
ok(/const credencialNaoChegou = \(f: \{ credencial\?: Funcionario\['credencial'\] \}\) => f\.credencial === 'falhou'/.test(tabela) && /CREDENCIAL NÃO CHEGOU/.test(tabela), 'só a mensagem que falhou acende em vermelho (sem alarme falso)')
ok(/\['credencial', `Credencial não chegou/.test(tabela) && /filtroRapido === 'credencial' && !credencialNaoChegou\(f\)/.test(tabela), 'filtro rápido "Credencial não chegou"')
ok(/statusDaMensagem/.test(ler('lib/credencial-whatsapp.ts')) && /from '\.\/credencial-whatsapp'/.test(ler('lib/actions-historico.ts')), 'uma regra só de status, usada na equipe, no Monte sua equipe, no convite e no resumo')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
