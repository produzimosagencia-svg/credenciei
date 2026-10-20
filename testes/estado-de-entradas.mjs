/*
 * QUEM JÁ TEM ENTRADA (Juan, 19/10/2026: "não tá falando se a pessoa bateu a entrada, não tem como ele já saber isso?").
 * A conta que o aparelho guarda (lib/estado-de-entradas.ts) tem que ser a MESMA do servidor (`entradaEmAberto`): vale a
 * entrada mais recente da pessoa, fechada por uma saída DEPOIS dela no mesmo dia de referência.
 *
 * Roda com: node testes/estado-de-entradas.mjs
 */
import { estadoDeEntradas } from '../lib/estado-de-entradas.ts'

let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }
const b = (funcionario_id, tipo, data_ref, created_at) => ({ funcionario_id, tipo, data_ref, created_at })

console.log('A conta de quem tem entrada aberta')
{
  const r = estadoDeEntradas([
    b('ana', 'entrada', '2026-10-17', '2026-10-17T20:00:00Z'),
    b('bia', 'entrada', '2026-10-17', '2026-10-17T20:00:00Z'), b('bia', 'fim', '2026-10-17', '2026-10-18T02:00:00Z'),
    b('caio', 'fim', '2026-10-17', '2026-10-17T22:00:00Z'),
  ])
  ok(r.e.ana === '2026-10-17T20:00:00Z' && !r.s.ana, 'só entrada: aberta')
  ok(r.s.bia === '2026-10-18T02:00:00Z' && !r.e.bia, 'entrada fechada por uma saída depois dela (o turno que vira a madrugada fecha, as duas com o dia de sexta)')
  ok(!r.e.caio && !r.s.caio, 'só saída, sem entrada: a pessoa não aparece (o aparelho diz "sem entrada")')
}
{
  const r = estadoDeEntradas([
    b('dani', 'entrada', '2026-10-17', '2026-10-17T20:00:00Z'), b('dani', 'fim', '2026-10-16', '2026-10-18T02:00:00Z'),
  ])
  ok(r.e.dani && !r.s.dani, 'a saída de OUTRO dia de referência não fecha a entrada (a mesma regra do servidor)')
}
{
  const r = estadoDeEntradas([
    b('edu', 'fim', '2026-10-17', '2026-10-17T10:00:00Z'), b('edu', 'entrada', '2026-10-17', '2026-10-17T12:00:00Z'),
  ])
  ok(r.e.edu && !r.s.edu, 'uma saída ANTES da entrada não a fecha')
}
{
  const r = estadoDeEntradas([
    b('fa', 'entrada', '2026-10-16', '2026-10-16T12:00:00Z'), b('fa', 'fim', '2026-10-16', '2026-10-16T20:00:00Z'),
    b('fa', 'entrada', '2026-10-17', '2026-10-17T12:00:00Z'),
  ])
  ok(r.e.fa === '2026-10-17T12:00:00Z' && !r.s.fa, 'vale a entrada MAIS RECENTE: quem voltou no dia seguinte tem a entrada aberta')
}
{
  const r = estadoDeEntradas([
    b('gi', 'entrada', '2026-10-17', '2026-10-17T12:00:00+00:00'), b('gi', 'fim', '2026-10-17', '2026-10-17T20:00:00Z'), b('gi', 'fim', '2026-10-17', '2026-10-17T21:30:00Z'),
  ])
  ok(r.s.gi === '2026-10-17T21:30:00Z', 'duas saídas depois da entrada: vale a mais recente; formatos de data diferentes comparam certo')
  ok(JSON.stringify(estadoDeEntradas([])) === '{"e":{},"s":{}}', 'sem batidas: nada')
}

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
