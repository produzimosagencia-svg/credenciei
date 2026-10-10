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

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
