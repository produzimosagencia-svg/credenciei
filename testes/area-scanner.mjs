/*
 * ÁREA NO LEITOR + LIMITE POR DIA (pedidos de 08/10/2026).
 *   - "Selecionar a área no leitor" é uma funcionalidade da organização, DESLIGADA por padrão:
 *     sem ela o leitor só abre a câmera e registra quem entra, e o servidor não recusa por área;
 *   - editar o limite por dia no setor não pode mostrar valor velho nem falhar em silêncio.
 *
 * Roda com: node testes/area-scanner.mjs
 */
import { readFileSync } from 'node:fs'

let falhas = 0
const ok = (c, m) => { if (c) console.log(`  \x1b[32m✓\x1b[0m ${m}`); else { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); falhas++ } }
const ler = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')

const acoes = ler('lib/actions.ts')
const servidor = ler('lib/internos-servidor.ts')
const form = ler('app/admin/configuracoes/FuncionalidadesForm.tsx')
const scan = ler('app/scan/page.tsx')
const scanPainel = ler('app/admin/scanner/page.tsx')
const leitor = ler('app/scan/ScannerView.tsx')
const rosto = ler('app/scan/FaceScannerView.tsx')
const modal = ler('app/admin/eventos/[id]/FornecedorModal.tsx')
const sql = ler('supabase/upgrade-area-no-scanner.sql')

console.log('Área no leitor')
ok(/areaNoScannerHabilitada: boolean/.test(acoes), 'a funcionalidade existe no tipo')
ok(/areaNoScannerHabilitada: false/.test(servidor), 'nasce desligada (valor padrão)')
ok(/\(data as \{ area_no_scanner_habilitada\?: boolean \}\)\.area_no_scanner_habilitada === true/.test(servidor), 'só liga com true explícito (coluna ausente = desligada)')
ok(/name="area_no_scanner_habilitada"/.test(form), 'checkbox em Configurações → Funcionalidades')
ok(/formData\.get\('area_no_scanner_habilitada'\) === 'on'/.test(acoes), 'a edição lê o checkbox')
ok(/campoAlterado: 'Selecionar a área no leitor'/.test(acoes), 'a mudança é auditada')
ok(/add column if not exists area_no_scanner_habilitada boolean not null default false/.test(sql), 'migração: coluna desligada por padrão')
ok(/subeventoIdsLidos\?\.length && \(await obterFuncionalidadesDoEvento\(evento\.id\)\)\.areaNoScannerHabilitada/.test(acoes),
  'o servidor só confere a área quando o evento (ou a organização, sem configuração própria) ligou — nem com áreas guardadas no aparelho')
for (const [nome, src] of [['/scan', scan], ['/admin/scanner', scanPainel]]) {
  ok(/eventosComAreaNoScanner/.test(src) && /delete subeventosPorEvento\[id\]/.test(src), `${nome}: sem a funcionalidade, nenhum evento pergunta área`)
}
for (const [nome, src] of [['QR', leitor], ['rosto', rosto]]) {
  ok(/subeventosDoEvento\.length \? \(areasOverride \?\? areasDoEvento\(areasSalvasRaw, eventoId\)\) : \[\]/.test(src), `leitor de ${nome}: áreas guardadas não valem sem subeventos`)
}

console.log('Supervisor de vários setores aprova em todos eles')
const aprov = acoes.slice(acoes.indexOf('async function exigirAcessoAAprovacao'), acoes.indexOf('export async function aprovarCredenciamento'))
const ativ = acoes.slice(acoes.indexOf('export async function alternarAtivacao'), acoes.indexOf('async function exigirAcessoAAprovacao'))
for (const [nome, trecho] of [['aprovar/negar', aprov], ['ativar/desativar', ativ]]) {
  ok(/alcancaSetor\(perfil, fornecedorId\)/.test(trecho) && !/perfil\.fornecedor_id !== fornecedorId/.test(trecho), `${nome}: vale qualquer setor do supervisor, não só o ativo`)
}

console.log('Limite por dia no setor')
ok(/const abrir = \(\) => \{ setTravas\(null\); setOpen\(true\) \}/.test(modal) && !/onClick=\{\(\) => setOpen\(true\)\}/.test(modal), 'o modal zera o limite ao abrir (não mostra valor velho)')
ok(/key=\{`\$\{d\.data\}-\$\{travas\.atuais\[d\.data\] \?\? ''\}`\}/.test(modal), 'campo remonta quando o valor muda')
ok(/return avisoTrava \? \{ error: avisoTrava \} : \{\}/.test(acoes), 'se o limite não gravar, o erro volta pra tela')
ok(/if \(r\?\.error\) \{ setErro\(r\.error\)/.test(modal), 'o modal mostra esse erro')
ok(!/ENTRAR em cada dia/.test(modal), 'o texto não promete barrar no portão')

if (falhas) { console.log(`\n${falhas} falha(s)`); process.exit(1) }
console.log('\nTudo certo.')
