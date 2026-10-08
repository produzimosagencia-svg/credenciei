/*
 * SUPERVISOR DE VÁRIOS SETORES (08/10/2026) — executa de verdade a regra `alcancaSetor`, que a aprovação,
 * a negação e a ativação passaram a usar. Antes, essas ações só aceitavam o setor ATIVO do supervisor e
 * recusavam os outros com "Sem permissão sobre este fornecedor" (caso do GOTE - LIMPEZA no Vital).
 *
 * O banco é falso (em memória): o que se prova aqui é a REGRA, não a conexão com o Supabase.
 * Roda com: node testes/acesso-supervisor.mjs
 */
import { register } from 'node:module'

register('./_hook-ts.mjs', import.meta.url)
const { tabelas } = await import('./_supabase-falso.mjs')
const { alcancaSetor } = await import('../lib/autorizacao.ts')

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }

tabelas.fornecedores.push(
  { id: 'A', evento_id: 'e1' }, // GOTE - LIMPEZA (setor aberto agora)
  { id: 'B', evento_id: 'e1' }, // GOTE - LIMPEZA em outro subevento
  { id: 'C', evento_id: 'e1' }, // setor de outro supervisor
)
tabelas.supervisor_setores.push(
  { perfil_id: 'p1', fornecedor_id: 'A' },
  { perfil_id: 'p1', fornecedor_id: 'B' },
  { perfil_id: 'p2', fornecedor_id: 'C' },
)

const sup1 = { id: 'p1', role: 'supervisor', fornecedor_id: 'A', organizacao_id: 'o1' }
const sup2 = { id: 'p2', role: 'supervisor', fornecedor_id: 'C', organizacao_id: 'o1' }

console.log('Supervisor com dois setores (A aberto, B também dele)')
ok(sup1.fornecedor_id !== 'B', 'a régua antiga (só o setor aberto) recusaria o setor B — é o erro dos supervisores')
ok(await alcancaSetor(sup1, 'A') === true, 'aprova no setor aberto (A)')
ok(await alcancaSetor(sup1, 'B') === true, 'aprova no OUTRO setor dele (B), sem precisar trocar de setor antes')
ok(await alcancaSetor(sup1, 'C') === false, 'não aprova em setor de outro supervisor (C)')
ok(await alcancaSetor(sup1, 'inexistente') === false, 'setor que não existe: recusa')
ok(await alcancaSetor(sup1, '') === false, 'sem setor informado: recusa')

console.log('\nOutro supervisor')
ok(await alcancaSetor(sup2, 'C') === true, 'aprova no próprio setor')
ok(await alcancaSetor(sup2, 'A') === false && await alcancaSetor(sup2, 'B') === false, 'não alcança os setores do primeiro')

console.log('\nSupervisor sem vínculo nenhum')
ok(await alcancaSetor({ id: 'p9', role: 'supervisor', fornecedor_id: null }, 'B') === false, 'sem setor ativo e sem vínculo: recusa')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
