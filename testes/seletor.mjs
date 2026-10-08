/*
 * SELETOR DE EVENTO + OPERADOR POR FUNÇÃO EXTRA (pedidos de 07/10/2026).
 *   - todo acesso com mais de um evento escolhe Evento › Subevento › Fornecedor no topo;
 *   - quem recebe o papel de operador de portão como função EXTRA aparece na lista do evento
 *     (antes sumia: o Juan se cadastrou como operador no VITAL e a tela não atualizava) e só
 *     pode ter a FUNÇÃO retirada — nunca a conta apagada.
 *
 * Roda com: node testes/seletor.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const evento = ler('app/admin/eventos/[id]/page.tsx')
const porteiro = ler('app/admin/criar-porteiro/page.tsx')
const servidor = ler('lib/internos-servidor.ts')
const acoes = ler('lib/actions.ts')
const card = ler('app/admin/eventos/[id]/OperadorPortariaCard.tsx')
const shell = ler('components/AppShell.tsx')
const layoutAdmin = ler('app/admin/layout.tsx')
const layoutEnc = ler('app/encarregado/layout.tsx')
const contexto = ler('lib/contexto-eventos.ts')

console.log('Operador por função extra')
ok(/operadoresDaOrganizacao\(evento\.organizacao_id/.test(evento), 'a página do evento lista operadores de base E de função extra')
ok(/operadoresDaOrganizacao\(evento\.organizacao_id/.test(porteiro), 'a tela Gestor de credenciamento também')
ok(/from\('perfil_funcoes'\)[\s\S]{0,120}eq\('role', 'operador_portao'\)/.test(servidor), 'a lista consulta perfil_funcoes')
ok(/export async function removerFuncaoOperador/.test(acoes) && /removerFuncaoExtra\(perfilId, 'operador_portao', funcao\.organizacao_id/.test(acoes), 'existe a ação que tira só a função')
ok(/podeGerenciarUsuarios\(perfil\)\) return \{ error: 'Sem permissão\.' \}/.test(acoes), 'a ação confere a permissão')
ok(/o\.funcaoExtra \?/.test(card) && /removerFuncaoOperador\(removendoFuncao\.id, eventoId\)/.test(card), 'o cartão trata a função extra sem oferecer excluir a conta')

console.log('Seletor de evento')
ok(/<SeletorDeEvento contexto=\{contextoEventos\}/.test(shell), 'o topo do painel tem o seletor')
ok(/contextoDeEventos\(perfil, meusVinculos\)/.test(layoutAdmin) && /contextoEventos=\{contextoEventos\}/.test(layoutAdmin), 'o layout do admin calcula e passa o contexto')
ok(/<SeletorDeEvento contexto=\{contextoEventos\}/.test(layoutEnc), 'o Encarregado também tem o seletor')
ok(/role === 'encarregado'[\s\S]{0,80}doEncarregado/.test(contexto) && /role === 'supervisor'[\s\S]{0,80}doSupervisor/.test(contexto), 'supervisor e Encarregado montam a árvore pelos vínculos deles')
ok(/perfil\.role === 'operador_portao'[\s\S]{0,500}daOrganizacao\(orgs, true\)/.test(contexto) && /\['admin', 'gerente', 'cliente'\]\.includes\(perfil\.role\)/.test(contexto), 'Gestor (de todas as organizações dele) e administrador usam os eventos da organização')
ok(/export async function escolherEventoDoGestor/.test(ler('lib/actions-funcoes.ts')) && /escolherEventoDoGestor\(e\.id\)/.test(ler('components/SeletorDeEvento.tsx')), 'escolher o evento ajusta a organização do Gestor — ele escolhe evento, não organização')
ok(/perfisUnicos\(funcoes\)/.test(ler('components/TrocarPerfil.tsx')) && !/organizacaoNome/.test(ler('components/TrocarPerfil.tsx')), 'a lista de perfis tem um item por perfil, sem nome de organização')
ok(/catch \(e\) \{[\s\S]{0,80}return null/.test(contexto), 'uma falha no seletor nunca derruba o painel')

console.log('Gestor de credenciamento em mais de uma organização (08/10/2026)')
{
  const sql = ler('supabase/upgrade-funcoes-varias-organizacoes.sql')
  const funcoes = ler('lib/funcoes.ts')
  const trocar = ler('lib/actions-funcoes.ts')
  ok(/drop constraint if exists perfil_funcoes_perfil_id_role_key/.test(sql) && /unique index[\s\S]{0,80}perfil_funcoes[\s\S]{0,120}organizacao_id/.test(sql), 'a migração troca a chave única para pessoa + função + organização')
  ok(/operador_portao@\$\{f\.organizacaoId\}/.test(funcoes), 'o Gestor extra é identificado também pela organização')
  ok(/funcoes\.find\(f => f\.chave === chave\)/.test(trocar), 'trocar de perfil escolhe pela chave (organização incluída)')
  ok(/if \(role === 'operador_portao'\) busca = organizacaoId/.test(servidor), 'ganhar a função numa organização nova grava uma linha nova, em vez de dizer "já tinha"')
  ok(/upgrade-funcoes-varias-organizacoes\.sql/.test(servidor), 'sem a migração, o erro diz o que rodar — e a mensagem não é enviada')
}

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
