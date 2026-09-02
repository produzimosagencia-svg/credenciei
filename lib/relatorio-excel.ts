/**
 * Geração do relatório pós-evento em .xlsx, no navegador.
 *
 * Roda no cliente, mesmo padrão de `lib/planilha.ts` (a exportação de equipe
 * que já existe): o servidor só busca e valida acesso aos dados
 * (`lib/relatorios.ts`); quem monta e baixa o arquivo é o browser. `exceljs`
 * entra por import dinâmico porque é pesado e só serve a este caminho.
 *
 * Por que `exceljs` e não `xlsx` (já usado no resto do sistema): a versão
 * gratuita do `xlsx` (SheetJS Community) não aplica estilo nenhum — cor,
 * borda, congelamento de linha e filtro são recurso da versão paga. O pedido
 * de relatório "corporativo profissional" exige essas quatro coisas, então
 * este arquivo é o único ponto do sistema que usa `exceljs`.
 *
 * ─── ESTRUTURA × FORMATAÇÃO ──────────────────────────────────────────────
 *
 * As funções ficam separadas em duas metades nomeadas, de propósito: as que
 * decidem O QUE vai em cada célula (dados) e as que decidem a APARÊNCIA
 * (cor, borda, largura). Mexer só na formatação nunca deveria arriscar mudar
 * um número, e vice-versa.
 */
import type { DadosRelatorioEvento, SetorRelatorio, LinhaRelatorio, MetodoRegistro } from './relatorios'
import { formatCpf } from './format'
import { formatarBR } from './tz'
import type { Workbook, Worksheet, Cell } from 'exceljs'

// ════════════════════════════════════════════════════════════════════════
// CÁLCULO — números derivados dos dados reais, nunca inventados
// ════════════════════════════════════════════════════════════════════════

export type ResumoSetor = {
  totalPessoas: number
  comEntrada: number
  comMeio: number
  comSaida: number
  semEntrada: number
  semSaida: number
  registrosAssistidos: number
  registrosQrCode: number
  percentualPresenca: number
}

/**
 * Os números do resumo de um setor.
 *
 * "Entradas registradas" etc. contam PESSOAS (quantas têm ao menos uma
 * entrada em algum dia), não linhas — é o que faz a conta bater com "pessoas
 * que não registraram entrada" (total − com entrada = sem entrada). Já
 * "registros assistidos"/"via QR Code" contam BATIDAS, somando todos os dias:
 * são números operacionais (quanto uso teve cada forma de registro), não uma
 * contagem de pessoas.
 *
 * "% de presença" é comEntrada/totalPessoas — quem nunca apareceu é o único
 * jeito objetivo de medir "não compareceu" sem inventar critério novo.
 */
export function calcularResumoSetor(setor: SetorRelatorio): ResumoSetor {
  const porPessoa = new Map<string, { entrada: boolean; meio: boolean; fim: boolean }>()
  let registrosAssistidos = 0
  let registrosQrCode = 0

  for (const l of setor.linhas) {
    const acc = porPessoa.get(l.funcionarioId) ?? { entrada: false, meio: false, fim: false }
    if (l.entrada) { acc.entrada = true; contarMetodo(l.entrada.metodo) }
    if (l.meio) { acc.meio = true; contarMetodo(l.meio.metodo) }
    if (l.fim) { acc.fim = true; contarMetodo(l.fim.metodo) }
    porPessoa.set(l.funcionarioId, acc)
  }

  function contarMetodo(m: MetodoRegistro) {
    if (m === 'Assistido') registrosAssistidos++
    if (m === 'QR Code') registrosQrCode++
  }

  const totalPessoas = porPessoa.size
  const comEntrada = [...porPessoa.values()].filter(p => p.entrada).length
  const comMeio = [...porPessoa.values()].filter(p => p.meio).length
  const comSaida = [...porPessoa.values()].filter(p => p.fim).length

  return {
    totalPessoas,
    comEntrada,
    comMeio,
    comSaida,
    semEntrada: totalPessoas - comEntrada,
    semSaida: totalPessoas - comSaida,
    registrosAssistidos,
    registrosQrCode,
    percentualPresenca: totalPessoas ? comEntrada / totalPessoas : 0,
  }
}

