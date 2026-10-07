/*
 * GUIA DO SUPERVISOR — o guia animado é PÚBLICO (decisão de 07/10/2026) e abre dentro do
 * sistema pelo menu da foto ("Tutorial supervisor"). Três coisas se quebram em silêncio:
 *   - sair da lista de rotas abertas do proxy (o link cairia no login);
 *   - o DENY global voltar a cobrir o guia (o iframe da tela ficaria em branco);
 *   - o item sumir do menu do supervisor.
 *
 * Roda com: node testes/guia.mjs
 */
import { readFileSync, existsSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const proxy = ler('proxy.ts')
const config = ler('next.config.ts')
const shell = ler('components/AppShell.tsx')
const rota = ler('app/guia-supervisor/route.ts')

ok(existsSync(new URL('../conteudo/guia-supervisor.html', import.meta.url)), 'o arquivo do guia existe em conteudo/')
ok(/pathname === '\/guia-supervisor'/.test(proxy), 'o proxy deixa /guia-supervisor abrir sem login')
ok(!/getPerfil/.test(rota), 'a rota do guia não exige sessão')
ok(/'X-Frame-Options': 'SAMEORIGIN'/.test(rota) && /source: '\/guia-supervisor'/.test(config), 'o guia pode ser embutido pelo próprio site')
ok(/\(\?!guia-supervisor\$\)/.test(config), 'o DENY global exclui o guia (senão o iframe fica em branco)')
ok(/outputFileTracingIncludes[\s\S]*conteudo\/guia-supervisor\.html/.test(config), 'o arquivo vai junto no deploy da Vercel')
ok(/href="\/admin\/tutorial-supervisor"[\s\S]{0,700}Tutorial supervisor/.test(shell), 'o menu da foto tem "Tutorial supervisor"')
ok(/perfil\.role === 'supervisor' &&\s*\(\s*<Link\s+href="\/admin\/tutorial-supervisor"/.test(shell), 'o item aparece só para o supervisor')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
