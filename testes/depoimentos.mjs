/*
 * TESTE DO DEPOIMENTO / NOTAS — a parte pura (lib/depoimentos.ts) e as
 * garantias estáticas que não podem regredir (justificativa do desbloqueio,
 * bloqueio indo pro histórico, isolamento por organização).
 *
 * Roda com: node testes/depoimentos.mjs   (Node 24 lê .ts direto)
 */
import { readFileSync } from 'node:fs'
import { resumirAvaliacoes, TAMANHO_MINIMO_JUSTIFICATIVA, ROTULO_TIPO } from '../lib/depoimentos.ts'

let falhas = 0
function ok(cond, msg) {
  if (cond) console.log(`  \x1b[32m✓\x1b[0m ${msg}`)
  else { console.log(`  \x1b[31m✗ ${msg}\x1b[0m`); falhas++ }
}
function grupo(t) { console.log(`\n\x1b[1m${t}\x1b[0m`) }
const nota = n => ({ nota: n, eventoNome: null, setorNome: null, avaliadorNome: 'x', organizacaoNome: null, atualizadoEm: '2026-01-01' })

grupo('Média das estrelas')
ok(resumirAvaliacoes([]).media === null, 'sem notas → média nula')
ok(resumirAvaliacoes([nota(5), nota(4)]).media === 4.5, '5 e 4 → 4,5')
ok(resumirAvaliacoes([nota(5), nota(4), nota(4)]).media === 4.3, '5, 4, 4 → 4,3 (uma casa)')
ok(resumirAvaliacoes([nota(1), nota(2)]).total === 2, 'conta as notas')

grupo('Rótulos')
ok(ROTULO_TIPO.bloqueio === 'CPF bloqueado' && ROTULO_TIPO.desbloqueio === 'CPF liberado', 'bloqueio e desbloqueio têm rótulo')

const actions = readFileSync(new URL('../lib/actions.ts', import.meta.url), 'utf8')
const painel = readFileSync(new URL('../app/admin/bloquear-cpf/PainelBloqueio.tsx', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../supabase/upgrade-depoimentos-colaborador.sql', import.meta.url), 'utf8')

grupo('Desbloqueio com justificativa')
ok(TAMANHO_MINIMO_JUSTIFICATIVA >= 3, 'justificativa tem tamanho mínimo')
ok(/Informe a justificativa para liberar este CPF/.test(actions), 'servidor recusa desbloqueio sem justificativa')
ok(/desbloquearCpf\(id, eventoId, justificativa\)/.test(painel), 'tela envia a justificativa')
ok(/justificativa\.trim\(\)\.length < TAMANHO_MINIMO_JUSTIFICATIVA/.test(painel), 'botão só habilita com justificativa')

grupo('Bloqueio vai pro histórico')
ok(/tipo: 'bloqueio'/.test(actions) && /tipo: 'desbloqueio'/.test(actions), 'bloquear e desbloquear gravam depoimento')

grupo('Isolamento e banco')
ok(/organizacao_id/.test(sql) && /enable row level security/i.test(sql), 'tabelas com organizacao_id e RLS')
ok(/nota smallint[^,]*check/i.test(sql.replace(/\n/g, ' ')), 'nota limitada por check')
ok(/\.eq\('organizacao_id', orgId\)/.test(actions), 'quem não é master só lê a própria organização')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo\x1b[0m')
process.exit(falhas ? 1 : 0)
