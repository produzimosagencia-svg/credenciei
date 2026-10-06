/*
 * TESTE DA ESCALA POR DIA — eventos de subeventos (lib/escala-regras.ts).
 *
 * As regras puras são testadas chamando as funções de verdade: quais dias a
 * pessoa pode escolher, como a aprovação do supervisor vira linhas, e se o QR
 * vale ou não num dia. A parte que bate no banco (lib/escala.ts) é coberta
 * pelo grupo 7, que confere o código-fonte: cada caminho de presença passa
 * pela checagem.
 *
 * Roda com: node testes/escala.mjs   (Node 24 lê .ts direto)
 */

import { readFileSync } from 'node:fs'
import {
  vereditoDaEscala, conferirDiasPermitidos, planejarAprovacao, normalizarDias, listarDias, rotuloDoDia,
  RECUSA_DIA_NAO_AUTORIZADO, RECUSA_ESCALA_PENDENTE,
} from '../lib/escala-regras.ts'
import { faseDoDia } from '../lib/janelas.ts'

let falhas = 0
function ok(cond, msg) {
  if (cond) { console.log(`  \x1b[32m✓\x1b[0m ${msg}`) }
  else { console.log(`  \x1b[31m✗ ${msg}\x1b[0m`); falhas++ }
}
function grupo(t) { console.log(`\n\x1b[1m${t}\x1b[0m`) }

// Henrique e Juliano — o exemplo do pedido.
const PERIODO = ['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12']
const PRINCIPAIS = ['2026-10-10', '2026-10-11']
const liberado = (escala, dia) => vereditoDaEscala(escala, dia).ok

// ─────────────────────────────────────────────────────────────────────────────
grupo('0 · Os dias do evento e as fases')

ok(PERIODO.map(d => faseDoDia(d, PRINCIPAIS)).join(',') === 'montagem,montagem,evento,evento,desmontagem',
  '08–09 montagem, 10–11 evento, 12 desmontagem')
ok(rotuloDoDia('2026-10-08').semana === 'Quinta-feira' && rotuloDoDia('2026-10-08').curto === '08/10', '08/10/2026 é quinta-feira')
ok(listarDias(['2026-10-10', '2026-10-08', '2026-10-09']) === '08/10, 09/10 e 10/10', 'lista de dias legível e em ordem')

// ─────────────────────────────────────────────────────────────────────────────
grupo('1 · O funcionário só escolhe dias do período')

const escolha = conferirDiasPermitidos(['2026-10-09', '2026-10-08', '2026-10-10', '2026-10-08'], PERIODO)
ok(escolha.ok && escolha.dias.join(',') === '2026-10-08,2026-10-09,2026-10-10', 'vários dias: aceita, sem repetição, em ordem')
ok(!conferirDiasPermitidos([], PERIODO).ok, 'nenhum dia: recusa')
ok(!conferirDiasPermitidos(undefined, PERIODO).ok, 'campo ausente: recusa')
const fora = conferirDiasPermitidos(['2026-10-08', '2026-10-20'], PERIODO)
ok(!fora.ok && fora.erro.includes('20/10'), 'dia fora do período: recusa e diz qual')
ok(normalizarDias(['2026-10-08', 'lixo', 42, '2026-1-8']).join(',') === '2026-10-08', 'descarta o que não é data YYYY-MM-DD')

// ─────────────────────────────────────────────────────────────────────────────
grupo('2 · Cenário 1 — um único dia aprovado')

const umDia = { status: 'aprovada', diasAprovados: ['2026-10-08'] }
ok(liberado(umDia, '2026-10-08'), '08/10 (aprovado) → QR válido')
ok(!liberado(umDia, '2026-10-09'), '09/10 (não aprovado) → QR inválido')

// ─────────────────────────────────────────────────────────────────────────────
grupo('3 · Cenários 2, 3 e 4 — vários dias; acesso em dia aprovado e não aprovado')

// Selecionou 08, 09, 10. O supervisor aprovou os três.
const pedidos = [
  { data: '2026-10-08', selecionado: true, aprovado: false },
  { data: '2026-10-09', selecionado: true, aprovado: false },
  { data: '2026-10-10', selecionado: true, aprovado: false },
]
const aprovacao = planejarAprovacao(pedidos, ['2026-10-08', '2026-10-09', '2026-10-10'])
const aprovados = aprovacao.manter.filter(d => d.aprovado).map(d => d.data)
const escala = { status: 'aprovada', diasAprovados: aprovados }
ok(aprovacao.remover.length === 0 && aprovados.length === 3, 'aprovação grava os três dias pedidos')
for (const d of ['2026-10-08', '2026-10-09', '2026-10-10']) ok(liberado(escala, d), `${rotuloDoDia(d).curto} → QR válido`)
for (const d of ['2026-10-11', '2026-10-12']) ok(!liberado(escala, d), `${rotuloDoDia(d).curto} → QR inválido`)

const recusa = vereditoDaEscala(escala, '2026-10-11')
ok(!recusa.ok && recusa.titulo === 'Acesso não autorizado para hoje.', 'recusa traz o título pedido')
ok(!recusa.ok && recusa.mensagem === RECUSA_DIA_NAO_AUTORIZADO.mensagem && recusa.mensagem.includes('supervisor'),
  'recusa manda procurar o supervisor')

