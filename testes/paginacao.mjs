/*
 * PAGINAÇÃO COM ORDEM COMPLETA — o bug de 06/10/2026: a Base de funcionários
 * perdia ~6 pessoas por carregamento (e repetia outras), porque paginava de
 * 1000 em 1000 ordenando só por data, e cadastros em lote têm a MESMA data.
 *
 * Roda com: node testes/paginacao.mjs
 */
import { readFileSync } from 'node:fs'
let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
const janela = (src, ini, tam = 1400) => { const i = src.indexOf(ini); return i < 0 ? '' : src.slice(i, i + tam) }

console.log('\n\x1b[1m1 · Toda consulta paginada tem desempate por id\x1b[0m')
const enc = ler('app/admin/encontrar/page.tsx')
ok(/\.order\('created_at', \{ ascending: false \}\)[\s\S]{0,400}\.order\('id', \{ ascending: true \}\)[\s\S]{0,40}\.range\(de, ate\)/.test(enc), 'Base de funcionários (Encontrar): created_at + id')
const act = ler('lib/actions.ts')
ok((act.match(/\.order\('nome'\)\s*\n\s*\.order\('id'\)/g) ?? []).length >= 2, 'Localizar (2 consultas): nome + id — homônimos não cortam a página')
ok(ler('lib/ia/ferramentas/consultas.ts').includes(".order('nome')\n            .order('id')"), 'consulta do assistente de IA: nome + id')
ok(ler('lib/gastos.ts').includes(".order('registrado_em', { ascending: false }).order('id')"), 'gastos: data + registro + id')
ok(ler('app/admin/page.tsx').includes(".order('created_at').order('id')"), 'gráfico do painel: created_at + id')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
