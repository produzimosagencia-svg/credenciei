/*
 * A MESMA PESSOA OPERANDO O PORTÃO EM MAIS DE UMA ORGANIZAÇÃO (Juan, 09/10/2026 — caso da Livia, Fatto + Navista:
 * "pode aceitar SIM... precisa ser resolvido pra não acontecer com casos futuros").
 *
 * Roda com: node testes/operador-varias-organizacoes.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
const servidor = ler('lib/supabase-server.ts'), actions = ler('lib/actions.ts'), internos = ler('lib/internos-servidor.ts'), contexto = ler('lib/contexto-eventos.ts')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

console.log('1 · criar operador para quem já é operador de outra organização')
ok(!/throw new Error\('Este CPF já está cadastrado em outra organização\.'\)/.test(actions), 'não recusa mais com "já está cadastrado em outra organização"')
ok(/existente\.organizacao_id && existente\.organizacao_id !== organizacaoId\) \{[\s\S]{0,900}garantirFuncaoExtra\(existente\.id, 'operador_portao', organizacaoId\)/.test(actions),
  'ganha o operador desta organização como função extra — a conta (e a primeira organização) não é tocada')
ok(/role !== 'operador_portao' \|\| \(\(perfil\.organizacao_id as string \| null\) \?\? null\) === organizacaoId/.test(internos), 'a função extra não responde "já tinha" só por ser operador de base em outra organização')

console.log('\n2 · usar o portão nas duas, sem trocar de perfil')
ok(/export function organizacoesDoOperador/.test(servidor) && /f\.role === 'operador_portao' && f\.organizacaoId/.test(servidor), 'as organizações do operador: a de base + as extras')
ok(/if \(\(organizacaoId \?\? null\) === \(perfil\?\.organizacao_id \?\? null\)\) return true/.test(servidor) && /perfil\?\.role === 'operador_portao' && organizacoesDoOperador\(perfil\)\.has/.test(servidor),
  'pros outros papéis a régua é exatamente a de sempre; só o operador ganha as outras')
ok(/return !!evento && !!evento\.organizacao_id && ehDaOrganizacaoDoPerfil\(perfil/.test(servidor), 'o leitor (QR e rosto) aceita evento de qualquer organização em que ele opera')
ok(/const orgs = \[\.\.\.organizacoesDoOperador\(perfil\)\][\s\S]{0,200}\.in\('organizacao_id', orgs\)/.test(servidor), 'a lista de eventos do leitor traz os eventos de todas')
ok((actions.match(/!ehMaster\(perfil\.role\) && !ehDaOrganizacaoDoPerfil\(perfil, evento\??\.organizacao_id\)/g) ?? []).length >= 5,
  'Registrar ponto, lançamento manual, lista de pessoas, veículos e equipe usam a mesma régua')
ok(/Gestor de credenciamento em mais de uma organização: os eventos de TODAS entram na mesma lista/.test(contexto), 'o seletor de eventos do topo já mostrava as duas')

console.log('\n3 · Registrar ponto (achado ao vivo, Livia no VITAL, 11/10/2026: só aparecia o evento da Fatto)')
const escolher = ler('app/admin/EscolherEvento.tsx'), localizar = ler('app/admin/localizar/page.tsx'), veiculos = ler('app/admin/veiculos/page.tsx')
ok(/perfil\.role === 'operador_portao'[\s\S]{0,600}const orgs = \[\.\.\.organizacoesDoOperador\(perfil\)\][\s\S]{0,120}\.in\('organizacao_id', orgs\)/.test(escolher),
  'a lista "Em qual evento?" traz os eventos de todas as organizações do operador')
ok(/!veTodosEventos\(perfil\) && !ehDaOrganizacaoDoPerfil\(perfil, evento\.organizacao_id\)/.test(localizar), 'a tela do evento em Registrar ponto abre')
ok(/!veTodosEventos\(perfil\) && !ehDaOrganizacaoDoPerfil\(perfil, evento\.organizacao_id\)/.test(veiculos), 'a tela de veículos do evento abre')
ok(/return org === perfil\.organizacao_id \|\| \(!!org && ehDaOrganizacaoDoPerfil\(perfil, org\)\)/.test(actions), 'a busca por CPF/nome acha as pessoas do evento')
ok(/eventoDoFunc\?\.organizacao_id === perfil\.organizacao_id\s*\|\| \(!!eventoDoFunc\?\.organizacao_id && ehDaOrganizacaoDoPerfil\(perfil, eventoDoFunc\.organizacao_id\)\)/.test(actions),
  'abrir a pessoa achada não responde "fora do seu acesso"')

console.log('\n4 · "Ver todos e gerenciar" mostra TODOS os operadores (Juan, 11/10/2026: "não consigo ver quem são")')
const card = ler('app/admin/eventos/[id]/OperadorPortariaCard.tsx'), criarPorteiro = ler('app/admin/criar-porteiro/page.tsx')
ok(/const visiveis = !completo\s*\? operadores\.slice\(0, LIMITE\)/.test(card), 'o card do evento continua com 6; a tela cheia mostra todos, com busca')
ok(/const sobrando = completo \? 0/.test(card) && /operadores\.length > 0 && !completo &&/.test(card), 'a tela cheia não tem mais os links que voltavam pra ela mesma')
ok(/metodoIdentificacao=\{metodoIdentificacao\}\s*completo\s*\/>/.test(criarPorteiro), '/admin/criar-porteiro abre a lista completa')
ok(/role === 'operador_portao'\s*\? `operador da \$\{organizacoes\?\.nome/.test(internos), 'operador de outra organização aparece com o nome dela no selo')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
