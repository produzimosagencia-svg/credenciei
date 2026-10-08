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
ok(/\(\?!guia-\(\?:supervisor\|operador\|encarregado\)\$\)/.test(config), 'o DENY global exclui os guias (senão o iframe fica em branco)')
ok(/outputFileTracingIncludes[\s\S]*conteudo\/guia-supervisor\.html/.test(config), 'o arquivo vai junto no deploy da Vercel')
ok(/href="\/admin\/tutorial-supervisor"[\s\S]{0,700}Tutorial supervisor/.test(shell), 'o menu da foto tem "Tutorial supervisor"')
ok(/perfil\.role === 'supervisor' &&\s*\(\s*<Link\s+href="\/admin\/tutorial-supervisor"/.test(shell), 'o item aparece só para o supervisor')

console.log('Guia do operador de portão')
{
  const rotaOp = ler('app/guia-operador/route.ts')
  ok(existsSync(new URL('../conteudo/guia-operador-portao.html', import.meta.url)), 'o arquivo do guia do operador existe em conteudo/')
  ok(/pathname === '\/guia-operador'/.test(proxy), 'o proxy deixa /guia-operador abrir sem login')
  ok(!/getPerfil/.test(rotaOp) && /guia-operador-portao\.html/.test(rotaOp), 'a rota do guia do operador não exige sessão e lê o arquivo certo')
  ok(/\(\?!guia-\(\?:supervisor\|operador\|encarregado\)\$\)/.test(config) && /source: '\/guia-operador'/.test(config), 'o DENY global exclui o guia do operador e ele pode ser embutido')
  ok(/outputFileTracingIncludes[\s\S]*guia-operador-portao\.html/.test(config), 'o arquivo do operador vai junto no deploy')
  ok(/perfil\.role === 'operador_portao' &&\s*\(\s*<Link\s+href="\/admin\/tutorial-operador"/.test(shell), 'o menu da foto tem "Tutorial operador" só para o operador de portão')
}

console.log('Guia do supervisor: depoimentos')
{
  const g = ler('conteudo/guia-supervisor.html')
  ok(/id="depoimentos"/.test(g) && /Avalie quem trabalhou com você/.test(g), 'o guia do supervisor tem o capítulo de depoimentos')
  ok(/Dê de 1 a 5 estrelas/.test(g) && /Escreva um depoimento, se quiser/.test(g), 'o capítulo explica as estrelas e o depoimento opcional')
}

console.log('Guia do Encarregado')
{
  const rotaEnc = ler('app/guia-encarregado/route.ts')
  ok(existsSync(new URL('../conteudo/guia-encarregado.html', import.meta.url)), 'o arquivo do guia do Encarregado existe')
  ok(/pathname === '\/guia-encarregado'/.test(proxy) && !/getPerfil/.test(rotaEnc) && /guia-encarregado\.html/.test(rotaEnc), 'o link /guia-encarregado abre sem login e lê o arquivo certo')
  ok(/source: '\/guia-encarregado'/.test(config) && /guia-encarregado\.html/.test(config), 'pode ser embutido e vai junto no deploy')
  ok(/href="\/guia-encarregado"/.test(ler('app/encarregado/[fid]/page.tsx')), 'o painel de consulta do Encarregado liga ao guia')
}

console.log('Guias sempre em modo claro (Juan, 08/10/2026)')
{
  for (const f of ['guia-supervisor', 'guia-operador-portao', 'guia-encarregado']) {
    const g = ler(`conteudo/${f}.html`)
    ok(!/prefers-color-scheme: dark/.test(g) && !/data-theme="dark"/.test(g) && /color-scheme: light/.test(g), `${f}: não troca para o tema escuro do aparelho`)
  }
}

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
