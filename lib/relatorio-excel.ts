/**
 * Geração do relatório de credenciamento em .xlsx, no navegador.
 *
 * Roda no cliente, mesmo padrão de `lib/planilha.ts` (a exportação de equipe
 * que já existe): o servidor só busca e valida acesso aos dados
 * (`lib/relatorios.ts`); quem monta e baixa o arquivo é o browser. `exceljs`
 * entra por import dinâmico porque é pesado e só serve a este caminho.
 *
 * ─── ESTRUTURA × FORMATAÇÃO ──────────────────────────────────────────────
 *
 * As funções ficam separadas em duas metades nomeadas, de propósito: as que
 * decidem O QUE vai em cada célula (dados) e as que decidem a APARÊNCIA
 * (cor, borda, largura). Mexer só na formatação nunca deveria arriscar mudar
 * um número, e vice-versa.
 *
 * ─── SÓ SEIS PERGUNTAS ────────────────────────────────────────────────────
 *
 * Reescrito a pedido do Juan depois que a primeira versão (com meio, método
 * de cada batida, status e justificativa) "ficou muito poluída". A régua
 * agora: cada coluna que sobrevive precisa responder uma das oito perguntas
 * que ele listou — quem entrou, quem saiu, quando, em qual setor, em qual
 * função, quantos entraram, quantos saíram, qual período. Nada além disso.
 */
import type { DadosRelatorioEvento, SetorRelatorio, LinhaRelatorio, Periodo } from './relatorios'
import { formatarBR } from './tz'

// ════════════════════════════════════════════════════════════════════════
// CÁLCULO — números derivados dos dados reais, nunca inventados
// ════════════════════════════════════════════════════════════════════════

export type ResumoFuncao = { funcao: string; entradas: number; saidas: number }

/**
 * Quantos credenciamentos de entrada e de saída aconteceram, por função,
 * dentro do setor — contando BATIDAS (não pessoas): num período de vários
 * dias, quem trabalhou três dias credencia três entradas, e é exatamente
 * isso que "quantidade credenciada" precisa responder pro gestor fechar a
 * operação do período.
 */
export function calcularResumoPorFuncao(setor: SetorRelatorio): ResumoFuncao[] {
  const porFuncao = new Map<string, { entradas: number; saidas: number }>()
  for (const l of setor.linhas) {
    const chave = l.funcao || '—'
    const acc = porFuncao.get(chave) ?? { entradas: 0, saidas: 0 }
    if (l.entradaISO) acc.entradas++
    if (l.saidaISO) acc.saidas++
    porFuncao.set(chave, acc)
  }
  return [...porFuncao.entries()]
    .map(([funcao, v]) => ({ funcao, ...v }))
    .sort((a, b) => a.funcao.localeCompare(b.funcao, 'pt-BR'))
}

// ════════════════════════════════════════════════════════════════════════
// APARÊNCIA — mesma identidade visual de antes, com menos elementos
// ════════════════════════════════════════════════════════════════════════

/** A cor de marca do Credenciei (`--color-marca` do sistema), em ARGB. */
const COR_MARCA = 'FF4940DF'
const COR_ACENTO = 'FF6D46FF'
const COR_FAIXA_CLARA = 'FFF1EDFF'
const COR_BORDA = 'FFDCDFE8'
const COR_TEXTO = 'FF1E2028'
const BRANCO = 'FFFFFFFF'

const bordaFina = { style: 'thin' as const, color: { argb: COR_BORDA } }
const BORDA_CELULA = { top: bordaFina, left: bordaFina, bottom: bordaFina, right: bordaFina }

const COLUNAS_TABELA_SETOR = [
  { titulo: 'Data', largura: 12 },
  { titulo: 'Função', largura: 22 },
  { titulo: 'Nome', largura: 30 },
  { titulo: 'Entrada', largura: 12 },
  { titulo: 'Saída', largura: 12 },
] as const

const COLUNAS_RESUMO_GERAL = [
  { titulo: 'Setor', largura: 26 },
  { titulo: 'Função', largura: 22 },
  { titulo: 'Entradas', largura: 12 },
  { titulo: 'Saídas', largura: 12 },
] as const

/** Título de seção: faixa colorida, mesclada, texto branco em negrito. */
function escreverTitulo(ws: import('exceljs').Worksheet, linha: number, texto: string, nCol: number) {
  ws.mergeCells(linha, 1, linha, nCol)
  const cel = ws.getCell(linha, 1)
  cel.value = texto
  cel.font = { bold: true, size: 14, color: { argb: BRANCO } }
  cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_MARCA } }
  cel.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(linha).height = 26
}

