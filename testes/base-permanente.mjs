/*
 * BASE PERMANENTE (pedido do Juan, 10/10/2026): "excluir funcionário do evento não quer dizer que pode excluir ele da
 * base… funcionário nenhum pode ser excluído da base" — e a tela da base sem o teto de 10 mil.
 *
 * Roda com: node testes/base-permanente.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const sql = ler('supabase/upgrade-base-pessoas.sql')
ok(/create table if not exists base_pessoas \(\s*cpf\s+text primary key/.test(sql), 'uma linha por CPF, sem ligação com evento')
ok(/create trigger funcionarios_guardar_na_base\s+after insert or update/.test(sql) && !/after delete/.test(sql), 'todo cadastro entra pelo gatilho; não existe gatilho de exclusão')
ok(/exception when others then[\s\S]{0,120}raise warning/.test(sql), 'o gatilho nunca impede um cadastro de evento')
ok(/from funcionarios\s+union all[\s\S]*from funcionarios_excluidos e/.test(sql), 'carga inicial: fichas de hoje + excluídos da lixeira')

const base = ler('lib/base-pessoas.ts')
ok(/from\('base_pessoas'\)/.test(base) && /from\('funcionarios_excluidos'\)/.test(base), 'lê a base permanente; sem o SQL, a lixeira')
const encontrar = ler('app/admin/encontrar/page.tsx')
ok(!/tetoTotal/.test(encontrar) && !/TETO_BASE/.test(encontrar), 'a tela da base não tem mais teto')
ok(/for \(const b of await lerBasePessoas\(\)\)/.test(encontrar) && /foraDosEventos: true/.test(encontrar), 'quem saiu de todos os eventos aparece, com a etiqueta "Fora dos eventos"')
ok(/const daBase = await pessoaDaBase\(cpf\)/.test(ler('app/admin/pessoas/[cpf]/page.tsx')), 'a ficha da pessoa abre mesmo fora dos eventos')
ok(/const daBase = base\?\.length \? null : await pessoaDaBase\(cpf\)/.test(ler('lib/actions.ts')), 'dá para atribuir de novo a um evento quem está só na base')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