/**
 * O status de UMA LINHA (pessoa + dia). Só usa `exigeMeio` do setor: cobrar
 * "sem meio" de um setor que nunca pediu meio inventaria uma pendência que
 * não existe pra ninguém.
 */
export function statusDaLinha(l: LinhaRelatorio, exigeMeio: boolean): string {
  if (!l.entrada && !l.meio && !l.fim) return 'Não compareceu'
  if (!l.entrada) return 'Sem entrada'
  if (!l.fim) return 'Sem saída'
  if (exigeMeio && !l.meio) return 'Sem meio'
  return 'Completo'
}

// ════════════════════════════════════════════════════════════════════════
// APARÊNCIA — paleta e constantes de estilo
// ════════════════════════════════════════════════════════════════════════

/** A cor de marca do Credenciei (`--color-marca` do sistema), em ARGB. */
const COR_MARCA = 'FF4940DF'
const COR_ACENTO = 'FF6D46FF'
const COR_FAIXA_CLARA = 'FFF1EDFF'
const COR_BORDA = 'FFDCDFE8'
const COR_TEXTO = 'FF1E2028'
const COR_TEXTO_FRACO = 'FF6B7280'
const BRANCO = 'FFFFFFFF'

const COR_STATUS: Record<string, { texto: string; fundo: string }> = {
  'Completo': { texto: 'FF1E7A4E', fundo: 'FFE8F6EE' },
  'Sem meio': { texto: 'FFB36A12', fundo: 'FFFDF2E3' },
  'Sem saída': { texto: 'FFB36A12', fundo: 'FFFDF2E3' },
  'Sem entrada': { texto: 'FFC8322D', fundo: 'FFFDECEB' },
  'Não compareceu': { texto: 'FFC8322D', fundo: 'FFFDECEB' },
}

const COLUNAS_TABELA = [
  { titulo: 'Nome', largura: 30 },
  { titulo: 'CPF', largura: 16 },
  { titulo: 'Função', largura: 20 },
  { titulo: 'Supervisor', largura: 22 },
  { titulo: 'Data', largura: 12 },
  { titulo: 'Entrada', largura: 10 },
  { titulo: 'Meio', largura: 10 },
  { titulo: 'Saída', largura: 10 },
  { titulo: 'Método da entrada', largura: 16 },
  { titulo: 'Método do meio', largura: 16 },
  { titulo: 'Método da saída', largura: 16 },
  { titulo: 'Status', largura: 16 },
  { titulo: 'Justificativa', largura: 34 },
  { titulo: 'Observações', largura: 24 },
] as const
const N_COLUNAS = COLUNAS_TABELA.length

const bordaFina = { style: 'thin' as const, color: { argb: COR_BORDA } }
const BORDA_CELULA = { top: bordaFina, left: bordaFina, bottom: bordaFina, right: bordaFina }

/** Título de seção: faixa colorida, mesclada, texto branco em negrito. */
function escreverTitulo(ws: Worksheet, linha: number, texto: string) {
  ws.mergeCells(linha, 1, linha, N_COLUNAS)
  const cel = ws.getCell(linha, 1)
  cel.value = texto
  cel.font = { bold: true, size: 14, color: { argb: BRANCO } }
  cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_MARCA } }
  cel.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(linha).height = 26
}

/** Uma linha "Rótulo: valor" — rótulo em negrito, sem quebrar a leitura. */
function escreverInfo(ws: Worksheet, linha: number, rotulo: string, valor: string) {
  const rot = ws.getCell(linha, 1)
  rot.value = rotulo
  rot.font = { bold: true, color: { argb: COR_TEXTO } }
  ws.mergeCells(linha, 2, linha, N_COLUNAS)
  const val = ws.getCell(linha, 2)
  val.value = valor
  val.font = { color: { argb: COR_TEXTO } }
}

/**
 * O bloco de resumo (seções 2 e 5 do pedido): pares rótulo/número em duas
 * colunas lado a lado, fundo lavanda claro — a mesma família de cor da
 * marca, sem competir com o cabeçalho roxo forte.
 */