// Escala ainda não aprovada: nenhum dia vale, nem os pedidos.
const pendente = { status: 'pendente', diasAprovados: [] }
const recusaPendente = vereditoDaEscala(pendente, '2026-10-08')
ok(!recusaPendente.ok && recusaPendente.titulo === RECUSA_ESCALA_PENDENTE.titulo, 'escala pendente → QR inválido até o supervisor aprovar')

// O supervisor aprova MENOS do que foi pedido (o exemplo da quinta/sexta).
const parcial = planejarAprovacao(
  [{ data: '2026-10-08', selecionado: true, aprovado: false }, { data: '2026-10-09', selecionado: true, aprovado: false }],
  ['2026-10-08'],
)
const escalaParcial = { status: 'aprovada', diasAprovados: parcial.manter.filter(d => d.aprovado).map(d => d.data) }
ok(liberado(escalaParcial, '2026-10-08') && !liberado(escalaParcial, '2026-10-09'), 'pediu qui+sex, aprovado só qui → sexta bloqueada')
ok(parcial.manter.find(d => d.data === '2026-10-09')?.selecionado === true, 'o pedido de sexta continua registrado (selecionado), só não aprovado')

// ─────────────────────────────────────────────────────────────────────────────
grupo('4 · Cenário 5 — alteração da escala pelo supervisor')

// Estava aprovado 08–10; o supervisor tira o 10 e põe o 12 (que não foi pedido).
const ajuste = planejarAprovacao(aprovacao.manter, ['2026-10-08', '2026-10-09', '2026-10-12'])
const escalaNova = { status: 'aprovada', diasAprovados: ajuste.manter.filter(d => d.aprovado).map(d => d.data) }
ok(!liberado(escalaNova, '2026-10-10'), '10/10 tirado → QR passa a ser inválido')
ok(liberado(escalaNova, '2026-10-12'), '12/10 acrescentado → QR passa a ser válido')
ok(ajuste.manter.find(d => d.data === '2026-10-12')?.selecionado === false, '12/10 fica marcado como "não pedido" (aprovado pelo supervisor)')
ok(ajuste.manter.find(d => d.data === '2026-10-10')?.selecionado === true, '10/10 continua como pedido, só não aprovado')

// Dia aprovado sem pedido e depois retirado: a linha some.
const retirado = planejarAprovacao(ajuste.manter, ['2026-10-08'])
ok(retirado.remover.includes('2026-10-12') && !retirado.remover.includes('2026-10-09'),
  'linha não pedida e não aprovada é apagada; pedido nunca é apagado')

// ─────────────────────────────────────────────────────────────────────────────
grupo('5 · Cenário 6 — evento normal (fora do fluxo): nada muda')

ok(liberado(null, '2026-10-11'), 'sem escala → liberado pela regra da escala (as regras de sempre seguem valendo)')
ok(liberado({ status: null, diasAprovados: [] }, '2026-10-11'), 'escala_status nulo → liberado')

// ─────────────────────────────────────────────────────────────────────────────
grupo('6 · Cada caminho de presença confere a escala (código-fonte)')

const actions = readFileSync(new URL('../lib/actions.ts', import.meta.url), 'utf8')
const corpo = nome => {
  const i = actions.indexOf(`function ${nome}(`)
  const j = actions.indexOf('\nexport async function ', i + 1)
  const k = actions.indexOf('\nasync function ', i + 1)
  return actions.slice(i, Math.min(...[j, k].filter(x => x > 0)))
}
const autorizar = corpo('autorizarPresenca')
ok(autorizar.includes('conferirEscalaNoDia') && autorizar.indexOf('conferirEscalaNoDia') < autorizar.indexOf('inferirMomentoQR'),
  'autorizarPresenca (QR + biometria no portão) confere ANTES de decidir entrada/saída')
ok(autorizar.includes('diaNaoAutorizado: true'), 'a recusa do portão vem marcada como diaNaoAutorizado')
for (const nome of ['registrarPresencaLivre', 'registrarPresencaFacialLivre', 'registrarPresencaFoto', 'registrarPresencaAssistida']) {
  ok(corpo(nome).includes('conferirEscalaNoDia'), `${nome} confere a escala`)
}
const cadastro = corpo('cadastrarFuncionarioPublico')
ok(cadastro.includes('conferirDiasPermitidos') && cadastro.includes('eventoUsaEscalaPorDia'),
  'cadastro público só aceita dias do período, e só em evento de subeventos')

const escalaTs = readFileSync(new URL('../lib/escala.ts', import.meta.url), 'utf8')
ok(/tem_subeventos !== true\) return false/.test(escalaTs) && escalaTs.includes('subeventos_habilitado'),
  'escala por dia exige evento com subeventos E organização com subeventos liberado')
ok(/escala_por_dia_habilitada !== true\) return false/.test(escalaTs),
  'e a chave "Dias de trabalho" ligada em Funcionalidades do Sistema (nasce desligada)')

// ─────────────────────────────────────────────────────────────────────────────
console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
