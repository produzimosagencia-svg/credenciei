/*
 * TUTORIAL GUIADO LIGADO/DESLIGADO POR EVENTO (pedido do Juan, 08/10/2026): "desliga ou liga se eu quero essa
 * função nesse evento". Interruptor em Editar evento, nasce ligado (migração upgrade-tutorial-por-evento.sql).
 *
 * Roda com: node testes/tutorial-por-evento.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const interno = ler('lib/internos-servidor.ts')
ok(/export async function tutorialHabilitadoNoEvento/.test(interno), 'a função de leitura existe')
ok(/return true$/m.test(interno.slice(interno.indexOf('tutorialHabilitadoNoEvento'), interno.indexOf('tutorialHabilitadoNoEvento') + 500)), 'sem a coluna, ou evento não encontrado, o tutorial continua ligado')

const sql = ler('supabase/upgrade-tutorial-por-evento.sql')
ok(/add column if not exists tutorial_habilitado boolean not null default true/.test(sql), 'a coluna nasce LIGADA — nenhum evento existente perde o tutorial sozinho')

const acoes = ler('lib/actions.ts')
ok(/formData\.has\('tutorial_habilitado_presente'\)/.test(acoes) && /tutorial_habilitado: formData\.get\('tutorial_habilitado'\) === 'on'/.test(acoes), 'editarEvento grava o interruptor, à parte e tolerante')

const editar = ler('app/admin/eventos/[id]/editar/page.tsx')
ok(/name="tutorial_habilitado"/.test(editar) && /Tutorial guiado/.test(editar), 'o checkbox aparece em Editar evento')
ok(/defaultChecked={\(evento as \{ tutorial_habilitado\?: boolean \}\)\.tutorial_habilitado !== false}/.test(editar), 'vem marcado por padrão (nasce ligado)')

for (const [arq, padrao] of [
  ['app/admin/eventos/[id]/page.tsx', /ativo={!ehMaster\(perfil\?\.role\) && tutorialDoEvento}/],
  ['app/admin/eventos/[id]/editar/page.tsx', /ativo={!ehMaster\(perfil\?\.role\) && tutorialDoEvento}/],
  ['app/admin/eventos/[id]/fornecedor/[fid]/page.tsx', /ativo={!ehMaster\(perfil\.role\) && \(await tutorialHabilitadoNoEvento\(id\)\)}/],
  ['app/scan/page.tsx', /ativo={!ehMaster\(perfil\.role\) && tutorialDoEvento}/],
  ['app/credential/[token]/page.tsx', /ativo={tutorialDoEvento}/],
]) {
  ok(padrao.test(ler(arq)), `${arq}: o TutorialProvider passa a respeitar o interruptor do evento`)
}

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