function escreverResumo(ws: Worksheet, linhaInicial: number, itens: { rotulo: string; valor: number | string }[]): number {
  let linha = linhaInicial
  const porLinha = 2 // dois pares por linha, pra não esticar demais em vertical
  for (let i = 0; i < itens.length; i += porLinha) {
    const par = itens.slice(i, i + porLinha)
    let coluna = 1
    for (const item of par) {
      const largura = Math.floor(N_COLUNAS / porLinha)
      const celRotulo = ws.getCell(linha, coluna)
      celRotulo.value = item.rotulo
      celRotulo.font = { bold: true, size: 10, color: { argb: COR_TEXTO_FRACO } }
      celRotulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } }
      celRotulo.alignment = { vertical: 'middle' }
      if (largura > 1) ws.mergeCells(linha, coluna, linha, coluna + Math.floor(largura / 2) - 1)

      const colValor = coluna + Math.floor(largura / 2)
      const celValor = ws.getCell(linha, colValor)
      celValor.value = item.valor
      celValor.font = { bold: true, size: 12, color: { argb: COR_MARCA } }
      celValor.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } }
      celValor.alignment = { vertical: 'middle' }
      if (largura - Math.floor(largura / 2) > 1) ws.mergeCells(linha, colValor, linha, coluna + largura - 1)

      coluna += largura
    }
    ws.getRow(linha).height = 20
    linha++
  }
  return linha
}

/** O cabeçalho da tabela de funcionários: faixa roxa, texto branco, congelado. */
function escreverCabecalhoTabela(ws: Worksheet, linha: number) {
  COLUNAS_TABELA.forEach((c, i) => {
    const cel = ws.getCell(linha, i + 1)
    cel.value = c.titulo
    cel.font = { bold: true, color: { argb: BRANCO }, size: 10 }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ACENTO } }
    cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cel.border = BORDA_CELULA
  })
  ws.getRow(linha).height = 30
}

/** "2026-09-05" → Date do dia certo, sem risco de fuso: montada em UTC direto pelas partes. */
function dataRefParaExcel(dataRef: string): Date | null {
  const m = dataRef.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

/**
 * Uma linha de dados da tabela de funcionários.
 *
 * As horas (Entrada/Meio/Saída) vão como TEXTO "HH:mm", não como valor de
 * data do Excel — de propósito. `exceljs` serializa `Date` pelos componentes
 * UTC, e uma hora de Brasília (UTC-3) construída sem esse cuidado apareceria
 * errada na planilha. Texto formatado (`formatarBR(..., 'hora')`, o mesmo
 * helper usado em todo o resto do sistema) é a única forma de garantir que a
 * hora exibida é EXATAMENTE a que está gravada — que é o requisito inegociável
 * do pedido ("refletir exatamente os dados").
 */
function escreverLinhaFuncionario(ws: Worksheet, linha: number, l: LinhaRelatorio, exigeMeio: boolean) {
  const status = statusDaLinha(l, exigeMeio)
  const justificativas = [l.entrada?.justificativa, l.meio?.justificativa, l.fim?.justificativa]
    .filter((j): j is string => !!j)
  // Repetida (ex.: mesma frase gerada automaticamente pro meio e pro fim) só entra uma vez.
  const justificativaTexto = [...new Set(justificativas)].join(' | ')

  const valores: (string | number | Date | null)[] = [
    l.nome,
    l.cpf ? formatCpf(l.cpf) : '',
    l.cargo,
    l.supervisorNome ?? '',
    l.dataRef ? dataRefParaExcel(l.dataRef) : null,
    l.entrada ? formatarBR(l.entrada.horaISO, 'hora') : '',
    l.meio ? formatarBR(l.meio.horaISO, 'hora') : '',
    l.fim ? formatarBR(l.fim.horaISO, 'hora') : '',
    l.entrada?.metodo ?? '',
    l.meio?.metodo ?? '',
    l.fim?.metodo ?? '',
    status,
    justificativaTexto,
    '', // Observações — não existe fonte de dado própria hoje; ver comentário no topo do arquivo.
  ]

  valores.forEach((v, i) => {
    const cel = ws.getCell(linha, i + 1)
    cel.value = v
    cel.border = BORDA_CELULA
    cel.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center', wrapText: i === 12 };
    if (i === 4 && v instanceof Date) cel.numFmt = 'dd/mm/yyyy'
    if (i === 0) cel.font = { color: { argb: COR_TEXTO } }
  })

  aplicarCorDoStatus(ws.getCell(linha, 12), status)
}

function aplicarCorDoStatus(cel: Cell, status: string) {
  const cores = COR_STATUS[status]
  if (!cores) return
  cel.font = { bold: true, color: { argb: cores.texto }, size: 10 }
  cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cores.fundo } }
}

