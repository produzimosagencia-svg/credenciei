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
ok(/d\.aprovados > d\.maximo \? 'bg-red-50 text-red-700'/.test(view), 'estourado (mais aprovados que o limite) fica destacado em vermelho')

console.log('\n4 · caminho pelo menu, igual Relatórios (escolhe o evento, depois mostra)')
ok(shell.includes("administrativo.push({ href: '/admin/travas', label: 'Limite por dia', icon: ShieldAlert })"),
  "item 'Limite por dia' no menu Administrativo")
ok(shell.includes('if (podeGerenciarEventos(perfil)) {\n    administrativo.push({ href: \'/admin/travas\''),
  'só pra quem gerencia eventos, não pro supervisor (diferente de Relatórios)')
ok(paginaMenu.includes('eventosQuePossoAbrir()') && paginaMenu.includes('obterRelatorioTravas(eventoParam)'),
  '/admin/travas escolhe o evento e reusa obterRelatorioTravas')
ok(paginaEvento.includes('obterRelatorioTravas(eventoId)'), '/admin/eventos/[id]/travas também existe, direto do evento')

console.log('\n5 · baixar em planilha (.xlsx), mesmo padrão visual da auditoria')
const excel = ler('lib/relatorio-travas-excel.ts')
ok(view.includes('gerarPlanilhaTravas(relatorio, eventoNome)') && view.includes('Baixar planilha'), 'botão "Baixar planilha" na tela')
ok(excel.includes("await import('exceljs')") && excel.includes('adicionarLogoNaAba'), 'exceljs com a logo, igual aos outros relatórios')
ok(excel.includes("d.maximo == null ? 'livre' : `${d.aprovados}/${d.maximo}`"), 'célula = aprovados/limite, ou "livre"')

console.log('\n6 · painel: edita o limite de cada dia ali mesmo (pedido do Juan, 08/10/2026)')
ok(/export async function salvarTravasDoSetor[\s\S]{0,300}?exigirEventoDaOrg\(eventoId\)/.test(actions), 'salvar confere permissão de gestor do evento')
ok(/setor\.evento_id !== eventoId/.test(actions), 'recusa setor de outro evento (o id vem do navegador)')
ok(/if \(!diasDoEvento\.has\(dia\)\)/.test(actions), 'recusa dia que não é do evento')
ok(/auditar\(perfil, 'TRAVA_POR_DIA_ALTERADA'/.test(actions) && /TRAVA_POR_DIA_ALTERADA: /.test(ler('lib/auditoria-rotulos.ts')),
  'grava na auditoria (antes → depois), com rótulo')
ok(view.includes('salvarTravasDoSetor(eventoId, linha.fornecedorId, porDia)'), 'a tela chama o salvar por setor')
ok(view.includes('placeholder="livre"'), 'campo vazio = livre (sem trava)')
ok(view.includes('function ModalTravas') && view.includes('Editar limites'), 'edição num modal ("Editar limites"), não em campos soltos na linha')
ok(view.includes('Mesmo limite em todos os dias'), 'atalho do mesmo limite em todos os dias')
ok(view.includes('Abaixo dos aprovados'), 'avisa quando o limite fica abaixo de quem já está aprovado')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
