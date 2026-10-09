/*
 * CLIQUES NO INSTAGRAM E NO SITE (pedido do Juan, 09/10/2026): todo link do Instagram e do credenciei.com.br que
 * sai do sistema passa pela rota /ir, que grava o clique e redireciona. Este teste trava o que não pode voltar:
 * link escrito à mão (clique perdido), desvio aberto, rota fora do proxy, tela aberta a quem não é master.
 *
 * Roda com: node testes/cliques.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const rota = ler('app/ir/route.ts')
ok(/NextResponse\.redirect\(DESTINOS\[para\]/.test(rota), 'o destino sai da lista fechada, nunca da URL')
ok(/after\(async \(\) =>/.test(rota) && /from\('cliques_links'\)\.insert/.test(rota), 'grava depois de responder: banco fora não segura a pessoa')
ok(/UUID\.test/.test(rota), 'ids da URL só entram se forem uuid')
ok(/pathname === '\/ir'/.test(ler('proxy.ts')), "/ir é pública no proxy (senão o clique cai no login)")

const links = ler('lib/links-rastreados.ts')
ok(/instagram: 'https:\/\/www\.instagram\.com\/credenciei'/.test(links) && /site: 'https:\/\/credenciei\.com\.br'/.test(links), 'os dois destinos')

// Nenhuma tela com o Instagram escrito à mão no href (só o padrão do QrProtegido, que a página sempre sobrescreve).
const arquivos = []
const varrer = d => { for (const n of readdirSync(d)) { const p = join(d, n); statSync(p).isDirectory() ? varrer(p) : /\.tsx$/.test(n) && arquivos.push(p) } }
varrer(new URL('../app', import.meta.url).pathname)
varrer(new URL('../components', import.meta.url).pathname)
const soltos = arquivos.filter(f => /href="https:\/\/www\.instagram\.com/.test(readFileSync(f, 'utf8')))
ok(!soltos.length, `nenhum href do Instagram escrito à mão${soltos.length ? ': ' + soltos.join(', ') : ''}`)

ok(/linkRastreado\('instagram', 'landing'\)/.test(ler('app/page.tsx')), 'página inicial: Instagram rastreado')
const cred = ler('app/credential/[token]/page.tsx')
ok(/linkInstagram=\{linkRastreado\('instagram', 'credencial', \{ pessoa: funcionario\.id \}\)\}/.test(cred), 'credencial: Instagram rastreado, com quem clicou')
ok(/linkRastreado\('site', 'credencial', \{ pessoa: funcionario\.id \}\)/.test(cred), 'credencial: link do site rastreado')
const form = ler('app/form/[token]/FormularioFuncionario.tsx')
ok(/linkRastreado\('instagram', 'formulario', \{ setor: fornecedorId \}\)/.test(form) && /linkRastreado\('site', 'formulario', \{ setor: fornecedorId \}\)/.test(form), 'formulário: Instagram e site rastreados, com o setor')
ok(/linkRastreado\('site', 'pdf', \{ evento: d\.eventoId \}/.test(ler('lib/entrega-valor-pdf.ts')), 'PDF de entrega de valor: site clicável e rastreado')

const tela = ler('app/admin/cliques/page.tsx')
ok(/if \(!ehMaster\(perfil\.role\)\) redirect/.test(tela), 'a tela de cliques é só do master (mostra nomes)')
ok(/href="\/admin\/cliques"/.test(ler('app/admin/backlog/page.tsx')), 'botão de entrada no Backlog')
ok(/tabelaFaltando = true/.test(ler('lib/cliques.ts')), 'sem o SQL, a tela avisa em vez de quebrar')

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
