/*
 * OS CARTÕES DE NÚMEROS (Juan, 18/10/2026):
 *   * na equipe, sai o "Com pendências" — fica só o Total (e o A receber para quem gerencia), em linha, sem vão ao lado;
 *   * o operador de portão vê os números do evento (os mesmos cinco da tela do evento) na tela de Boas-vindas.
 *
 * Roda com: node testes/kpis-equipe-e-operador.mjs
 */
import { readFileSync } from 'node:fs'
const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const equipe = ler('app/admin/eventos/[id]/fornecedor/[fid]/page.tsx')
ok(!/label: 'Com pendências'/.test(equipe) && !/const comPendencia/.test(equipe), 'equipe: o cartão "Com pendências" saiu')
ok(/label: 'Total', value: total, sub:/.test(equipe) && /<StatCard key=\{s\.label\} \{\.\.\.s\} emLinha \/>/.test(equipe) && /stats\.length > 1 \? 'sm:grid-cols-2' : ''/.test(equipe), 'equipe: Total em linha (sozinho ocupa a fileira; com o A receber, dois lado a lado no computador)')
const card = ler('components/StatCard.tsx')
ok(/emLinha\?: boolean/.test(card) && /indicador-linha/.test(ler('app/globals.css')), 'StatCard tem a versão em linha, com estilo próprio também no celular')

const numeros = ler('lib/numeros-do-evento.ts')
const evento = ler('app/admin/eventos/[id]/page.tsx')
ok(/cadastrosSoNaLixeira/.test(numeros) && /cadastrosSoNaLixeira/.test(evento), 'funcionários do evento: a mesma conta da tela do evento (inclui baixa e lixeira)')
ok(/\.eq\('data_ref', dia\)/.test(numeros) && /presentes: \[\.\.\.entraram\]\.filter\(id => !sairam\.has\(id\)\)\.length/.test(numeros), 'presentes = entrou no dia e não saiu; o dia é o do turno')
const bemVindo = ler('app/admin/bem-vindo/page.tsx')
ok(/escolhido && hoje\.has\(escolhido\.id\) \? await numerosDoEvento\(escolhido\.id\)/.test(bemVindo) && /label="Presentes no momento"/.test(bemVindo) && /<AtualizarSozinho segundos=\{30\} \/>/.test(bemVindo), 'operador: os números do evento escolhido, no dia de operação, atualizando sozinhos')
ok(/eventosEscaneaveisSemData\(perfil\)/.test(bemVindo), 'operador só vê os números dos eventos dele (a mesma lista do scanner)')

console.log(falhas ? `\n\x1b[31m${falhas} falha(s)\x1b[0m` : '\n\x1b[32mTudo certo.\x1b[0m')
process.exit(falhas ? 1 : 0)
