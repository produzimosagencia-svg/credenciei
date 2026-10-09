/*
 * CONFIGURAÇÕES DENTRO DO EVENTO (pedido do Juan, 09/10/2026): botão "Configurações" em Editar evento e na página
 * do evento, com as mesmas opções de Configurações → Funcionalidades, valendo SÓ para aquele evento. Sem nada salvo,
 * o evento segue a organização. A tela da organização continua. Só o master.
 *
 * Roda com: node testes/configuracoes-do-evento.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = caminho => readFileSync(raiz + caminho, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const internos = ler('lib/internos-servidor.ts')
const actions = ler('lib/actions.ts')

console.log('1 · banco e leitura')
ok(/alter table eventos\s+add column if not exists funcionalidades jsonb;/.test(ler('supabase/upgrade-funcionalidades-por-evento.sql')), 'coluna nova, null = segue a organização')
ok(/export async function obterFuncionalidadesDoEvento/.test(internos) && /if \(typeof v === 'boolean'\) r\[campo\] = v/.test(internos), 'o evento vale por cima da organização, chave a chave')
ok(Object.keys({ subeventos_habilitado: 1, trava_cota_habilitada: 1, aviso_uniforme_habilitado: 1, escala_por_dia_habilitada: 1, encarregados_habilitado: 1, area_no_scanner_habilitada: 1 })
  .every(k => new RegExp(`${k}: '`).test(internos)), 'as 6 opções da tela da organização')

console.log('\n2 · quem lê passa a olhar o evento')
ok(/await obterFuncionalidadesDoEvento\(eventoId\)/.test(ler('lib/escala.ts')), 'dias de trabalho (escala por dia)')
ok(/obterFuncionalidadesDoEvento\(\(forn\?\.evento_id/.test(ler('lib/encarregado-flag.ts')), 'Encarregado no menu do supervisor')
ok((ler('lib/actions-encarregado.ts').match(/obterFuncionalidadesDoEvento\(/g) ?? []).length === 2, 'Encarregado (painel e criação)')
ok(/obterFuncionalidadesDoEvento\(eventoId\)/.test(ler('lib/importacao.ts')), 'importação de planilha')
ok(/obterFuncionalidadesDoEvento\(evento\.id\)\)\.areaNoScannerHabilitada/.test(actions) && /obterFuncionalidadesDoEvento\(id\)\)\.areaNoScannerHabilitada/.test(internos), 'área no leitor (servidor e tela)')
ok(/const \{ travaCotaHabilitada \} = await obterFuncionalidadesDoEvento\(/.test(actions), 'trava pela quantidade do setor')
ok(/obterFuncionalidadesDoEvento\(id\)/.test(ler('app/admin/eventos/[id]/page.tsx')) && /obterFuncionalidadesDoEvento\(id\)/.test(ler('app/admin/eventos/[id]/editar/page.tsx')), 'tela do evento e Editar evento')

console.log('\n3 · salvar e voltar')
const salvar = actions.slice(actions.indexOf('export async function editarFuncionalidadesDoEvento'))
ok(/if \(!perfil \|\| !ehMaster\(perfil\.role\)\) return \{ erro/.test(salvar.slice(0, 600)), 'só o master salva')
ok(/Object\.keys\(CHAVES_FUNCIONALIDADES\)\.map\(coluna => \[coluna, formData\.get\(coluna\) === 'on'\]\)/.test(salvar), 'grava as 6 de uma vez')
ok(/update\(\{ funcionalidades: null \}\)/.test(actions), '"Voltar a seguir a organização" apaga a configuração própria')
ok(/editarFuncionalidadesDoEvento\(eventoId, formData\)/.test(ler('app/admin/configuracoes/FuncionalidadesForm.tsx')), 'o MESMO formulário da tela da organização')

console.log('\n4 · botões')
const pagina = ler('app/admin/eventos/[id]/configuracoes/page.tsx')
ok(/if \(!ehMaster\(perfil\.role\)\) redirect/.test(pagina), 'página só do master')
for (const [arq, nome] of [['app/admin/eventos/[id]/page.tsx', 'página do evento'], ['app/admin/eventos/[id]/editar/page.tsx', 'Editar evento']]) {
  ok(/ehMaster\(perfil\?\.role\) && \(\s*<Link href=\{`\/admin\/eventos\/\$\{id\}\/configuracoes`\}/.test(ler(arq)), `botão "Configurações" em ${nome}, só pro master`)
}

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
