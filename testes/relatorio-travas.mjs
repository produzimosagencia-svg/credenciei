/*
 * "Quais setores não estão com a trava de pessoas por dia" — pedido do Juan, 08/10/2026. Texto cru, mesmo padrão
 * dos outros testes de lib/actions.ts (cliente de serviço no topo, não pode ser live-importado sem env vars).
 *
 * Roda com: node testes/relatorio-travas.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = caminho => readFileSync(raiz + caminho, 'utf8')

const escala = ler('lib/escala.ts')
const actions = ler('lib/actions.ts')
const view = ler('app/admin/eventos/[id]/travas/RelatorioTravasView.tsx')
const paginaEvento = ler('app/admin/eventos/[id]/travas/page.tsx')
const paginaMenu = ler('app/admin/travas/page.tsx')
const shell = ler('components/AppShell.tsx')

let falhas = 0
function ok(cond, nome) {
  if (!cond) falhas++
  console.log(`  ${cond ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${nome}`)
}

console.log('1 · relatorioTravasPorDia agrupa em sem_trava/parcial/completa')
ok(/export async function relatorioTravasPorDia/.test(escala), 'função existe em lib/escala.ts')
ok(/comTrava === 0 \? 'sem_trava' : comTrava === porDia\.length \? 'completa' : 'parcial'/.test(escala),
  'situação vem da contagem de dias com trava configurada')

console.log('\n2 · obterRelatorioTravas confere permissão de gestor de eventos (não cabe pro supervisor)')
ok(/export async function obterRelatorioTravas[\s\S]{0,200}?exigirEventoDaOrg\(eventoId\)/.test(actions),
  'usa exigirEventoDaOrg — mesma régua de carregarTravasDoModal')

console.log('\n3 · a tela: busca por setor/supervisor, três grupos, cores por situação')
ok(view.includes("l.nome.toLowerCase().includes(termo)"), 'busca filtra por nome do setor')
ok(view.includes('l.supervisores.some(s => s.toLowerCase().includes(termo))'), 'busca filtra por supervisor também')
ok(/situacao: 'sem_trava'/.test(view) && /situacao: 'parcial'/.test(view) && /situacao: 'completa'/.test(view),
  'os três grupos estão na tela')
ok(/d\.aprovados > d\.maximo[\s\S]{0,40}'bg-red-50/.test(view), 'estourado (mais aprovados que o limite) fica destacado')

console.log('\n4 · caminho pelo menu, igual Relatórios (escolhe o evento, depois mostra)')
ok(shell.includes("administrativo.push({ href: '/admin/travas', label: 'Limite por dia', icon: ShieldAlert })"),
  "item 'Limite por dia' no menu Administrativo")
ok(shell.includes('if (podeGerenciarEventos(perfil)) {\n    administrativo.push({ href: \'/admin/travas\''),
  'só pra quem gerencia eventos, não pro supervisor (diferente de Relatórios)')
ok(paginaMenu.includes('eventosQuePossoAbrir()') && paginaMenu.includes('obterRelatorioTravas(eventoParam)'),
  '/admin/travas escolhe o evento e reusa obterRelatorioTravas')
ok(paginaEvento.includes('obterRelatorioTravas(eventoId)'), '/admin/eventos/[id]/travas também existe, direto do evento')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
