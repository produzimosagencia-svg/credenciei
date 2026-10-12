/*
 * RELATÓRIOS EM PDF NO PADRÃO DO MODELO (Juan, 12/10/2026 — docs/modelo de relatorio .pdf): "preciso que os relatórios
 * sigam esse padrão de modelo, detalhado dessa forma, com o template do nosso sistema".
 *
 * Roda com: node testes/relatorio-pdf.mjs
 */
import { readFileSync } from 'node:fs'

const raiz = new URL('..', import.meta.url).pathname
const ler = c => readFileSync(raiz + c, 'utf8')
let falhas = 0
const ok = (c, m) => { if (!c) falhas++; console.log(`  ${c ? '\x1b[32m✓' : '\x1b[31m✗'}\x1b[0m ${m}`) }

const molde = ler('lib/relatorio-doc.ts'), folhas = ler('components/relatorio-doc/Folhas.tsx'), doc = ler('components/relatorio-doc/Documento.tsx')
const fechamento = ler('lib/relatorio-doc-fechamento.ts'), dados = ler('lib/relatorio-doc-turno.ts')

console.log('O molde')
ok(/rotulo: string[\s\S]*titulo: string[\s\S]*aviso\?: \{ destaque: string; texto: string \}/.test(molde), 'seção = rótulo laranja + frase-resumo + aviso + tabela')
ok(/'nome'[\s\S]*'texto'[\s\S]*'numero'[\s\S]*'destaque'[\s\S]*'barra'/.test(molde), 'colunas: nome, texto, número, destaque laranja e barra de proporção')
ok(/export function paginar/.test(molde) && /continuacao: !primeira/.test(molde), 'paginação em A4: cada seção numa folha nova, a tabela continua com o cabeçalho')
ok(/página \{i \+ 1\} de \{folhas\.length\}/.test(folhas) && /logo-preto\.png/.test(folhas), 'logo no topo e "página X de Y" no rodapé')
ok(/@page \{ size: A4; margin: 0; \}/.test(doc) && /print-color-adjust: exact/.test(doc) && /window\.print\(\)/.test(doc), 'A4 de verdade, cores mantidas na impressão, "Baixar PDF" pela impressão do navegador')

console.log('\nFechamento do turno (o modelo)')
ok(/rotulo: 'Pendentes por equipe'/.test(fechamento) && /rotulo: 'Equipes zeradas'/.test(fechamento), 'as duas seções do modelo')
ok(/destaque: 'Somente equipes com apontamento\.'/.test(fechamento), 'o aviso do modelo')
ok(/const soPagas = p\.escopo !== 'todas'/.test(fechamento), 'por padrão só as equipes pagas por pessoa (as que pedem o meio) — o recorte do modelo')
ok(/exigirAcessoAoEvento\(eventoId\)/.test(dados) && /setoresPermitidos/.test(dados), 'mesma régua de acesso dos outros relatórios (supervisor vê só os setores dele)')
ok(/window\.open\(`\/relatorios-pdf\/\$\{eventoId\}\/turno\?dia=\$\{diaTurno\}/.test(ler('app/admin/eventos/[id]/relatorios/ExportarRelatorio.tsx')), 'o cartão na tela de Relatórios abre o PDF do dia')

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
