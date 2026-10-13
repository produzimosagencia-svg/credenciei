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
ok(/\.rd-raiz, \.rd-raiz \* \{ visibility: visible !important; \}/.test(doc) && /body \* \{ visibility: hidden; \}/.test(ler('app/globals.css')),
  'o PDF não sai em branco: a regra do crachá esconde tudo na impressão, o relatório volta a aparecer (Juan, 13/10/2026)')

console.log('\nFechamento do turno (o modelo)')
ok(/rotulo: 'Pendentes por equipe'/.test(fechamento) && /rotulo: 'Equipes zeradas'/.test(fechamento), 'as duas seções do modelo')
ok(/destaque: 'Somente equipes com apontamento\.'/.test(fechamento), 'o aviso do modelo')
ok(/const soPagas = p\.escopo !== 'todas'/.test(fechamento), 'por padrão só as equipes pagas por pessoa (as que pedem o meio) — o recorte do modelo')
ok(/exigirAcessoAoEvento\(eventoId\)/.test(dados) && /setoresPermitidos/.test(dados), 'mesma régua de acesso dos outros relatórios (supervisor vê só os setores dele)')
ok(/window\.open\(`\/relatorios-pdf\/\$\{eventoId\}\/turno\?de=\$\{turnoDe\}&ate=\$\{turnoAte\}/.test(ler('app/admin/eventos/[id]/relatorios/ExportarRelatorio.tsx')), 'o cartão na tela de Relatórios abre o PDF de um dia ou de vários (de/até)')

// Vários dias no mesmo PDF (Juan, 13/10/2026: "preciso poder filtrar mais dias, por exemplo dia 10/10 a 12/10") — roda a
// montagem de verdade (o Node tira os tipos; só os imports sem extensão precisam de ajuste).
{
  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  const pasta = raiz + '.tmp-teste-fechamento'
  rmSync(pasta, { recursive: true, force: true }); mkdirSync(pasta, { recursive: true })
  writeFileSync(pasta + '/relatorio-doc.ts', molde)
  writeFileSync(pasta + '/relatorio-doc-fechamento.ts', fechamento.replace("from './relatorio-doc'", "from './relatorio-doc.ts'"))
  const { montarFechamentoDoTurno } = await import(pasta + '/relatorio-doc-fechamento.ts')
  rmSync(pasta, { recursive: true, force: true })
  const setores = [{ id: 'm', nome: 'MARA BRANDÃO', area: 'CAMAROTE NAVISTA', pedeMeio: true }, { id: 'g', nome: 'GOTE', area: 'GERAL', pedeMeio: true }]
  const b = (f, s, tipo, dataRef) => ({ funcionarioId: f, fornecedorId: s, tipo, dataRef })
  const batidas = [
    b('ana', 'm', 'entrada', '2026-10-10'), b('ana', 'm', 'fim', '2026-10-10'),   // 10/10 completo
    b('ana', 'm', 'entrada', '2026-10-11'),                                       // 11/10 sem saída
    b('bia', 'm', 'entrada', '2026-10-11'),                                       // 11/10 sem saída
    b('caio', 'g', 'entrada', '2026-10-12'), b('caio', 'g', 'fim', '2026-10-12'), // zerada
    b('davi', 'g', 'entrada', '2026-10-13'),                                      // fora do período pedido
  ]
  const r = montarFechamentoDoTurno({ eventoNome: 'VITAL', de: '2026-10-10', ate: '2026-10-12', setores, batidas })
  const [pend, porDia, zeradas] = r.secoes
  ok(r.rotuloEvento === 'VITAL · Turnos de 10/10 a 12/10', 'o cabeçalho diz o período: ' + r.rotuloEvento)
  ok(pend.titulo === '2 entradas sem saída em 1 equipe.' && JSON.stringify(pend.linhas[0].slice(1, 4)) === '["Camarote Navista",3,2]', 'por equipe, cada pessoa conta uma vez POR DIA: Mara 3 entradas, 2 sem saída — ' + pend.titulo)
  ok(porDia?.rotulo === 'Sem saída por dia' && porDia.linhas.length === 1 && porDia.linhas[0][0] === 'Dom 11/10' && porDia.linhas[0][4] === 2, 'a seção nova diz em qual dia ficou cada pendência (domingo, 11/10: 2)')
  ok(zeradas?.rotulo === 'Equipes zeradas' && zeradas.linhas.length === 1 && zeradas.linhas[0][2] === 1, 'a batida de 13/10, fora do período, não entra (Gote: 1 entrada, zerada)')
  const umDia = montarFechamentoDoTurno({ eventoNome: 'VITAL', de: '2026-10-11', ate: '2026-10-11', setores, batidas })
  ok(umDia.rotuloEvento === 'VITAL · Turno de domingo, 11/10' && umDia.secoes.length === 2 && umDia.secoes[0].titulo === '2 pessoas em 1 equipe.', 'com um dia só, o relatório é o de antes (duas seções, "pessoas")')
}

console.log('\nPresença (completo / por fornecedor) — resumida e completa (Juan, 12/10/2026: "contendo as horas, de entrada, meio e fim, dias trabalhados por equipe, quem bateu fora da localização")')
const presenca = ler('lib/relatorio-doc-presenca.ts'), rota = ler('app/relatorios-pdf/[eventoId]/presenca/page.tsx'), tela = ler('app/admin/eventos/[id]/relatorios/ExportarRelatorio.tsx')
ok(/rotulo: 'Presença no período'/.test(presenca) && /rotulo: 'Dias trabalhados por equipe'/.test(presenca) && /rotulo: 'Batidas fora do local'/.test(presenca), 'resumo, dias trabalhados por equipe e fora do local')
ok(/titulo: 'Entrada'[\s\S]{0,80}titulo: 'Meio'[\s\S]{0,80}titulo: 'Saída'[\s\S]{0,80}titulo: 'Horas'/.test(presenca), 'cada equipe: entrada, meio, saída e horas de cada pessoa em cada dia')
ok(/\{ valor: 'sem saída', destaque: true \}/.test(presenca) && /\{ valor: 'sem meio', destaque: true \}/.test(presenca), 'o que falta sai em laranja (o meio só onde o setor e o dia pedem)')
ok(/relatorioForaDoLocal\(eventoId, setoresPermitidos\)/.test(rota) && /destaque: 'Só entra o que tem prova\.'/.test(presenca), 'fora do local: só o que tem prova de GPS, nos setores e no período do relatório')
ok(/from\('pausas_turno'\)[\s\S]{0,120}meio_em/.test(rota), 'os meios de blocos anteriores (meio por bloco) também aparecem')
ok(/export function montarAusentes/.test(presenca) && /q\.quem === 'ausentes'/.test(rota), 'e o avesso: quem não credenciou')
ok(/abrirPresencaPdf\(\)/.test(tela) && /abrirPresencaPdf\(setorId\)/.test(tela) && /Exportar relatório completo/.test(tela), 'na tela: PDF no completo e no por fornecedor — e a planilha continua')

console.log('\nTodos os outros relatórios também em PDF (as planilhas continuam)')
const extra = ler('lib/relatorio-doc-extra.ts'), outros = ler('lib/relatorio-doc-outros.ts'), cards = ler('app/admin/eventos/[id]/relatorios/OutrosRelatorios.tsx')
ok(/export function montarExtra/.test(extra) && /const MAX_COLUNAS = 9/.test(extra), 'Credenciados hoje, Aguardando, Cadastros, Pedidos, Veículos, Subeventos, Bloqueios e Auditoria: cada aba vira uma seção (no máximo 9 colunas — o resto fica na planilha)')
ok(/const paisagem = abas\.some\(a => a\.colunas\.length > 7\)/.test(extra) && /@page \{ size: A4 landscape; margin: 0; \}/.test(doc), 'tabela larga vai em A4 deitada')
ok(/export function montarLimitesDoc/.test(outros) && /export function montarSubgrupoDoc/.test(outros), 'Limite por dia e Relatório do subgrupo')
ok(/rotulo: 'Quem falta aprovar'/.test(outros) && /rotulo: 'Supervisores'/.test(outros) && /rotulo: 'Batidas do fornecedor'/.test(outros), 'subgrupo: resumo, quem falta aprovar, supervisores e as batidas de cada fornecedor (com meio)')
ok(/export function secaoForaDoLocal/.test(ler('lib/relatorio-doc-presenca.ts')), 'Fora do local sozinho usa a mesma seção (só com prova)')
ok(Object.keys({ hoje: 1, aguardando: 1, cadastros: 1, fora_local: 1, limites: 1, pedidos_setor: 1, veiculos: 1, subeventos: 1, bloqueios: 1, auditoria: 1 }).every(k => new RegExp(`${k}: '`).test(cards)) && /> PDF/.test(cards) && /> Planilha/.test(cards),
  'cada cartão de "Outros relatórios" tem Planilha e PDF')
ok(/PDF do subgrupo/.test(tela), 'o cartão do subgrupo também')

console.log('\nEntrega de valor no padrão novo (Juan, 12/10/2026: "pode fazer")')
const entrega = ler('lib/relatorio-doc-entrega.ts'), botao = ler('app/admin/eventos/[id]/relatorios/BotaoEntregaValor.tsx')
ok(/rotulo: 'Presença sob controle'/.test(entrega) && /rotulo: 'Segurança e controle de acesso'/.test(entrega) && /rotulo: 'O que o Credenciei somou ao seu evento'/.test(entrega), 'o mesmo conteúdo do PDF antigo, no padrão do modelo')
ok(/href=\{`\/relatorios-pdf\/\$\{encodeURIComponent\(eventoId\)\}\/entrega-valor`\}/.test(botao), 'o botão abre a versão nova')
ok(/total: funcs\.length \+ await cadastrosSoNaLixeira\(eventoId\)/.test(ler('lib/entrega-valor.ts')), '"pessoas cadastradas" = o mesmo número do cartão "Funcionários do evento"')

console.log('\nEconomia na primeira página da entrega de valor (Juan, 13/10/2026)')
{
  const ev = ler('lib/entrega-valor.ts'), doc = ler('lib/relatorio-doc-entrega.ts')
  ok(/VALOR_MEDIO_DIARIA = 200/.test(ev) && /valor: semComparecer \* VALOR_MEDIO_DIARIA/.test(ev), 'economia = diárias aprovadas sem comparecimento × R$ 200')
  ok(/filter\(f => \(f as \{ exige_meio\?: boolean \| null \}\)\.exige_meio === true\)/.test(ev) && /\.eq\('aprovado', true\)/.test(ev) && /d <= hoje/.test(ev), 'só nas equipes com meio, só diárias aprovadas, só dias que já passaram')
  ok(/titulo: `Com o Credenciei, você economizou \$\{brl\(e\.valor\)\}\.`/.test(doc) && /return \[\n    \.\.\.economia,/.test(doc), 'é a primeira seção do PDF')
}

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
