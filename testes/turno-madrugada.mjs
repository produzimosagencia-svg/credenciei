/*
 * O FIM DO TURNO DA NOITE (Juan/LUAN, 18/10/2026): o evento salvo terminando "17/10 23:50", com a saída do dia 17
 * começando em 18/10 01:00 e sem fim, fazia o turno do show ir até 18/10 às 23:50 — o dia inteiro da desmontagem
 * virou "turno de ontem" (entradas de hoje no dia 17, "já registrado" e "dia não autorizado" no portão).
 *
 * Roda com: node testes/turno-madrugada.mjs
 */
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const raiz = new URL('..', import.meta.url).pathname
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }
const dir = mkdtempSync(join(tmpdir(), 'janelas-'))
writeFileSync(join(dir, 'janelas.ts'), readFileSync(raiz + 'lib/janelas.ts', 'utf8'))
const J = await import(join(dir, 'janelas.ts'))
const br = iso => iso ? new Date(new Date(iso).getTime() - 3 * 3600e3).toISOString().slice(5, 16).replace('T', ' ') : null

// O LUAN como ficou: fim do evento 17/10 23:50 (BRT), saída a partir de 18/10 01:00, sem fim.
const luan = { data_fim: '2026-10-18T02:50:00+00:00', janela_fim_inicio: '2026-10-18T04:00:00+00:00', janela_fim_fim: null }
const fim = J.fimDoTurnoNaMadrugada(luan, { tipo: 'principal' }, '2026-10-17')
ok(br(fim) === '10-18 12:00', `LUAN: o turno do show vai até o meio-dia de 18/10, não até 23:50 (deu ${br(fim)})`)

// O caso normal continua: evento que termina de madrugada (04:00) → a madrugada vai até as 04:00.
const normal = { data_fim: '2026-10-11T07:00:00+00:00', janela_fim_inicio: '2026-10-11T03:00:00+00:00', janela_fim_fim: null }
ok(br(J.fimDoTurnoNaMadrugada(normal, { tipo: 'principal' }, '2026-10-10')) === '10-11 04:00', 'evento que termina às 04:00: a madrugada vai até as 04:00 (como sempre)')

// Com o fim da saída preenchido, vale ele.
const comFim = { ...luan, janela_fim_fim: '2026-10-18T08:00:00+00:00' }
ok(br(J.fimDoTurnoNaMadrugada(comFim, { tipo: 'principal' }, '2026-10-17')) === '10-18 05:00', 'com o fim da janela de saída preenchido (05:00), vale ele')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