/** Uma linha "Rótulo: valor" — rótulo em negrito, sem quebrar a leitura. */
function escreverInfo(ws: import('exceljs').Worksheet, linha: number, rotulo: string, valor: string, nCol: number) {
  const rot = ws.getCell(linha, 1)
  rot.value = rotulo
  rot.font = { bold: true, color: { argb: COR_TEXTO } }
  ws.mergeCells(linha, 2, linha, nCol)
  const val = ws.getCell(linha, 2)
  val.value = valor
  val.font = { color: { argb: COR_TEXTO } }
}

function textoPeriodo(periodo: Periodo): string {
  const de = formatarBR(dataRefParaISO(periodo.de), 'data')
  const ate = formatarBR(dataRefParaISO(periodo.ate), 'data')
  return periodo.de === periodo.ate ? de : `${de} a ${ate}`
}

/** "2026-09-05" → Date do dia certo, sem risco de fuso: montada em UTC direto pelas partes. */
function dataRefParaExcel(dataRef: string): Date | null {
  const m = dataRef.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
}

/** Mesma data, como ISO meio-dia — só pra reaproveitar `formatarBR`, que espera um instante. */
function dataRefParaISO(dataRef: string): string {
  return `${dataRef}T12:00:00-03:00`
}

function escreverCabecalho(ws: import('exceljs').Worksheet, linha: number, colunas: readonly { titulo: string }[]) {
  colunas.forEach((c, i) => {
    const cel = ws.getCell(linha, i + 1)
    cel.value = c.titulo
    cel.font = { bold: true, color: { argb: BRANCO }, size: 10 }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ACENTO } }
    cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cel.border = BORDA_CELULA
  })
  ws.getRow(linha).height = 26
}

// ════════════════════════════════════════════════════════════════════════
// MONTAGEM DAS ABAS
// ════════════════════════════════════════════════════════════════════════

function ordenarLinhas(linhas: LinhaRelatorio[]): LinhaRelatorio[] {
  return [...linhas].sort((a, b) =>
    a.funcao.localeCompare(b.funcao, 'pt-BR') ||
    a.nome.localeCompare(b.nome, 'pt-BR') ||
    a.dataRef.localeCompare(b.dataRef)
  )
}

/**
 * Escreve a aba de UM setor: título, informações, resumo por função e a
 * tabela detalhada. Mesma função para o "relatório do setor" avulso e para
 * cada aba do "relatório completo" — os dois sempre mostram exatamente a
 * mesma coisa, nunca duas versões que podem divergir.
 */
function escreverAbaSetor(ws: import('exceljs').Worksheet, evento: DadosRelatorioEvento, setor: SetorRelatorio) {
  const nCol = COLUNAS_TABELA_SETOR.length
  ws.columns = COLUNAS_TABELA_SETOR.map(c => ({ width: c.largura }))

  let linha = 1
  escreverTitulo(ws, linha++, `RELATÓRIO — ${setor.nome.toUpperCase()}`, nCol)
  linha++
  escreverInfo(ws, linha++, 'Evento:', evento.eventoNome, nCol)
  if (evento.organizacaoNome) escreverInfo(ws, linha++, 'Organização:', evento.organizacaoNome, nCol)
  escreverInfo(ws, linha++, 'Período analisado:', textoPeriodo(evento.periodo), nCol)
  linha++

  // Resumo por função: Função | Entradas | Saídas.
  const resumo = calcularResumoPorFuncao(setor)
  const linhaResumoCab = linha
  ;['Função', 'Entradas', 'Saídas'].forEach((titulo, i) => {
    const cel = ws.getCell(linhaResumoCab, i + 1)
    cel.value = titulo
    cel.font = { bold: true, color: { argb: BRANCO }, size: 10 }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ACENTO } }
    cel.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' }
    cel.border = BORDA_CELULA
  })
  linha++
  for (const r of resumo) {
    ws.getCell(linha, 1).value = r.funcao
    ws.getCell(linha, 2).value = r.entradas
    ws.getCell(linha, 3).value = r.saidas
    for (let c = 1; c <= 3; c++) {
      const cel = ws.getCell(linha, c)
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: c === 1 ? 'left' : 'center' }
    }
    linha++
  }
  if (!resumo.length) { ws.getCell(linha, 1).value = 'Nenhum credenciamento no período.'; linha++ }
  linha++

  // Tabela detalhada: Data | Função | Nome | Entrada | Saída.
  const linhaCabecalho = linha
  escreverCabecalho(ws, linhaCabecalho, COLUNAS_TABELA_SETOR)
  linha++

  const ordenadas = ordenarLinhas(setor.linhas)
  for (const l of ordenadas) {
    const valores: (string | number | Date | null)[] = [
      dataRefParaExcel(l.dataRef),
      l.funcao,
      l.nome,
      l.entradaISO ? formatarBR(l.entradaISO, 'hora') : '',
      l.saidaISO ? formatarBR(l.saidaISO, 'hora') : '',
    ]
    valores.forEach((v, i) => {
      const cel = ws.getCell(linha, i + 1)
      cel.value = v
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: i === 2 ? 'left' : 'center' }
      if (i === 0 && v instanceof Date) cel.numFmt = 'dd/mm/yyyy'
    })
    linha++
  }

  // Congela até o cabeçalho da tabela — rolando, a pessoa não perde de vista
  // o que cada coluna significa nem o resumo acima.
  ws.views = [{ state: 'frozen', ySplit: linhaCabecalho }]
  if (ordenadas.length) {
    ws.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: linhaCabecalho + ordenadas.length, column: nCol } }
  }
}

