/*
 * Relatório "Batidas fora do local" — pedido do Juan, 08/10/2026: "quem bateu fora do limite da área precisa ter
 * um relatório disso". Texto cru (lib/actions.ts e lib/alertas-local.ts usam o cliente de serviço).
 *
 * Roda com: node testes/fora-do-local.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = caminho => readFileSync(raiz + caminho, 'utf8')
const lib = ler('lib/alertas-local.ts')
const actions = ler('lib/actions.ts')
const view = ler('app/admin/eventos/[id]/fora-do-local/RelatorioForaDoLocalView.tsx')
const shell = ler('components/AppShell.tsx')

let falhas = 0
function ok(cond, nome) {
  if (!cond) falhas++
  console.log(`  ${cond ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${nome}`)
}

console.log('1 · o que entra no relatório')
ok(/\.or\('fora_do_local\.eq\.true,latitude\.not\.is\.null'\)/.test(lib), 'batidas marcadas E toda batida com localização (recalcula as antigas, nunca comparadas)')
ok(/const fora = r\.fora_do_local === true \|\| calculado\.foraDoLocal === true/.test(lib), 'fora = marcada ou fora do raio atual')
ok(/\.eq\('resultado', 'fora_do_local'\)/.test(lib), 'inclui as tentativas recusadas (leituras_qr)')
ok(/'Celular da própria pessoa'/.test(lib), 'diz quem registrou: o operador ou o celular da própria pessoa')

console.log('\n2 · permissão e caminho')
ok(/export async function obterRelatorioForaDoLocal[\s\S]{0,900}?if \(podeGerenciarEventos\(perfil\)\) \{\s*await exigirEventoDaOrg\(eventoId\)/.test(actions), 'admin/master: evento inteiro, conferindo a organização')
ok(/const meus = \(await meusSetores\(perfil\)\)\.filter\(st => st\.evento_id === eventoId\)/.test(actions), 'supervisor: só os setores dele neste evento')
ok(/l\.setorId && setoresPermitidos\.some\(st => st\.id === l\.setorId\)/.test(lib), 'o recorte do supervisor é feito no servidor (não chega linha de outro setor)')
ok(shell.includes("administrativo.push({ href: '/admin/fora-do-local', label: 'Fora do local', icon: MapPin })"), "item 'Fora do local' no menu")
ok(/if \(podeGerenciarEventos\(perfil\) \|\| role === 'supervisor' \|\| temVinculoSupervisor\) \{\s*administrativo\.push\(\{ href: '\/admin\/fora-do-local'/.test(shell), 'aparece também para o supervisor')

console.log('\n3 · a tela')
ok(view.includes('Batidas registradas fora do local') && view.includes('Tentativas recusadas'), 'separa registradas de recusadas')
ok(view.includes('https://www.google.com/maps?q='), 'link para o mapa do ponto')
ok(view.includes("await import('exceljs')"), 'baixa em planilha')
ok(view.includes("'Todo o evento'") && view.includes('relatorio.setores.map(st =>'), 'planilha do evento inteiro ou de um setor (seletor)')
ok(view.includes('baixarPlanilha(filtradas, eventoNome, relatorio.raioM, nomeRecorte)'), 'a planilha sai com o recorte escolhido')

console.log('\n4 · tentativa recusada fica no nome da pessoa, com o endereço (pedido do Juan, 08/10/2026)')
ok(/async function auditarTentativaForaDoLocal/.test(actions) && /acao: 'TENTATIVA_FORA_DO_LOCAL'/.test(actions), 'grava na auditoria, no nome da pessoa')
ok(/TENTATIVA_FORA_DO_LOCAL: /.test(ler('lib/auditoria-rotulos.ts')), 'rótulo na auditoria')
ok((actions.match(/await enderecoDaPosicao\(/g) || []).length >= 3, 'busca o endereço nos três caminhos: celular, scanner e registro manual')
ok((actions.match(/origem: '(celular|scanner|registro_manual)', momento/g) || []).length === 3, 'os três caminhos registram a tentativa')
ok(/endereco_aproximado text/.test(ler('supabase/upgrade-endereco-tentativa-fora.sql')), 'coluna do endereço em leituras_qr (migração)')
ok(/endereco: \(l\.endereco_aproximado as string \| null\) \?\? null/.test(lib), 'o relatório mostra o endereço da tentativa')
ok(/h\.tentativasForaDoLocal = await tentativasForaDoLocalDe\(funcionarioId\)/.test(actions),
  'histórico da pessoa (ficha) traz as tentativas — para quem pode ver a pessoa (admin/master e o supervisor dela)')
ok(ler('components/HistoricoBatidas.tsx').includes('de bater o ponto fora do local do evento'), 'a aba Histórico mostra as tentativas com endereço e mapa')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
