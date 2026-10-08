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
import type { DadosRelatorioEvento, SetorRelatorio, LinhaRelatorio, Periodo, DadosRelatorioSubevento, SetorDoSubevento, PessoaDoSubevento, SituacaoNoRelatorio } from './relatorios'
import { formatarBR } from './tz'
import { COR_MARCA, COR_ACENTO, COR_FAIXA_CLARA, COR_TEXTO, BRANCO, BORDA_CELULA, carregarLogoBuffer, adicionarLogoNaAba } from './marca-relatorio'

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

const COLUNAS_TABELA_SETOR = [
  { titulo: 'Data', largura: 12 },
  { titulo: 'Função', largura: 22 },
  { titulo: 'Nome', largura: 30 },
  { titulo: 'Entrada', largura: 12 },
  { titulo: 'Saída', largura: 12 },
] as const

const COLUNAS_RESUMO_GERAL = [
  { titulo: 'Fornecedor', largura: 26 },
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
function escreverAbaSetor(
  wb: import('exceljs').Workbook, ws: import('exceljs').Worksheet, bufferLogo: ArrayBuffer | null,
  evento: DadosRelatorioEvento, setor: SetorRelatorio,
) {
  const nCol = COLUNAS_TABELA_SETOR.length
  ws.columns = COLUNAS_TABELA_SETOR.map(c => ({ width: c.largura }))

  adicionarLogoNaAba(wb, ws, bufferLogo)
  let linha = 2
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
function escreverAbaResumoGeral(
  wb: import('exceljs').Workbook, ws: import('exceljs').Worksheet, bufferLogo: ArrayBuffer | null, dados: DadosRelatorioEvento,
) {
  const nCol = COLUNAS_RESUMO_GERAL.length
  ws.columns = COLUNAS_RESUMO_GERAL.map(c => ({ width: c.largura }))

  adicionarLogoNaAba(wb, ws, bufferLogo)
  let linha = 2
  escreverTitulo(ws, linha++, `RELATÓRIO GERAL — ${dados.eventoNome.toUpperCase()}`, nCol)
  linha++
  escreverInfo(ws, linha++, 'Evento:', dados.eventoNome, nCol)
  if (dados.organizacaoNome) escreverInfo(ws, linha++, 'Organização:', dados.organizacaoNome, nCol)
  escreverInfo(ws, linha++, 'Período analisado:', textoPeriodo(dados.periodo), nCol)
  escreverInfo(ws, linha++, 'Total de fornecedores:', String(dados.setores.length), nCol)
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
  const base = nomeSetor.replace(/[\\/?*[\]:]/g, '').trim().slice(0, 31) || 'Fornecedor'
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

const COLUNAS_AUSENTES = [
  { titulo: 'Fornecedor', largura: 26 },
  { titulo: 'Função', largura: 22 },
  { titulo: 'Nome', largura: 30 },
] as const

/**
 * A aba do avesso: quem estava na equipe e NÃO bateu nada no período.
 *
 * Sem coluna de data, entrada ou saída — de propósito. A pergunta aqui é
 * "quem não apareceu", e uma coluna vazia em toda linha só faria quem lê
 * procurar um dado que, por definição, não existe.
 */
function escreverAbaAusentes(
  wb: import('exceljs').Workbook, ws: import('exceljs').Worksheet, bufferLogo: ArrayBuffer | null,
  evento: DadosRelatorioEvento, setores: SetorRelatorio[], titulo: string,
) {
  const nCol = COLUNAS_AUSENTES.length
  ws.columns = COLUNAS_AUSENTES.map(c => ({ width: c.largura }))

  adicionarLogoNaAba(wb, ws, bufferLogo)
  let linha = 2
  escreverTitulo(ws, linha++, titulo, nCol)
  linha++
  escreverInfo(ws, linha++, 'Evento:', evento.eventoNome, nCol)
  if (evento.organizacaoNome) escreverInfo(ws, linha++, 'Organização:', evento.organizacaoNome, nCol)
  escreverInfo(ws, linha++, 'Período analisado:', textoPeriodo(evento.periodo), nCol)

  const todos = setores.flatMap(s => s.ausentes)
  escreverInfo(ws, linha++, 'Sem nenhum registro:', `${todos.length} pessoa(s)`, nCol)
  linha++

  escreverCabecalho(ws, linha++, COLUNAS_AUSENTES)

  const ordenados = [...todos].sort((a, b) =>
    a.setor.localeCompare(b.setor, 'pt-BR') ||
    a.funcao.localeCompare(b.funcao, 'pt-BR') ||
    a.nome.localeCompare(b.nome, 'pt-BR'))

  for (const p of ordenados) {
    ws.getCell(linha, 1).value = p.setor
    ws.getCell(linha, 2).value = p.funcao
    ws.getCell(linha, 3).value = p.nome
    for (let c = 1; c <= nCol; c++) {
      const cel = ws.getCell(linha, c)
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: 'left' }
    }
    linha++
  }
  if (!ordenados.length) {
    ws.getCell(linha, 1).value = 'Todo mundo da equipe registrou pelo menos uma batida no período.'
  }
}

/**
 * Planilha de QUEM NÃO CREDENCIOU — o avesso do relatório normal.
 *
 * O relatório comum lista quem tem batida e omite quem não tem (é o que o
 * mantém enxuto). Só que "quem faltou" é a pergunta que sobra depois, e
 * hoje ela só tinha resposta subtraindo a planilha da lista da equipe na
 * mão. Pedido do Juan em 03/09/2026.
 */
export async function gerarRelatorioAusentes(dados: DadosRelatorioEvento): Promise<void> {
  const [wb, bufferLogo] = await Promise.all([novaPlanilha(), carregarLogoBuffer()])
  const umSetorSo = dados.setores.length === 1 ? dados.setores[0] : null
  const ws = wb.addWorksheet(nomeDaAba(umSetorSo ? umSetorSo.nome : 'Nao credenciaram', new Set()))
  escreverAbaAusentes(
    wb, ws, bufferLogo, dados, dados.setores,
    `NÃO CREDENCIARAM${umSetorSo ? ` — ${umSetorSo.nome.toUpperCase()}` : ''}`,
  )
  await baixarWorkbook(wb, nomeDoArquivo(dados.eventoNome, umSetorSo ? `${umSetorSo.nome}_nao_credenciaram` : 'Nao_credenciaram'))
}

/** Relatório de UM setor — baixa direto no navegador. */
export async function gerarRelatorioSetor(dados: DadosRelatorioEvento): Promise<void> {
  const setor = dados.setores[0]
  if (!setor) return
  const [wb, bufferLogo] = await Promise.all([novaPlanilha(), carregarLogoBuffer()])
  const ws = wb.addWorksheet(nomeDaAba(setor.nome, new Set()))
  escreverAbaSetor(wb, ws, bufferLogo, dados, setor)
  await baixarWorkbook(wb, nomeDoArquivo(dados.eventoNome, setor.nome))
}

/**
 * Um arquivo .xlsx POR SETOR, todos dentro de um .zip.
 *
 * Existe porque o relatório completo (uma aba por setor) serve pra quem
 * organiza, mas o que se manda pro fornecedor é só o setor dele — e mandar
 * 43 setores um a um pelo botão "Exportar setor" é meia hora de cliques.
 * Cada arquivo do zip é idêntico ao que "Exportar setor" geraria.
 */
export async function gerarRelatoriosPorSetorZip(
  dados: DadosRelatorioEvento,
  /* 'ausentes' gera o mesmo zip, mas com a planilha de quem NÃO bateu. */
  modo: 'credenciados' | 'ausentes' = 'credenciados',
): Promise<void> {
  const [{ default: JSZip }, bufferLogo] = await Promise.all([import('jszip'), carregarLogoBuffer()])
  const zip = new JSZip()
  const usados = new Set<string>()
  const ordenados = [...dados.setores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const sufixo = modo === 'ausentes' ? '_nao_credenciaram' : ''
  for (const setor of ordenados) {
    const wb = await novaPlanilha()
    const ws = wb.addWorksheet(nomeDaAba(setor.nome, new Set()))
    if (modo === 'ausentes') {
      escreverAbaAusentes(wb, ws, bufferLogo, dados, [setor], `NÃO CREDENCIARAM — ${setor.nome.toUpperCase()}`)
    } else {
      escreverAbaSetor(wb, ws, bufferLogo, dados, setor)
    }
    const buffer = await wb.xlsx.writeBuffer()
    // Dois setores com o mesmo nome não podem virar o mesmo arquivo.
    let nome = nomeDoArquivo(dados.eventoNome, `${setor.nome}${sufixo}`)
    for (let n = 2; usados.has(nome); n++) nome = nomeDoArquivo(dados.eventoNome, `${setor.nome}${sufixo} (${n})`)
    usados.add(nome)
    zip.file(nome, buffer)
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeDoArquivo(dados.eventoNome, modo === 'ausentes' ? 'Por_fornecedor_nao_credenciaram' : 'Por_fornecedor').replace(/\.xlsx$/, '.zip')
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Relatório completo do evento: Resumo Geral + uma aba por setor. */
export async function gerarRelatorioCompleto(dados: DadosRelatorioEvento): Promise<void> {
  const [wb, bufferLogo] = await Promise.all([novaPlanilha(), carregarLogoBuffer()])

  const resumoWs = wb.addWorksheet('Resumo Geral')
  escreverAbaResumoGeral(wb, resumoWs, bufferLogo, dados)

  const usados = new Set<string>(['Resumo Geral'])
  const ordenados = [...dados.setores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  for (const setor of ordenados) {
    const ws = wb.addWorksheet(nomeDaAba(setor.nome, usados))
    escreverAbaSetor(wb, ws, bufferLogo, dados, setor)
  }

  await baixarWorkbook(wb, nomeDoArquivo(dados.eventoNome, 'Completo'))
}


// ════════════════════════════════════════════════════════════════════════
// RELATÓRIO COMPLETO DO SUBEVENTO
// ════════════════════════════════════════════════════════════════════════
//
// Resumo Geral + Faltam aprovar + Equipe + Batidas + Supervisores + uma aba por fornecedor.
// Parte da EQUIPE CADASTRADA (não das batidas), então mostra quem ainda não foi aprovado.

const ROTULO_SITUACAO: Record<SituacaoNoRelatorio, string> = {
  autorizado: 'Autorizado',
  pre_autorizado: 'Pré-autorizado (falta aprovar)',
  negado: 'Negado',
  descredenciado: 'Descredenciado',
}

/** "2026-10-10" → "10/10". */
const diaCurto = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const listaDeDias = (dias: string[]) => dias.map(diaCurto).join(', ')
const nomesDosSupervisores = (s: SetorDoSubevento) => s.supervisores.map(x => x.nome).join(', ') || '—'
const horaDe = (iso: string | null) => (iso ? formatarBR(iso, 'hora') : '')

/** Uma tabela simples: cabeçalho, linhas com borda, filtro e primeira linha congelada. */
function escreverTabela(
  ws: import('exceljs').Worksheet, linhaCabecalho: number,
  colunas: readonly { titulo: string; largura: number; esquerda?: boolean }[],
  linhas: (string | number | null)[][],
  vazio: string,
) {
  escreverCabecalho(ws, linhaCabecalho, colunas)
  let linha = linhaCabecalho + 1
  for (const valores of linhas) {
    valores.forEach((v, i) => {
      const cel = ws.getCell(linha, i + 1)
      cel.value = v
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: colunas[i]?.esquerda ? 'left' : 'center', wrapText: colunas[i]?.esquerda }
    })
    linha++
  }
  if (!linhas.length) ws.getCell(linha, 1).value = vazio
  ws.views = [{ state: 'frozen', ySplit: linhaCabecalho }]
  if (linhas.length) ws.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: linhaCabecalho + linhas.length, column: colunas.length } }
}

function cabecalhoDaAba(
  wb: import('exceljs').Workbook, ws: import('exceljs').Worksheet, logo: ArrayBuffer | null,
  dados: DadosRelatorioSubevento, titulo: string, nCol: number, extras: [string, string][] = [],
): number {
  adicionarLogoNaAba(wb, ws, logo)
  let linha = 2
  escreverTitulo(ws, linha++, titulo, nCol)
  linha++
  escreverInfo(ws, linha++, 'Evento:', dados.eventoNome, nCol)
  escreverInfo(ws, linha++, 'Subevento:', dados.subeventoNome, nCol)
  if (dados.organizacaoNome) escreverInfo(ws, linha++, 'Organização:', dados.organizacaoNome, nCol)
  escreverInfo(ws, linha++, 'Período das batidas:', textoPeriodo(dados.periodo), nCol)
  for (const [r, v] of extras) escreverInfo(ws, linha++, r, v, nCol)
  return linha + 1
}

const COLUNAS_PESSOA = [
  { titulo: 'Nome', largura: 30, esquerda: true },
  { titulo: 'CPF', largura: 16 },
  { titulo: 'Telefone', largura: 17 },
  { titulo: 'Função', largura: 22, esquerda: true },
  { titulo: 'Situação', largura: 28 },
  { titulo: 'Dias que vai trabalhar', largura: 24, esquerda: true },
  { titulo: 'Entradas', largura: 10 },
  { titulo: 'Saídas', largura: 10 },
] as const

const contarBatidas = (p: PessoaDoSubevento) => ({
  entradas: p.batidas.filter(b => b.entradaISO).length,
  saidas: p.batidas.filter(b => b.saidaISO).length,
})
const diasDaPessoa = (p: PessoaDoSubevento) => listaDeDias(p.diasAprovados.length ? p.diasAprovados : p.diasSolicitados) || '—'

function linhaDaPessoa(p: PessoaDoSubevento): (string | number)[] {
  const c = contarBatidas(p)
  return [p.nome, p.cpf, p.telefone, p.funcao || '—', ROTULO_SITUACAO[p.situacao], diasDaPessoa(p), c.entradas, c.saidas]
}

/**
 * Monta a planilha do subevento (sem baixar). Separada de `gerarRelatorioSubevento` para o teste conseguir
 * montar o arquivo no Node, sem o navegador (o logo vem de fora: no teste, nenhum).
 */
export async function montarPlanilhaSubevento(dados: DadosRelatorioSubevento, logo: ArrayBuffer | null): Promise<import('exceljs').Workbook> {
  const wb = await novaPlanilha()
  const setores = [...dados.setores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const todas = setores.flatMap(s => s.pessoas.map(p => ({ s, p })))
  const conta = (sit: SituacaoNoRelatorio, lista = todas) => lista.filter(x => x.p.situacao === sit).length
  const entradas = todas.reduce((n, x) => n + contarBatidas(x.p).entradas, 0)
  const saidas = todas.reduce((n, x) => n + contarBatidas(x.p).saidas, 0)

  // ── 1) Resumo Geral ────────────────────────────────────────────────────
  {
    const colunas = [
      { titulo: 'Fornecedor', largura: 30, esquerda: true },
      { titulo: 'Supervisor(es)', largura: 30, esquerda: true },
      { titulo: 'Previsto', largura: 10 },
      { titulo: 'Cadastrados', largura: 13 },
      { titulo: 'Autorizados', largura: 13 },
      { titulo: 'Pré-autorizados (faltam aprovar)', largura: 20 },
      { titulo: 'Negados', largura: 10 },
      { titulo: 'Entradas', largura: 10 },
      { titulo: 'Saídas', largura: 10 },
    ] as const
    const ws = wb.addWorksheet('Resumo Geral')
    ws.columns = colunas.map(c => ({ width: c.largura }))
    const linhaInfo = cabecalhoDaAba(wb, ws, logo, dados, `RELATÓRIO DO SUBEVENTO — ${dados.subeventoNome.toUpperCase()}`, colunas.length, [
      ['Fornecedores:', String(setores.length)],
      ['Pessoas cadastradas:', String(todas.length)],
      ['Autorizadas:', String(conta('autorizado'))],
      ['Pré-autorizadas (falta aprovar):', String(conta('pre_autorizado'))],
      ['Negadas / descredenciadas:', `${conta('negado')} / ${conta('descredenciado')}`],
      ['Batidas no período:', `${entradas} entradas, ${saidas} saídas`],
    ])
    const linhas = setores.map(s => {
      const c = (sit: SituacaoNoRelatorio) => s.pessoas.filter(p => p.situacao === sit).length
      return [
        s.nome, nomesDosSupervisores(s), s.previsto ?? '—', s.pessoas.length, c('autorizado'), c('pre_autorizado'), c('negado') + c('descredenciado'),
        s.pessoas.reduce((n, p) => n + contarBatidas(p).entradas, 0), s.pessoas.reduce((n, p) => n + contarBatidas(p).saidas, 0),
      ]
    })
    linhas.push(['TOTAL', '', '', todas.length, conta('autorizado'), conta('pre_autorizado'), conta('negado') + conta('descredenciado'), entradas, saidas])
    escreverTabela(ws, linhaInfo, colunas, linhas, 'Este subevento ainda não tem fornecedores.')
    // Destaca a linha de total.
    const linhaTotal = linhaInfo + linhas.length
    for (let c = 1; c <= colunas.length; c++) { ws.getCell(linhaTotal, c).font = { bold: true }; ws.getCell(linhaTotal, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } } }
  }

  // ── 2) Faltam aprovar ──────────────────────────────────────────────────
  {
    const colunas = [
      { titulo: 'Fornecedor', largura: 28, esquerda: true },
      { titulo: 'Supervisor(es)', largura: 28, esquerda: true },
      { titulo: 'Nome', largura: 30, esquerda: true },
      { titulo: 'CPF', largura: 16 },
      { titulo: 'Telefone', largura: 17 },
      { titulo: 'Função', largura: 22, esquerda: true },
      { titulo: 'Dias que pediu', largura: 24, esquerda: true },
    ] as const
    const ws = wb.addWorksheet('Faltam aprovar')
    ws.columns = colunas.map(c => ({ width: c.largura }))
    const pendentes = todas.filter(x => x.p.situacao === 'pre_autorizado')
    const linhaInfo = cabecalhoDaAba(wb, ws, logo, dados, 'PRÉ-AUTORIZADOS — QUEM AINDA FALTA SER APROVADO', colunas.length, [['Total aguardando aprovação:', String(pendentes.length)]])
    escreverTabela(ws, linhaInfo, colunas, pendentes.map(({ s, p }) => [s.nome, nomesDosSupervisores(s), p.nome, p.cpf, p.telefone, p.funcao || '—', listaDeDias(p.diasSolicitados) || '—']),
      'Ninguém aguardando aprovação neste subevento.')
  }

  // ── 3) Equipe (todos) ──────────────────────────────────────────────────
  {
    const colunas = [{ titulo: 'Fornecedor', largura: 28, esquerda: true }, { titulo: 'Supervisor(es)', largura: 28, esquerda: true }, ...COLUNAS_PESSOA] as const
    const ws = wb.addWorksheet('Equipe')
    ws.columns = colunas.map(c => ({ width: c.largura }))
    const linhaInfo = cabecalhoDaAba(wb, ws, logo, dados, 'EQUIPE DO SUBEVENTO — TODOS OS FORNECEDORES', colunas.length, [['Pessoas:', String(todas.length)]])
    escreverTabela(ws, linhaInfo, colunas, todas.map(({ s, p }) => [s.nome, nomesDosSupervisores(s), ...linhaDaPessoa(p)]), 'Nenhuma pessoa cadastrada.')
  }

  // ── 4) Batidas ─────────────────────────────────────────────────────────
  {
    const colunas = [
      { titulo: 'Data', largura: 12 },
      { titulo: 'Fornecedor', largura: 28, esquerda: true },
      { titulo: 'Nome', largura: 30, esquerda: true },
      { titulo: 'Função', largura: 22, esquerda: true },
      { titulo: 'Situação', largura: 28 },
      { titulo: 'Entrada', largura: 11 },
      { titulo: 'Meio', largura: 11 },
      { titulo: 'Saída', largura: 11 },
    ] as const
    const ws = wb.addWorksheet('Batidas')
    ws.columns = colunas.map(c => ({ width: c.largura }))
    const linhas = todas
      .flatMap(({ s, p }) => p.batidas.map(b => ({ s, p, b })))
      .sort((a, b) => a.b.dia.localeCompare(b.b.dia) || a.s.nome.localeCompare(b.s.nome, 'pt-BR') || a.p.nome.localeCompare(b.p.nome, 'pt-BR'))
    const linhaInfo = cabecalhoDaAba(wb, ws, logo, dados, 'HORÁRIOS DAS BATIDAS', colunas.length, [['Batidas listadas:', String(linhas.length)]])
    escreverTabela(ws, linhaInfo, colunas, linhas.map(({ s, p, b }) => [diaCurto(b.dia), s.nome, p.nome, p.funcao || '—', ROTULO_SITUACAO[p.situacao], horaDe(b.entradaISO), horaDe(b.meioISO), horaDe(b.saidaISO)]),
      'Nenhuma batida no período.')
  }

  // ── 5) Supervisores ────────────────────────────────────────────────────
  {
    const colunas = [
      { titulo: 'Supervisor', largura: 30, esquerda: true },
      { titulo: 'Telefone', largura: 17 },
      { titulo: 'Fornecedores', largura: 40, esquerda: true },
      { titulo: 'Pessoas', largura: 10 },
      { titulo: 'Autorizadas', largura: 13 },
      { titulo: 'Pré-autorizadas', largura: 16 },
    ] as const
    const ws = wb.addWorksheet('Supervisores')
    ws.columns = colunas.map(c => ({ width: c.largura }))
    const porSupervisor = new Map<string, { telefone: string | null; setores: SetorDoSubevento[] }>()
    for (const s of setores) for (const sup of s.supervisores) {
      const acc = porSupervisor.get(sup.nome) ?? { telefone: sup.telefone, setores: [] }
      acc.setores.push(s)
      porSupervisor.set(sup.nome, acc)
    }
    const linhas = [...porSupervisor.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')).map(([nome, v]) => {
      const pessoas = v.setores.flatMap(s => s.pessoas)
      return [nome, v.telefone ?? '', v.setores.map(s => s.nome).join(', '), pessoas.length,
        pessoas.filter(p => p.situacao === 'autorizado').length, pessoas.filter(p => p.situacao === 'pre_autorizado').length]
    })
    const semSupervisor = setores.filter(s => !s.supervisores.length).map(s => s.nome)
    const linhaInfo = cabecalhoDaAba(wb, ws, logo, dados, 'SUPERVISORES DO SUBEVENTO', colunas.length,
      semSupervisor.length ? [['Fornecedores sem supervisor:', semSupervisor.join(', ')]] : [])
    escreverTabela(ws, linhaInfo, colunas, linhas, 'Nenhum supervisor ligado aos fornecedores deste subevento.')
  }

  // ── 6) Uma aba por fornecedor ──────────────────────────────────────────
  const usados = new Set<string>(['Resumo Geral', 'Faltam aprovar', 'Equipe', 'Batidas', 'Supervisores'])
  for (const s of setores) {
    const ws = wb.addWorksheet(nomeDaAba(s.nome, usados))
    ws.columns = COLUNAS_PESSOA.map(c => ({ width: c.largura }))
    const linhaInfo = cabecalhoDaAba(wb, ws, logo, dados, `FORNECEDOR — ${s.nome.toUpperCase()}`, COLUNAS_PESSOA.length, [
      ['Supervisor(es):', nomesDosSupervisores(s)],
      ['Previsto / cadastrados:', `${s.previsto ?? '—'} / ${s.pessoas.length}`],
      ['Autorizados / pré-autorizados:', `${s.pessoas.filter(p => p.situacao === 'autorizado').length} / ${s.pessoas.filter(p => p.situacao === 'pre_autorizado').length}`],
    ])
    escreverTabela(ws, linhaInfo, COLUNAS_PESSOA, s.pessoas.map(linhaDaPessoa), 'Nenhuma pessoa cadastrada neste fornecedor.')
  }

  return wb
}

/** Relatório completo de um subevento — baixa direto no navegador. */
export async function gerarRelatorioSubevento(dados: DadosRelatorioSubevento): Promise<void> {
  const wb = await montarPlanilhaSubevento(dados, await carregarLogoBuffer())
  await baixarWorkbook(wb, nomeDoArquivo(dados.eventoNome, `${dados.subeventoNome}_completo`))
}
