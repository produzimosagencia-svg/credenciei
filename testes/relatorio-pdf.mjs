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
ok(/página \{paginasAntes \+ i \+ 1\} de \{paginasAntes \+ folhas\.length\}/.test(folhas) && /logo-preto\.png/.test(folhas), 'logo no topo e "página X de Y" no rodapé')
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

console.log('\nEconomia com faltas (Juan, 14/10/2026 — docs/economia-faltas-vital.pdf) e a mesma conta na Entrega de valor')
{
  const eco = ler('lib/economia-faltas.ts'), ev = ler('lib/entrega-valor.ts'), docE = ler('lib/relatorio-doc-entrega.ts')
  const capa = ler('components/relatorio-doc/CapaEconomia.tsx'), botao = ler('app/admin/eventos/[id]/relatorios/BotaoEconomiaFaltas.tsx')
  ok(/VALOR_MEDIO_DIARIA = 200/.test(eco) && /economia: faltaram \* VALOR_MEDIO_DIARIA/.test(eco), 'economia = pessoas cadastradas que não bateram entrada × R$ 200 (a regra do modelo)')
  ok(/exige_meio === true/.test(eco) && /status_credenciamento !== 'negado'/.test(eco) && /d <= hoje/.test(eco), 'só equipes com meio, só aprovados, só dias que já passaram')
  ok(/dadosEconomiaFaltas\(eventoId\)/.test(ev) && /return \[\n    \.\.\.economia,/.test(docE), 'a Entrega de valor usa a MESMA conta (nunca dois números diferentes pro cliente)')
  ok(/iso-3d\.png/.test(capa) && /Economia gerada pelo Credenciei/.test(capa) && /Não compareceram/.test(capa), 'capa escura: símbolo 3D, o valor e os três números')
  ok(/CHAVE_LOGO_ECONOMIA/.test(capa) && /Gerar PDF com esta logo/.test(botao) && /Gerar sem a logo/.test(botao), 'a logo do evento é pedida a cada geração e vai no canto da capa')
  const pasta = raiz + '.tmp-teste-economia'
  const { mkdirSync, writeFileSync, rmSync } = await import('node:fs')
  rmSync(pasta, { recursive: true, force: true }); mkdirSync(pasta, { recursive: true })
  writeFileSync(pasta + '/relatorio-doc.ts', molde)
  writeFileSync(pasta + '/relatorio-doc-economia.ts', ler('lib/relatorio-doc-economia.ts').replace("from './relatorio-doc'", "from './relatorio-doc.ts'"))
  const { montarEconomiaDoc } = await import(pasta + '/relatorio-doc-economia.ts')
  rmSync(pasta, { recursive: true, force: true })
  const secoes = montarEconomiaDoc({ eventoNome: 'VITAL', periodo: { de: '2026-10-08', ate: '2026-10-13' }, valorDiaria: 200, cadastrados: 10, foram: 7, faltaram: 3, economia: 600,
    equipes: [{ nome: 'Gatti - Segurança', cadastrados: 6, foram: 4, faltaram: 2, economia: 400, ausentes: [{ nome: 'Ana', area: 'Bloco' }, { nome: 'Bia', area: 'Camarote' }] },
      { nome: 'Gote - Limpeza', cadastrados: 3, foram: 2, faltaram: 1, economia: 200, ausentes: [{ nome: 'Caio', area: 'Geral' }] },
      { nome: 'Time Kiki', cadastrados: 1, foram: 1, faltaram: 0, economia: 0, ausentes: [] }] })
  ok(secoes[0].rotulo === 'Faltas e economia por equipe' && secoes[0].linhas.length === 4, 'por equipe: todas as equipes + a linha de total')
  ok(secoes.some(x => x.titulo === 'Gatti - Segurança · 2 faltas · R$ 200'.replace('R$ 200', 'R$\u00a0400')) || secoes.some(x => /^Gatti - Segurança · 2 faltas · R\$\s400$/.test(x.titulo)), 'quem não foi: uma lista por equipe, com faltas e o valor')
  const fim = secoes.at(-1)
  ok(fim.rotulo === 'Economia com o Credenciei' && /^3 pessoas × R\$\s200$/.test(fim.titulo) && /R\$\s600/.test(fim.valorGrande), 'fechamento: "3 pessoas × R$ 200" e o valor grande')
}

console.log(falhas ? `\n✗ ${falhas} falha(s)` : '\nOK')
process.exit(falhas ? 1 : 0)
