/*
 * "Entrada em qualquer horário" e "Pedir confirmação no meio" valendo pro evento inteiro (Juan, 12/10/2026: "quando
 * marcar lá em editar evento, precisa tá marcado para todos os setores; quando eu marcar só dentro do fornecedor, é
 * exclusivo para ele" — "vale pôr uma aba de entrada em qualquer horário também, igual tem a do meio").
 *
 * Roda com: node testes/editar-evento-global.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const actions = ler('lib/actions.ts'), internos = ler('lib/internos-servidor.ts')
const editar = ler('app/admin/eventos/[id]/editar/page.tsx'), secao = ler('app/admin/eventos/[id]/editar/ConfiguracaoEntradaQualquerHorario.tsx')
const modal = ler('app/admin/eventos/[id]/FornecedorModal.tsx'), evento = ler('app/admin/eventos/[id]/page.tsx'), sub = ler('app/admin/eventos/[id]/subevento/[sid]/page.tsx')

console.log('Seção "Entrada em qualquer horário" em Editar evento')
ok(/<ConfiguracaoEntradaQualquerHorario eventoId=\{id\} config=\{configEntradaLivre\} \/>/.test(editar), 'aparece em Editar evento, junto da do meio')
ok(/Marcar todos/.test(secao) && /salvarConfiguracaoEntradaLivre\(eventoId, \[\.\.\.setores\]\)/.test(secao), 'lista os fornecedores com "Marcar todos" e salva a lista inteira')
ok(/update\(\{ entrada_qualquer_horario: true \}\)\.in\('id', ligados\)/.test(actions) && /update\(\{ entrada_qualquer_horario: false \}\)\.in\('id', desligados\)/.test(actions),
  'grava o MESMO campo da caixinha do fornecedor (true nos marcados, false nos outros)')

console.log('\nFornecedor novo segue o evento')
ok(/exigeMeio: linhas\.every\(f => f\.exige_meio === true\)/.test(internos) && /entradaQualquerHorario: linhas\.every\(f => f\.entrada_qualquer_horario === true\)/.test(internos),
  'nasce marcado quando TODOS os fornecedores do evento estão marcados')
ok(/\(props as any\)\.padraoExigeMeio === true/.test(modal) && /\(props as any\)\.padraoEntradaQualquerHorario === true/.test(modal), 'o formulário de criar usa esse padrão')
ok([evento, sub].every(p => /padraoExigeMeio=\{padroesNovo\.exigeMeio\} padraoEntradaQualquerHorario=\{padroesNovo\.entradaQualquerHorario\}/.test(p)), 'nas duas telas que criam fornecedor (evento e subgrupo)')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