// ════════════════════════════════════════════════════════════════════════
// MONTAGEM DAS ABAS
// ════════════════════════════════════════════════════════════════════════

/**
 * Ordena por status (quem falta conferir primeiro) e, dentro do mesmo
 * status, por nome — facilita a conferência operacional do fechamento sem
 * perder a busca alfabética dentro de cada grupo.
 */
const ORDEM_STATUS = ['Não compareceu', 'Sem entrada', 'Sem meio', 'Sem saída', 'Completo']
function ordenarLinhas(linhas: LinhaRelatorio[], exigeMeio: boolean): LinhaRelatorio[] {
  return [...linhas].sort((a, b) => {
    const sa = ORDEM_STATUS.indexOf(statusDaLinha(a, exigeMeio))
    const sb = ORDEM_STATUS.indexOf(statusDaLinha(b, exigeMeio))
    return sa - sb || a.nome.localeCompare(b.nome, 'pt-BR') || (a.dataRef ?? '').localeCompare(b.dataRef ?? '')
  })
}

/**
 * Escreve a aba de UM setor — título, informações, resumo e a tabela
 * completa. Mesma função para o "relatório do setor" avulso e para cada aba
 * do "relatório completo" (seções 2 e 5 do pedido descrevem o mesmo
 * conteúdo; nunca fazia sentido ter duas implementações que pudessem
 * divergir do que uma pessoa vê dependendo de qual botão ela clicou).
 */
function escreverAbaSetor(ws: Worksheet, evento: DadosRelatorioEvento, setor: SetorRelatorio) {
  ws.columns = COLUNAS_TABELA.map(c => ({ width: c.largura }))

  let linha = 1
  escreverTitulo(ws, linha++, `RELATÓRIO — ${setor.nome.toUpperCase()}`)
  linha++
  escreverInfo(ws, linha++, 'Evento:', evento.eventoNome)
  if (evento.organizacaoNome) escreverInfo(ws, linha++, 'Organização:', evento.organizacaoNome)
  escreverInfo(ws, linha++, 'Supervisor:', setor.supervisorNome ?? 'Não atribuído')

  const dias = [...new Set(setor.linhas.map(l => l.dataRef).filter((d): d is string => !!d))].sort()
  if (dias.length > 1) {
    escreverInfo(ws, linha++, 'Dias com registro:', `${dias.length} dias (${dias.map(d => formatarBR(dataRefParaExcel(d)?.toISOString() ?? null, 'data')).join(', ')})`)
  }
  linha++

  const resumo = calcularResumoSetor(setor)
  escreverInfo(ws, linha++, 'Resumo:', '')
  linha = escreverResumo(ws, linha, [
    { rotulo: 'Total de pessoas', valor: resumo.totalPessoas },
    { rotulo: 'Entradas registradas', valor: resumo.comEntrada },
    { rotulo: 'Meios registrados', valor: resumo.comMeio },
    { rotulo: 'Saídas registradas', valor: resumo.comSaida },
    { rotulo: 'Não registraram entrada', valor: resumo.semEntrada },
    { rotulo: 'Não registraram saída', valor: resumo.semSaida },
    { rotulo: 'Registros assistidos', valor: resumo.registrosAssistidos },
    { rotulo: 'Registros via QR Code', valor: resumo.registrosQrCode },
  ])
  linha += 1

  const linhaCabecalho = linha
  escreverCabecalhoTabela(ws, linhaCabecalho)
  linha++

  const ordenadas = ordenarLinhas(setor.linhas, setor.exigeMeio)
  for (const l of ordenadas) {
    escreverLinhaFuncionario(ws, linha, l, setor.exigeMeio)
    linha++
  }

  // Congela tudo ATÉ o cabeçalho da tabela: rolando pra baixo, nome da
  // pessoa e cabeçalho das colunas continuam visíveis — é o que faz
  // conferir uma lista de centenas de linhas ser viável na tela.
  ws.views = [{ state: 'frozen', ySplit: linhaCabecalho }]
  if (ordenadas.length) {
    ws.autoFilter = {
      from: { row: linhaCabecalho, column: 1 },
      to: { row: linhaCabecalho + ordenadas.length, column: N_COLUNAS },
    }
  }
}

