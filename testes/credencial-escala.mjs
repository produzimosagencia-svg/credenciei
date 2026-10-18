/*
 * CREDENCIAL E ESCALA.
 *
 * VITAL, 08/10/2026: dia fora da escala escondia os botões de registrar (o servidor recusava).
 * LUAN, 18/10/2026 — REGRA NOVA (Juan: "esses ajustes que a gente fez no VITAL não podem prejudicar o sistema… o
 * sistema é simples, não pode estar acontecendo esses entraves"): a escala NÃO bloqueia mais nada. A credencial mostra
 * os dias como informação, e o servidor deixa a batida entrar MARCADA (lib/alerta-batida.ts).
 *
 * Roda com: node testes/credencial-escala.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const pagina = ler('app/credential/[token]/page.tsx')
ok(/const bloqueadoHoje = false/.test(pagina) && pagina.includes('bloqueadoHoje={bloqueadoHoje}'), 'a credencial não bloqueia mais a etapa por causa da escala')
ok(/const modoBotaoUnico = podeAutoRegistrar\n/.test(pagina) && !pagina.includes('bloqueadoNoAutoatendimento'), 'o botão único do autoatendimento não some por causa da escala')

const dias = ler('app/credential/[token]/DiasLiberados.tsx')
ok(!dias.includes('RECUSA_DIA_NAO_AUTORIZADO') && /Hoje não está entre os seus dias confirmados/.test(dias) && /avise o seu supervisor/.test(dias),
  'os dias continuam à vista, como informação — sem o "acesso não autorizado para hoje"')

const a = ler('lib/actions.ts')
for (const acao of ['registrarPresencaLivre', 'registrarPresencaFoto', 'registrarPresencaFacialLivre']) {
  const i = a.indexOf(`export async function ${acao}(`)
  ok(!/conferirEscalaNoDia\(|conferirEscalaDaBatida\(/.test(a.slice(i, i + 9000)), `${acao}: o servidor não recusa mais por escala`)
}
for (const acao of ['registrarPresencaLivre', 'registrarPresencaFacialLivre']) {
  const i = a.indexOf(`export async function ${acao}(`)
  ok(/alertaDeEscala\(/.test(a.slice(i, i + 9000)), `${acao}: a entrada fora da escala fica marcada`)
}

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
