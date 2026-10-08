/*
 * MOVER PESSOA DE FORNECEDOR em evento com SUBEVENTOS (pedido do Juan, 08/10/2026): ao clicar em "Mover",
 * aparecem os subeventos; ao escolher um, aparecem os fornecedores DELE. O caso real do VITAL: o mesmo
 * fornecedor (GOTE - LIMPEZA) existe em três subeventos, e a lista única só com o nome não distinguia.
 *
 * Roda com: node testes/mover-setor.mjs
 */
import { readFileSync } from 'node:fs'
import { areasDeDestino, destinosDaArea, rotuloDoDestino, SEM_AREA } from '../lib/destinos-mover.ts'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const vital = [
  { id: 'g1', nome: 'GOTE - LIMPEZA', area: 'BLOCO' }, { id: 'g2', nome: 'GOTE - LIMPEZA', area: 'ARQUIBANCADA' }, { id: 'g3', nome: 'GOTE - LIMPEZA', area: 'MUVUKA / PEGA / FERVÔ' },
  { id: 'a1', nome: 'GILMAR - SEGURANÇA', area: 'BLOCO' }, { id: 'a2', nome: 'GILMAR - SEGURANÇA', area: 'ARQUIBANCADA' },
  { id: 'x1', nome: 'FORNECEDOR AVULSO', area: null },
]
const areas = areasDeDestino(vital)
ok(areas.map(a => a.rotulo).join('|') === 'ARQUIBANCADA|BLOCO|MUVUKA / PEGA / FERVÔ|Sem subevento', 'ao clicar em Mover aparecem os subeventos (e "Sem subevento" por último)')
ok(areas.find(a => a.rotulo === 'BLOCO').total === 2, 'cada subevento mostra quantos fornecedores tem')
const doBloco = destinosDaArea(vital, 'BLOCO')
ok(doBloco.length === 2 && doBloco.every(d => d.area === 'BLOCO'), 'escolhido o BLOCO, só aparecem os fornecedores do BLOCO')
ok(doBloco.some(d => d.nome === 'GOTE - LIMPEZA') && !doBloco.some(d => d.id === 'g2'), 'o GOTE do BLOCO é o do BLOCO, não o da ARQUIBANCADA (mesmo nome, id diferente)')
ok(destinosDaArea(vital, SEM_AREA).map(d => d.id).join() === 'x1', 'fornecedores sem subevento ficam num grupo à parte')
ok(destinosDaArea(vital, '').length === 0, 'sem escolher o subevento, nenhum fornecedor aparece ainda')
ok(rotuloDoDestino(vital[0]) === 'GOTE - LIMPEZA — BLOCO', 'a confirmação diz o fornecedor E o subevento')

const comum = [{ id: 'f1', nome: 'Bar' }, { id: 'f2', nome: 'Caixa', area: null }]
ok(areasDeDestino(comum).length === 0, 'evento SEM subeventos: nada de passo extra')
ok(destinosDaArea(comum, '').length === 2, 'evento sem subeventos: a lista única de sempre')

// Fiação: as telas que abrem o "Mover" recebem os fornecedores do evento INTEIRO, com o subevento de cada um.
const modal = ler('app/admin/eventos/[id]/fornecedor/[fid]/FuncionarioDetalheModal.tsx')
const subPag = ler('app/admin/eventos/[id]/subevento/[sid]/page.tsx')
const lista = ler('app/admin/eventos/[id]/ListaDeSetores.tsx')
ok(/Mover para qual subevento\?/.test(modal) && /areasMover\.length > 0/.test(modal), 'o modal pergunta o subevento antes do fornecedor')
ok(/from\('fornecedores'\)\.select\('id, nome, subeventos\(nome\)'\)\.eq\('evento_id', eventoId\)/.test(subPag) && /setoresParaMover=\{setoresParaMover\}/.test(subPag), 'na página de um subevento, os destinos vêm do evento inteiro (não só do subevento aberto)')
ok(/setoresParaMover \?\? fornecedores\.map/.test(lista), 'a lista de setores usa os destinos completos quando recebe')
ok(/subeventos\(nome\)/.test(ler('app/admin/editar-colaborador/page.tsx')) && /subeventos\(nome\)/.test(ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx')), 'Editar colaborador e a página do setor também trazem o subevento de cada destino')
ok(/atualizar o subevento|subevento_id: \(destinoSubevento/.test(ler('lib/actions.ts')), 'o servidor leva o subevento da pessoa junto com o fornecedor')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