/**
 * A aba "Resumo Geral" — primeira do relatório completo. Informações do
 * evento, uma linha por setor e o total geral somado.
 */
function escreverAbaResumoGeral(ws: Worksheet, dados: DadosRelatorioEvento) {
  const colunas = [
    { titulo: 'Setor', largura: 26 },
    { titulo: 'Pessoas', largura: 12 },
    { titulo: 'Entradas', largura: 12 },
    { titulo: 'Meios', largura: 12 },
    { titulo: 'Saídas', largura: 12 },
    { titulo: 'Não entraram', largura: 14 },
    { titulo: 'Não saíram', largura: 14 },
    { titulo: '% presença', largura: 12 },
  ]
  ws.columns = colunas.map(c => ({ width: c.largura }))
  const nCol = colunas.length

  let linha = 1
  ws.mergeCells(linha, 1, linha, nCol)
  const titulo = ws.getCell(linha, 1)
  titulo.value = `RELATÓRIO GERAL — ${dados.eventoNome.toUpperCase()}`
  titulo.font = { bold: true, size: 16, color: { argb: BRANCO } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_MARCA } }
  titulo.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(linha).height = 30
  linha += 2

  const infoLinha = (rotulo: string, valor: string) => {
    const rot = ws.getCell(linha, 1)
    rot.value = rotulo
    rot.font = { bold: true, color: { argb: COR_TEXTO } }
    ws.mergeCells(linha, 2, linha, nCol)
    const val = ws.getCell(linha, 2)
    val.value = valor
    val.font = { color: { argb: COR_TEXTO } }
    linha++
  }

  infoLinha('Evento:', dados.eventoNome)
  if (dados.organizacaoNome) infoLinha('Organização:', dados.organizacaoNome)
  if (dados.local) infoLinha('Local:', dados.local)
  infoLinha('Data de início:', formatarBR(dados.dataInicioISO, 'data'))
  infoLinha('Data de término:', formatarBR(dados.dataFimISO, 'data'))
  infoLinha('Total de setores:', String(dados.setores.length))
  infoLinha('Total de funcionários:', String(dados.setores.reduce((acc, s) => acc + calcularResumoSetor(s).totalPessoas, 0)))
  linha++

  const linhaCabecalho = linha
  colunas.forEach((c, i) => {
    const cel = ws.getCell(linhaCabecalho, i + 1)
    cel.value = c.titulo
    cel.font = { bold: true, color: { argb: BRANCO }, size: 11 }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ACENTO } }
    cel.alignment = { vertical: 'middle', horizontal: 'center' }
    cel.border = BORDA_CELULA
  })
  ws.getRow(linhaCabecalho).height = 24
  linha++

  const totais = { pessoas: 0, entradas: 0, meios: 0, saidas: 0, naoEntraram: 0, naoSairam: 0 }
  const ordenadosPorNome = [...dados.setores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  for (const setor of ordenadosPorNome) {
    const r = calcularResumoSetor(setor)
    totais.pessoas += r.totalPessoas
    totais.entradas += r.comEntrada
    totais.meios += r.comMeio
    totais.saidas += r.comSaida
    totais.naoEntraram += r.semEntrada
    totais.naoSairam += r.semSaida

    const valores = [setor.nome, r.totalPessoas, r.comEntrada, r.comMeio, r.comSaida, r.semEntrada, r.semSaida, r.percentualPresenca]
    valores.forEach((v, i) => {
      const cel = ws.getCell(linha, i + 1)
      cel.value = v
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' }
      if (i === 7) cel.numFmt = '0.0%'
    })
    linha++
  }

  // TOTAL GERAL — destacado, somando as colunas numéricas.
  const linhaTotal = linha
  const percentualGeral = totais.pessoas ? totais.entradas / totais.pessoas : 0
  const valoresTotal = ['TOTAL GERAL', totais.pessoas, totais.entradas, totais.meios, totais.saidas, totais.naoEntraram, totais.naoSairam, percentualGeral]
  valoresTotal.forEach((v, i) => {
    const cel = ws.getCell(linhaTotal, i + 1)
    cel.value = v
    cel.font = { bold: true, color: { argb: COR_MARCA } }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } }
    cel.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' }
    cel.border = BORDA_CELULA
    if (i === 7) cel.numFmt = '0.0%'
  })
  ws.getRow(linhaTotal).height = 22

  ws.views = [{ state: 'frozen', ySplit: linhaCabecalho }]
  if (ordenadosPorNome.length) {
    ws.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: linhaCabecalho + ordenadosPorNome.length - 1, column: nCol } }
  }
}

