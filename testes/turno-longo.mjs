/*
 * SAÍDA COM HORA IMPOSSÍVEL (Juan, 23/10/2026): no LUAN, 4 saídas ficaram ANTES da entrada e 35 turnos passaram de 18h.
 * O "Corrigir no histórico" e o "Lançar ponto" agora perguntam antes de salvar: "é a madrugada do dia seguinte?" e "esse
 * turno de 23h está certo?".
 *
 * Roda com: node testes/turno-longo.mjs
 */
import { readFileSync } from 'node:fs'
import { avaliarSaida, maisUmDia, TURNO_LONGO_H, TURNO_LONGO_MS } from '../lib/turno-longo.ts'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }
const iso = local => new Date(`${local}:00-03:00`).toISOString()
const av = (entrada, saida) => avaliarSaida(iso(entrada), iso(saida), saida)

console.log('1 · A regra')
{
  let r = av('2026-10-17T11:38', '2026-10-17T01:10')
  ok(r.tipo === 'antes_da_entrada' && r.sugeridoLocal === '2026-10-18T01:10', 'Rosane: entrada 11:38, saída 01:10 do mesmo dia → sugere 01:10 do dia seguinte')
  r = av('2026-10-17T14:00', '2026-10-17T00:45')
  ok(r.tipo === 'antes_da_entrada' && r.sugeridoLocal === '2026-10-18T00:45', 'Ecilma: entrada 14:00, saída 00:45 → sugere o dia seguinte')
  r = av('2026-10-17T11:05', '2026-10-17T01:00')
  ok(r.tipo === 'antes_da_entrada' && r.sugeridoLocal === '2026-10-18T01:00', 'Rodrigo Sandro: idem')
  r = av('2026-10-17T10:11', '2026-10-17T10:10')
  ok(r.tipo === 'antes_da_entrada' && r.sugeridoLocal === null, 'Lucas Uhl: 1 minuto antes — um dia depois daria quase 24h, então só recusa (sem sugerir)')
  r = av('2026-10-17T10:11', '2026-10-17T10:11')
  ok(r.tipo === 'antes_da_entrada', 'saída no mesmo minuto da entrada também é recusada')
  ok(av('2026-10-17T08:00', '2026-10-17T20:30').tipo === 'ok' && av('2026-10-17T16:00', '2026-10-18T00:30').tipo === 'ok', 'turno normal e turno que vira a madrugada: segue direto')
  ok(av('2026-10-17T08:00', '2026-10-18T02:00').tipo === 'ok', 'exatamente 18h: ainda ok')
  r = av('2026-10-17T08:00', '2026-10-18T02:01')
  ok(r.tipo === 'turno_longo' && r.horas === 18, '18h01: pede confirmação')
  r = av('2026-10-15T09:05', '2026-10-16T08:22')
  ok(r.tipo === 'turno_longo' && r.horas === 23, 'IMF: entrada 15/10 09:05, saída 16/10 08:22 → 23h, pede confirmação')
  ok(avaliarSaida('lixo', iso('2026-10-17T08:00'), '2026-10-17T08:00').tipo === 'ok', 'dado ilegível não trava ninguém')
}
{
  ok(maisUmDia('2026-10-17T01:10') === '2026-10-18T01:10' && maisUmDia('2026-10-31T23:59') === '2026-11-01T23:59' && maisUmDia('2026-12-31T00:00') === '2027-01-01T00:00', 'um dia depois, virando mês e ano')
  ok(maisUmDia('2026-02-28T10:00') === '2026-03-01T10:00' && maisUmDia('texto') === 'texto', 'fevereiro e texto inválido')
  ok(TURNO_LONGO_H === 18 && TURNO_LONGO_MS === 18 * 3_600_000, 'o teto é 18h')
}

console.log('\n2 · No servidor e nas telas')
const acoes = ler('lib/actions.ts')
const lanc = acoes.slice(acoes.indexOf('export async function lancarPontoManual('), acoes.indexOf('export async function apagarBatida('))
ok(/confirmacoes\?: \{ turnoLongo\?: boolean \}/.test(lanc) && /pergunta\?: PerguntaDeHorario/.test(lanc), 'lancarPontoManual aceita a confirmação do turno longo e devolve a pergunta')
ok(/avaliarSaida\(entradaEm, quandoISO, quandoLocal\)/.test(lanc) && /if \(av\.tipo === 'antes_da_entrada'\)/.test(lanc) && /tipo: 'dia_seguinte', sugeridoLocal: av\.sugeridoLocal/.test(lanc), 'saída antes da entrada: nunca salva; pergunta se é o dia seguinte (ou só recusa, quando não há sugestão possível)')
ok(/av\.tipo === 'turno_longo' && !confirmacoes\?\.turnoLongo/.test(lanc) && /tipo: 'turno_longo', horas: av\.horas/.test(lanc), 'turno acima de 18h: pede confirmação')
ok(lanc.indexOf('avaliarSaida(entradaEm') < lanc.indexOf('await upsertRegistro(func.id, evento.id, momento'), 'a pergunta vem ANTES de gravar')
const historico = ler('components/HistoricoBatidas.tsx'), lancarTela = ler('app/admin/lancar-ponto/LancarPonto.tsx')
for (const [nome, t] of [['Corrigir no histórico', historico], ['Lançar ponto', lancarTela]]) {
  ok(/if \(r\.pergunta\) \{ setPergunta\(r\.pergunta\); return \}/.test(t) && /<PerguntaDeHorario/.test(t) && /pergunta\.tipo === 'dia_seguinte' \? \{ quando: pergunta\.sugeridoLocal \} : \{ turnoLongo: true \}/.test(t), `${nome}: mostra a pergunta; "sim" salva o dia seguinte ou confirma o turno longo`)
}
const rel = ler('lib/relatorio-excel.ts'), pdf = ler('lib/relatorio-doc-presenca.ts')
ok(/const TURNO_LONGO_MS = 18 \* 3_600_000/.test(rel) && /const TURNO_LONGO_MS = 18 \* 3_600_000/.test(pdf), 'o teto de 18h é o mesmo dos relatórios (planilha e PDF marcam em laranja)')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