/** A aba "Resumo Geral" do relatório completo: Setor | Função | Entradas | Saídas + total. */
function escreverAbaResumoGeral(ws: import('exceljs').Worksheet, dados: DadosRelatorioEvento) {
  const nCol = COLUNAS_RESUMO_GERAL.length
  ws.columns = COLUNAS_RESUMO_GERAL.map(c => ({ width: c.largura }))

  let linha = 1
  escreverTitulo(ws, linha++, `RELATÓRIO GERAL — ${dados.eventoNome.toUpperCase()}`, nCol)
  linha++
  escreverInfo(ws, linha++, 'Evento:', dados.eventoNome, nCol)
  if (dados.organizacaoNome) escreverInfo(ws, linha++, 'Organização:', dados.organizacaoNome, nCol)
  escreverInfo(ws, linha++, 'Período analisado:', textoPeriodo(dados.periodo), nCol)
  escreverInfo(ws, linha++, 'Total de setores:', String(dados.setores.length), nCol)
  linha++

  const linhaCabecalho = linha
  escreverCabecalho(ws, linhaCabecalho, COLUNAS_RESUMO_GERAL)
  linha++

  let totalEntradas = 0, totalSaidas = 0, linhasEscritas = 0
  const ordenados = [...dados.setores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  for (const setor of ordenados) {
    for (const r of calcularResumoPorFuncao(setor)) {
      const valores = [setor.nome, r.funcao, r.entradas, r.saidas]
      valores.forEach((v, i) => {
        const cel = ws.getCell(linha, i + 1)
        cel.value = v
        cel.border = BORDA_CELULA
        cel.alignment = { vertical: 'middle', horizontal: i < 2 ? 'left' : 'center' }
      })
      totalEntradas += r.entradas
      totalSaidas += r.saidas
      linhasEscritas++
      linha++
    }
  }

  const linhaTotal = linha
  const valoresTotal = ['TOTAL GERAL', '', totalEntradas, totalSaidas]
  valoresTotal.forEach((v, i) => {
    const cel = ws.getCell(linhaTotal, i + 1)
    cel.value = v
    cel.font = { bold: true, color: { argb: COR_MARCA } }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } }
    cel.alignment = { vertical: 'middle', horizontal: i < 2 ? 'left' : 'center' }
    cel.border = BORDA_CELULA
  })
  ws.mergeCells(linhaTotal, 1, linhaTotal, 2)
  ws.getRow(linhaTotal).height = 22

  ws.views = [{ state: 'frozen', ySplit: linhaCabecalho }]
  if (linhasEscritas) {
    ws.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: linhaCabecalho + linhasEscritas, column: nCol } }
  }
}

// ════════════════════════════════════════════════════════════════════════
// NOMES DE ARQUIVO E DE ABA
// ════════════════════════════════════════════════════════════════════════

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

/** Nome de aba válido pro Excel: até 31 caracteres, sem `\ / ? * [ ] :`, sem repetir. */
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

async function baixarWorkbook(wb: import('exceljs').Workbook, nomeArquivo: string) {
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
async function novaPlanilha(): Promise<import('exceljs').Workbook> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Credenciei'
  wb.created = new Date()
  return wb
}

/** Relatório de UM setor — baixa direto no navegador. */
export async function gerarRelatorioSetor(dados: DadosRelatorioEvento): Promise<void> {
  const setor = dados.setores[0]
  if (!setor) return
  const wb = await novaPlanilha()
  const ws = wb.addWorksheet(nomeDaAba(setor.nome, new Set()))
  escreverAbaSetor(ws, dados, setor)
  await baixarWorkbook(wb, nomeDoArquivo(dados.eventoNome, setor.nome))
}

/** Relatório completo do evento: Resumo Geral + uma aba por setor. */
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