// ════════════════════════════════════════════════════════════════════════
// NOMES DE ARQUIVO E DE ABA
// ════════════════════════════════════════════════════════════════════════

/** Tira acento/pontuação problemática pro nome de arquivo — mesmo em qualquer SO. */
function nomeArquivoSeguro(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
}

function nomeDoArquivo(eventoNome: string, sufixo: string): string {
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).replace(/\//g, '-')
  return `CredenciAI_Relatorio_${nomeArquivoSeguro(eventoNome)}${sufixo ? '_' + nomeArquivoSeguro(sufixo) : ''}_${hoje}.xlsx`
}

/**
 * Nome de aba válido pro Excel: até 31 caracteres, sem `\ / ? * [ ] :`, e
 * sem repetir um nome já usado nesta planilha (setor com nome muito
 * parecido de outro, truncado, poderia colidir).
 */
function nomeDaAba(nomeSetor: string, usados: Set<string>): string {
  const base = nomeSetor.replace(/[\\/?*[\]:]/g, '').trim().slice(0, 31) || 'Setor'
  if (!usados.has(base)) { usados.add(base); return base }
  for (let n = 2; n < 100; n++) {
    const sufixo = ` (${n})`
    const tentativa = base.slice(0, 31 - sufixo.length) + sufixo
    if (!usados.has(tentativa)) { usados.add(tentativa); return tentativa }
  }
  const fallback = `${base.slice(0, 25)}-${Date.now() % 10000}`
  usados.add(fallback)
  return fallback
}

// ════════════════════════════════════════════════════════════════════════
// GERAÇÃO E DOWNLOAD
// ════════════════════════════════════════════════════════════════════════

/** Serializa e dispara o download — sem tocar em disco, sem rota de servidor. */
async function baixarWorkbook(wb: Workbook, nomeArquivo: string) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** `exceljs` só entra aqui, por import dinâmico — é o único ponto do arquivo que precisa do módulo em runtime. */
async function novaPlanilha(): Promise<Workbook> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Credenciei'
  wb.created = new Date()
  return wb
}

/** Relatório de UM setor (seção 2 do pedido) — baixa direto no navegador. */
export async function gerarRelatorioSetor(dados: DadosRelatorioEvento): Promise<void> {
  const setor = dados.setores[0]
  if (!setor) return
  const wb = await novaPlanilha()
  const ws = wb.addWorksheet(nomeDaAba(setor.nome, new Set()))
  escreverAbaSetor(ws, dados, setor)
  await baixarWorkbook(wb, nomeDoArquivo(dados.eventoNome, setor.nome))
}

/** Relatório completo do evento (seções 3/4 do pedido): Resumo Geral + uma aba por setor. */
export async function gerarRelatorioCompleto(dados: DadosRelatorioEvento): Promise<void> {
  const wb = await novaPlanilha()

  const resumoWs = wb.addWorksheet('Resumo Geral')
  escreverAbaResumoGeral(resumoWs, dados)

  const usados = new Set<string>(['Resumo Geral'])
  const ordenados = [...dados.setores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  for (const setor of ordenados) {
    const ws = wb.addWorksheet(nomeDaAba(setor.nome, usados))
    escreverAbaSetor(ws, dados, setor)
  }

  await baixarWorkbook(wb, nomeDoArquivo(dados.eventoNome, 'Completo'))
}
