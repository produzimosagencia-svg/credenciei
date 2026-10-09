/*
 * CREDENCIAL: DIA NÃO LIBERADO NA ESCALA = NENHUM BOTÃO DE REGISTRAR (VITAL, 08/10/2026). A tela mostrava "Acesso
 * não autorizado para hoje" e, logo abaixo, o botão "Registrar entrada" ativo. O servidor recusa
 * (`conferirEscalaNoDia`), mas o botão não pode nem aparecer.
 *
 * Roda com: node testes/credencial-escala.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const pagina = ler('app/credential/[token]/page.tsx')
const checkin = ler('app/credential/[token]/CheckinPresenca.tsx')
ok(/const bloqueadoHoje = !!escala && \(escala\.pendente \|\| !escala\.aprovados\.includes\(hoje\)\)/.test(pagina) && pagina.includes('bloqueadoHoje={bloqueadoHoje}'), 'a credencial bloqueia quando a escala está pendente ou hoje não é dia aprovado (a mesma regra do servidor)')
ok(/if \(info\.status === 'disponivel' && bloqueado\) \{/.test(checkin) && checkin.indexOf("info.status === 'disponivel' && bloqueado") < checkin.indexOf("if (info.status === 'disponivel') {"), 'o cartão bloqueado vira aviso ANTES de qualquer botão (entrada, meio, saída)')
ok(/biometriaAutoatendimento && !embutido && !bloqueadoHoje/.test(checkin), 'o reconhecimento facial também some')
for (const acao of ['registrarPresencaLivre', 'registrarPresencaFoto', 'registrarPresencaFacialLivre']) {
  const a = ler('lib/actions.ts'); const i = a.indexOf(`export async function ${acao}(`)
  ok(/conferirEscalaNoDia\(/.test(a.slice(i, i + 9000)), `${acao}: o servidor continua conferindo a escala`)
}

console.log(falhas ? `\n${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
