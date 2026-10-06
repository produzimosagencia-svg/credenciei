/*
 * DIAS PRINCIPAIS EXTRAS — o erro do Vital (06/10/2026): saída de madrugada
 * no MESMO dia da entrada. Roda com: node testes/eventos.mjs
 */
import { readFileSync } from 'node:fs'
import { conferirHorariosDoEvento, diaBRT, somarDias } from '../lib/janelas.ts'
import { inputParaISO } from '../lib/tz.ts'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const bloqueia = d => conferirHorariosDoEvento(d).some(p => p.bloqueia)

// Os valores da tela: entrada 11/10 14:00–16:00, saída a partir de 11/10 01:30, sem fim.
const entradaInicio = inputParaISO('2026-10-11T14:00')
const entradaFim = inputParaISO('2026-10-11T16:00')
const saidaMadrugadaMesmoDia = inputParaISO('2026-10-11T01:30')
const saidaDiaSeguinte = inputParaISO('2026-10-12T01:30')
const dia = (entradaInicio, entradaFim, saidaInicio) => ({
  data_inicio: entradaInicio, data_fim: saidaInicio,
  janela_entrada_inicio: entradaInicio, janela_entrada_fim: entradaFim,
  janela_fim_inicio: saidaInicio, janela_fim_fim: null,
})

console.log('\n\x1b[1m1 · O caso do print\x1b[0m')
ok(bloqueia(dia(entradaInicio, entradaFim, saidaMadrugadaMesmoDia)), 'saída 11/10 01:30 antes da entrada 11/10 14:00 (sem fim) → bloqueia, como no print')
ok(!bloqueia(dia(entradaInicio, entradaFim, saidaDiaSeguinte)), 'saída 12/10 01:30 (dia seguinte) → passa')
ok(somarDias(diaBRT(saidaMadrugadaMesmoDia), 1).split('-').reverse().slice(0, 2).join('/') === '12/10', 'a mensagem sugere o dia certo: 12/10')

console.log('\n\x1b[1m2 · O servidor devolve o motivo, não lança\x1b[0m')
const a = readFileSync(new URL('../lib/actions.ts', import.meta.url), 'utf8')
for (const nome of ['salvarDiasPrincipaisExtras', 'salvarDiasDeTrabalho']) {
  const i = a.indexOf(`export async function ${nome}(`)
  const corpo = a.slice(i, i + 700)
  ok(corpo.includes('try {') && corpo.includes('return { error: mensagemAmigavel(e) }'), `${nome}: erro volta como { error } (em produção uma exceção vira texto genérico)`)
}
ok(a.includes('Se a saída é de madrugada, escolha o DIA SEGUINTE'), 'mensagem do dia extra diz o que fazer')
for (const f of ['DiasPrincipaisExtras', 'DiasDeTrabalho']) {
  const c = readFileSync(new URL(`../app/admin/eventos/[id]/editar/${f}.tsx`, import.meta.url), 'utf8')
  ok(c.includes('if (!r.ok) { setErro(r.error); return }'), `${f}: a tela mostra o erro devolvido`)
}

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
