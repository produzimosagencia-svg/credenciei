/*
 * OPERADOR DE PORTÃO SÓ VÊ EVENTO QUE AINDA VALE (Juan, 14/10/2026): "operador de portão que já operou em um evento,
 * aparece informações do evento passado… mesmo com evento inativo". O VITAL acabou em 13/10 mas segue "ativo" no
 * cadastro; e em Registrar ponto e no seletor do topo apareciam até eventos inativos.
 *
 * Roda com: node testes/operador-so-evento-vigente.mjs
 */
import { readFileSync } from 'node:fs'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const srv = ler('lib/supabase-server.ts'), escolher = ler('app/admin/EscolherEvento.tsx'), ctx = ler('lib/contexto-eventos.ts')
ok(/export async function eventosAindaVigentes/.test(srv) && /if \(e\.ativo === false\) continue/.test(srv) && /\.gte\('data', limite\)/.test(srv), 'vigente = ativo e com dia de operação hoje ou depois')
ok(/getUTCHours\(\) < 6/.test(srv), 'até as 6h o dia de ontem ainda vale (a última noite vira a madrugada)')
ok(/if \(perfil\.role !== 'operador_portao'\) return data \?\? \[\][\s\S]{0,200}eventosAindaVigentes/.test(srv), 'boas-vindas e scanner do operador: só os vigentes')
ok(/perfil\.role === 'operador_portao' \? await eventosAindaVigentes/.test(escolher), 'Registrar ponto e as telas de escolher evento: só os vigentes para o operador')
ok(/if \(soEventos\) \{\s*const vigentes = await eventosAindaVigentes/.test(ctx), 'seletor de evento do topo do operador: só os vigentes')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
