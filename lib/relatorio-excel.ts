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
 * ─── A PLANILHA QUE FECHA O PAGAMENTO (12–13/10/2026) ────────────────────
 *
 * A versão enxuta (só entrada e saída, pedido do Juan em 2025: "ficou muito
 * poluído") não fechava o pagamento do VITAL. Os sete itens aprovados em
 * 12/10/2026 e os dois de 13/10 entraram assim:
 *   - cada linha: data, DIA DA SEMANA, área (subgrupo), função, nome, CPF,
 *     entrada, MEIO, saída, HORAS (número de verdade, soma no Excel),
 *     situação (sem saída / sem meio em laranja, baixa em cinza), origem da
 *     batida (leitor/celular, Registrar ponto, lançada à mão) com quem lançou
 *     e o motivo, e o que foi batido fora do local (só com prova de GPS);
 *   - o resumo por função com pessoas, entradas, saídas, faltas e horas;
 *   - a aba "Pagamento": uma linha por pessoa (por CPF), com chave PIX,
 *     dias, diárias, horas, valor a receber e se já foi pago;
 *   - no completo, a aba "Todas as batidas" (a tabela de todos os
 *     fornecedores junta, pra filtrar sem abrir 100 abas).
 */
import type { DadosRelatorioEvento, SetorRelatorio, LinhaRelatorio, Periodo, DadosRelatorioSubevento, SetorDoSubevento, PessoaDoSubevento, SituacaoNoRelatorio, OrigemDaLinha } from './relatorios'
import { formatarBR } from './tz'
import { COR_MARCA, COR_ACENTO, COR_FAIXA_CLARA, COR_TEXTO, BRANCO, BORDA_CELULA, carregarLogoBuffer, adicionarLogoNaAba } from './marca-relatorio'

// ════════════════════════════════════════════════════════════════════════
// CÁLCULO — números derivados dos dados reais, nunca inventados
// ════════════════════════════════════════════════════════════════════════

const DIA_EM_MS = 86_400_000
const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/** "2026-10-10" → "Sábado" (pelo calendário, sem fuso: a data já é o dia de trabalho). */
export function diaDaSemana(dataRef: string): string {
  const m = dataRef.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? SEMANA[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()] : ''
}

/** Quanto tempo a linha durou (entrada → saída), em ms. Sem uma das duas, zero — nunca um horário inventado. */
export function duracaoDaLinha(l: LinhaRelatorio): number {
  if (!l.entradaISO || !l.saidaISO) return 0
  return Math.max(0, new Date(l.saidaISO).getTime() - new Date(l.entradaISO).getTime())
}

/** O que falta na linha (laranja) e se a pessoa está com baixa (cinza). */
export function situacaoDaLinha(l: LinhaRelatorio): { faltas: string[]; texto: string } {
  const faltas: string[] = []
  if (!l.entradaISO) faltas.push('Sem entrada')
  if (l.entradaISO && !l.saidaISO) faltas.push('Sem saída')
  if (l.semMeio) faltas.push('Sem meio')
  const partes = [...faltas]
  if (l.baixaEm) partes.push(`Baixa em ${formatarBR(l.baixaEm, 'data')}`)
  return { faltas, texto: partes.join(' · ') || 'OK' }
}

const ROTULO_ORIGEM: Record<OrigemDaLinha, string> = {
  normal: 'Leitor / celular',
  registrar: 'Registrar ponto',
  manual: 'Lançada à mão',
}

export type ResumoFuncao = {
  funcao: string; pessoas: number; entradas: number; saidas: number; semSaida: number; semMeio: number; horasMs: number
}

/**
 * Por função, dentro do setor: pessoas, entradas e saídas (BATIDAS, não pessoas — quem trabalhou três dias credencia
 * três entradas, e é isso que "quantidade credenciada" precisa responder pro gestor fechar o período), o que falta e
 * as horas.
 */
export function calcularResumoPorFuncao(setor: SetorRelatorio): ResumoFuncao[] {
  const porFuncao = new Map<string, ResumoFuncao & { ids: Set<string> }>()
  for (const l of setor.linhas) {
    const chave = l.funcao || '—'
    const acc = porFuncao.get(chave) ?? { funcao: chave, pessoas: 0, entradas: 0, saidas: 0, semSaida: 0, semMeio: 0, horasMs: 0, ids: new Set<string>() }
    acc.ids.add(l.funcionarioId)
    if (l.entradaISO) acc.entradas++
    if (l.saidaISO) acc.saidas++
    if (l.entradaISO && !l.saidaISO) acc.semSaida++
    if (l.semMeio) acc.semMeio++
    acc.horasMs += duracaoDaLinha(l)
    porFuncao.set(chave, acc)
  }
  return [...porFuncao.values()]
    .map(({ ids, ...r }) => ({ ...r, pessoas: ids.size }))
    .sort((a, b) => a.funcao.localeCompare(b.funcao, 'pt-BR'))
}

/** Uma linha da aba "Pagamento": a pessoa (por CPF), somando todas as linhas dela em todos os fornecedores do arquivo. */
export type LinhaPagamento = {
  nome: string; cpf: string | null; chavePix: string | null; fornecedores: string[]; areas: string[]; funcoes: string[]
  dias: string[]; diarias: number; horasMs: number; semSaida: number; semMeio: number
  valorReceber: number | null; pago: boolean | 'parcial'; pagoEm: string | null; baixaEm: string | null
  /**
   * Os dias trabalhados EM CADA equipe, na ordem dos dias (pedido do Juan, 18/10/2026: "uma pessoa que trabalhou numa
   * equipe um dia e em outra equipe em outro — preciso que isso tenha no relatório dela"). Com uma equipe só, é uma linha.
   */
  diasPorFornecedor: { fornecedor: string; dias: string[] }[]
}

/**
 * Uma linha por pessoa que trabalhou no período. A chave é o CPF: quem está em mais de um fornecedor (o supervisor de
 * vários setores) aparece UMA vez, porque é um pagamento só. Quem não bateu nada no período não entra (está em
 * "Quem NÃO credenciou").
 */
export function montarLinhasPagamento(setores: SetorRelatorio[]): LinhaPagamento[] {
  const porPessoa = new Map<string, LinhaPagamento & { ids: Set<string>; pagos: number }>()
  const cadastro = new Map(setores.flatMap(s => (s.pessoas ?? []).map(p => [p.funcionarioId, p] as const)))
  for (const s of setores) {
    for (const l of s.linhas) {
      const cpf = (l.cpf ?? '').replace(/\D/g, '')
      const chave = cpf || l.funcionarioId
      const acc = porPessoa.get(chave) ?? {
        nome: l.nome, cpf: l.cpf ?? null, chavePix: null, fornecedores: [], areas: [], funcoes: [], dias: [], diarias: 0, horasMs: 0,
        semSaida: 0, semMeio: 0, valorReceber: null, pago: false, pagoEm: null, baixaEm: null, diasPorFornecedor: [], ids: new Set<string>(), pagos: 0,
      }
      if (!acc.fornecedores.includes(s.nome)) acc.fornecedores.push(s.nome)
      if (s.area && !acc.areas.includes(s.area)) acc.areas.push(s.area)
      if (l.funcao && !acc.funcoes.includes(l.funcao)) acc.funcoes.push(l.funcao)
      if (l.entradaISO) {
        acc.diarias++
        if (!acc.dias.includes(l.dataRef)) acc.dias.push(l.dataRef)
        const naEquipe = acc.diasPorFornecedor.find(e => e.fornecedor === s.nome)
        if (!naEquipe) acc.diasPorFornecedor.push({ fornecedor: s.nome, dias: [l.dataRef] })
        else if (!naEquipe.dias.includes(l.dataRef)) naEquipe.dias.push(l.dataRef)
      }
      acc.horasMs += duracaoDaLinha(l)
      if (l.entradaISO && !l.saidaISO) acc.semSaida++
      if (l.semMeio) acc.semMeio++
      if (!acc.ids.has(l.funcionarioId)) {
        acc.ids.add(l.funcionarioId)
        const p = cadastro.get(l.funcionarioId)
        if (p) {
          acc.chavePix = acc.chavePix ?? p.chavePix
          if (p.valorReceber != null) acc.valorReceber = (acc.valorReceber ?? 0) + p.valorReceber
          if (p.pago) { acc.pagos++; acc.pagoEm = acc.pagoEm && p.pagoEm && acc.pagoEm > p.pagoEm ? acc.pagoEm : (p.pagoEm ?? acc.pagoEm) }
          if (p.baixaEm) acc.baixaEm = p.baixaEm
        }
      }
      porPessoa.set(chave, acc)
    }
  }
  return [...porPessoa.values()]
    .map(({ ids, pagos, ...p }) => ({
      ...p, dias: [...p.dias].sort(), pago: pagos === 0 ? false : pagos === ids.size ? true : 'parcial' as const,
      // A equipe do primeiro dia vem primeiro: "LIMPEZA: 17/10 · CARREGADOR: 18/10, 19/10".
      diasPorFornecedor: p.diasPorFornecedor.map(e => ({ ...e, dias: [...e.dias].sort() })).sort((a, b) => a.dias[0].localeCompare(b.dias[0])),
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

// ════════════════════════════════════════════════════════════════════════
// APARÊNCIA
// ════════════════════════════════════════════════════════════════════════

/** Falta (sem saída / sem meio / sem entrada): laranja claro com texto laranja — dá pra achar com o filtro. */
const LARANJA_FUNDO = 'FFFDE3D7'
const LARANJA_TEXTO = 'FFC2410C'
/** Pessoa com baixa: a linha inteira em cinza (as batidas continuam valendo). */
const CINZA_TEXTO = 'FF9CA3AF'

type Coluna = { titulo: string; largura: number; esquerda?: boolean }

/** A tabela detalhada (uma linha por pessoa por dia — ou por bloco, se saiu e voltou). */
const COLUNAS_DETALHE: Coluna[] = [
  { titulo: 'Data', largura: 12 },
  { titulo: 'Dia da semana', largura: 13 },
  { titulo: 'Área', largura: 24, esquerda: true },
  { titulo: 'Função', largura: 18, esquerda: true },
  { titulo: 'Nome', largura: 32, esquerda: true },
  { titulo: 'CPF', largura: 16 },
  { titulo: 'Entrada', largura: 11 },
  { titulo: 'Meio', largura: 13 },
  { titulo: 'Saída', largura: 11 },
  { titulo: 'Horas', largura: 9 },
  { titulo: 'Situação', largura: 22 },
  { titulo: 'Origem', largura: 17 },
  { titulo: 'Quem lançou e motivo', largura: 50, esquerda: true },
  { titulo: 'Fora do local (com prova de GPS)', largura: 22 },
]
/** Na aba "Todas as batidas" do completo, o fornecedor entra depois do dia da semana. */
const COLUNA_FORNECEDOR: Coluna = { titulo: 'Fornecedor', largura: 28, esquerda: true }

const COLUNAS_RESUMO_SETOR: Coluna[] = [
  { titulo: 'Função', largura: 0, esquerda: true },
  { titulo: 'Pessoas', largura: 0 },
  { titulo: 'Entradas', largura: 0 },
  { titulo: 'Saídas', largura: 0 },
  { titulo: 'Sem saída', largura: 0 },
  { titulo: 'Sem meio', largura: 0 },
  { titulo: 'Horas', largura: 0 },
  { titulo: 'Horas (decimal)', largura: 0 },
]

const COLUNAS_RESUMO_GERAL: Coluna[] = [
  { titulo: 'Fornecedor', largura: 32, esquerda: true },
  { titulo: 'Área', largura: 24, esquerda: true },
  { titulo: 'Função', largura: 20, esquerda: true },
  { titulo: 'Pessoas', largura: 10 },
  { titulo: 'Entradas', largura: 10 },
  { titulo: 'Saídas', largura: 10 },
  { titulo: 'Sem saída', largura: 11 },
  { titulo: 'Sem meio', largura: 11 },
  { titulo: 'Horas', largura: 11 },
  { titulo: 'Horas (decimal)', largura: 11 },
]

const COLUNAS_PAGAMENTO: Coluna[] = [
  { titulo: 'Nome', largura: 32, esquerda: true },
  { titulo: 'CPF', largura: 16 },
  { titulo: 'Chave PIX', largura: 26, esquerda: true },
  { titulo: 'Fornecedor', largura: 28, esquerda: true },
  { titulo: 'Área', largura: 24, esquerda: true },
  { titulo: 'Função', largura: 18, esquerda: true },
  { titulo: 'Dias trabalhados', largura: 11 },
  { titulo: 'Quais dias', largura: 40, esquerda: true },
  { titulo: 'Diárias (turnos)', largura: 11 },
  { titulo: 'Horas', largura: 10 },
  { titulo: 'Horas (decimal)', largura: 10 },
  { titulo: 'Pendências', largura: 22 },
  { titulo: 'Valor a receber', largura: 15 },
  { titulo: 'Pago', largura: 9 },
  { titulo: 'Pago em', largura: 12 },
  { titulo: 'Baixa', largura: 12 },
]

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
  val.value = valorDaCelula(valor)
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

/**
 * Texto vazio NUNCA vai pra célula: o exceljs grava '' como uma "string compartilhada" vazia, e alguns leitores (o
 * visualizador de planilhas do ChatGPT, no caso do Juan em 12/10/2026) mostram o NÚMERO dela no lugar — a função
 * aparecia como "16" e o meio vazio como "128". Célula sem dado fica vazia de verdade (null).
 */
function valorDaCelula<T>(v: T): T | null {
  return v === '' || v === undefined ? null : v
}

const cpfFormatado = (cpf?: string | null): string | null => {
  const d = (cpf ?? '').replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : (cpf?.trim() || null)
}
const hora = (iso: string) => formatarBR(iso, 'hora')
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
/** As horas de UMA linha como número do Excel (fração do dia, sempre menos de 24h): aparece "11:16" e soma no Excel. */
const horasExcel = (ms: number) => (ms > 0 ? ms / DIA_EM_MS : null)
const FORMATO_HORAS = '[h]:mm'
/*
 * TOTAIS de horas (resumo, pagamento) passam de 24h — e o formato [h]:mm só funciona no Excel e no Google Planilhas: a
 * prévia do Mac e o visualizador do ChatGPT (onde o Juan abre as planilhas) mostram 686:05 como "14:05". Então o total
 * vai em texto ("686h05", igual em qualquer leitor) e ao lado em número decimal (686,08), pra somar.
 */
const horasTexto = (ms: number) => {
  if (ms <= 0) return null
  const m = Math.round(ms / 60000)
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`
}
const horasDecimais = (ms: number) => (ms > 0 ? Math.round((ms / 3_600_000) * 100) / 100 : null)
const FORMATO_DECIMAL = '#,##0.00'

function escreverCabecalho(ws: import('exceljs').Worksheet, linha: number, colunas: readonly { titulo: string }[]) {
  colunas.forEach((c, i) => {
    const cel = ws.getCell(linha, i + 1)
    cel.value = c.titulo
    cel.font = { bold: true, color: { argb: BRANCO }, size: 10 }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ACENTO } }
    cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cel.border = BORDA_CELULA
  })
  ws.getRow(linha).height = 30
}

const pintarFalta = (cel: import('exceljs').Cell) => {
  cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LARANJA_FUNDO } }
  cel.font = { bold: true, color: { argb: LARANJA_TEXTO } }
}

// ════════════════════════════════════════════════════════════════════════
// MONTAGEM DAS ABAS
// ════════════════════════════════════════════════════════════════════════

function ordenarLinhas(linhas: LinhaRelatorio[]): LinhaRelatorio[] {
  return [...linhas].sort((a, b) =>
    a.funcao.localeCompare(b.funcao, 'pt-BR') ||
    a.nome.localeCompare(b.nome, 'pt-BR') ||
    a.dataRef.localeCompare(b.dataRef) ||
    (a.entradaISO ?? '').localeCompare(b.entradaISO ?? '')
  )
}

/**
 * A tabela detalhada — a mesma na aba de cada fornecedor e na "Todas as batidas" (com a coluna do fornecedor).
 * Devolve a linha seguinte à última escrita.
 */
function escreverDetalhe(
  ws: import('exceljs').Worksheet, linhaCabecalho: number,
  itens: { l: LinhaRelatorio; setor: SetorRelatorio }[], comFornecedor: boolean,
): number {
  const colunas = comFornecedor ? [...COLUNAS_DETALHE.slice(0, 2), COLUNA_FORNECEDOR, ...COLUNAS_DETALHE.slice(2)] : COLUNAS_DETALHE
  escreverCabecalho(ws, linhaCabecalho, colunas)
  let linha = linhaCabecalho + 1
  for (const { l, setor } of itens) {
    const situacao = situacaoDaLinha(l)
    const meios = (l.meiosISO ?? []).map(hora).join(' · ')
    const valores: { v: string | number | Date | null; falta?: boolean; formato?: string }[] = [
      { v: dataRefParaExcel(l.dataRef), formato: 'dd/mm/yyyy' },
      { v: diaDaSemana(l.dataRef) },
      ...(comFornecedor ? [{ v: setor.nome }] : []),
      { v: setor.area ?? '—' },
      { v: l.funcao || '—' },
      { v: l.nome },
      { v: cpfFormatado(l.cpf) },
      l.entradaISO ? { v: hora(l.entradaISO) } : { v: 'sem entrada', falta: true },
      meios ? { v: meios } : l.semMeio ? { v: 'sem meio', falta: true } : { v: null },
      l.saidaISO ? { v: hora(l.saidaISO) } : l.entradaISO ? { v: 'sem saída', falta: true } : { v: null },
      { v: horasExcel(duracaoDaLinha(l)), formato: FORMATO_HORAS },
      { v: situacao.texto, falta: situacao.faltas.length > 0 },
      { v: ROTULO_ORIGEM[l.origem ?? 'normal'] },
      { v: (l.lancamentos ?? []).join(' | ') || null },
      { v: (l.foraDoLocal ?? []).join(' · ') || null, falta: !!l.foraDoLocal?.length },
    ]
    valores.forEach(({ v, falta, formato }, i) => {
      const cel = ws.getCell(linha, i + 1)
      cel.value = valorDaCelula(v)
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: colunas[i]?.esquerda ? 'left' : 'center', wrapText: colunas[i]?.esquerda }
      if (formato) cel.numFmt = formato
      if (falta) pintarFalta(cel)
      else if (l.baixaEm) cel.font = { color: { argb: CINZA_TEXTO } }
      if (!falta && colunas[i]?.titulo === 'Origem' && l.origem && l.origem !== 'normal') cel.font = { bold: true, color: { argb: l.baixaEm ? CINZA_TEXTO : COR_TEXTO } }
    })
    linha++
  }
  if (itens.length) {
    ws.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: linha - 1, column: colunas.length } }
  }
  return linha
}

/** O quadro de resumo por função: Função | Pessoas | Entradas | Saídas | Sem saída | Sem meio | Horas, com o total. */
function escreverResumoPorFuncao(ws: import('exceljs').Worksheet, linhaInicial: number, setor: SetorRelatorio): number {
  const resumo = calcularResumoPorFuncao(setor)
  escreverCabecalho(ws, linhaInicial, COLUNAS_RESUMO_SETOR)
  let linha = linhaInicial + 1
  const total = { pessoas: new Set(setor.linhas.map(l => l.funcionarioId)).size, entradas: 0, saidas: 0, semSaida: 0, semMeio: 0, horasMs: 0 }
  const escrever = (base: (string | number | null)[], destaque: boolean) => {
    const horasMs = base[6] as number
    const valores = [...base.slice(0, 6), horasTexto(horasMs), horasDecimais(horasMs)]
    valores.forEach((v, i) => {
      const cel = ws.getCell(linha, i + 1)
      cel.value = valorDaCelula(v)
      if (i === 7) cel.numFmt = FORMATO_DECIMAL
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center', wrapText: i === 0 }
      if (destaque) { cel.font = { bold: true, color: { argb: COR_MARCA } }; cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } } }
      else if ((i === 4 || i === 5) && typeof v === 'number' && v > 0) pintarFalta(cel)
    })
    linha++
  }
  for (const r of resumo) {
    escrever([r.funcao, r.pessoas, r.entradas, r.saidas, r.semSaida, r.semMeio, r.horasMs], false)
    total.entradas += r.entradas; total.saidas += r.saidas; total.semSaida += r.semSaida; total.semMeio += r.semMeio; total.horasMs += r.horasMs
  }
  if (resumo.length > 1) escrever(['TOTAL', total.pessoas, total.entradas, total.saidas, total.semSaida, total.semMeio, total.horasMs], true)
  if (!resumo.length) { ws.getCell(linha, 1).value = 'Nenhum credenciamento no período.'; linha++ }
  return linha
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
  const nCol = COLUNAS_DETALHE.length
  ws.columns = COLUNAS_DETALHE.map(c => ({ width: c.largura }))

  adicionarLogoNaAba(wb, ws, bufferLogo)
  let linha = 2
  escreverTitulo(ws, linha++, `RELATÓRIO — ${setor.nome.toUpperCase()}${setor.area ? ` · ${setor.area.toUpperCase()}` : ''}`, nCol)
  linha++
  escreverInfo(ws, linha++, 'Evento:', evento.eventoNome, nCol)
  if (evento.organizacaoNome) escreverInfo(ws, linha++, 'Organização:', evento.organizacaoNome, nCol)
  if (setor.area) escreverInfo(ws, linha++, 'Área (subgrupo):', setor.area, nCol)
  escreverInfo(ws, linha++, 'Período analisado:', textoPeriodo(evento.periodo), nCol)
  escreverInfo(ws, linha++, 'Legenda:', 'Laranja = falta batida (sem saída, sem meio) ou batida fora do local. Cinza = pessoa com baixa (as batidas continuam valendo). Horas = da entrada à saída.', nCol)
  linha++

  linha = escreverResumoPorFuncao(ws, linha, setor) + 1

  // Tabela detalhada.
  const linhaCabecalho = linha
  escreverDetalhe(ws, linhaCabecalho, ordenarLinhas(setor.linhas).map(l => ({ l, setor })), false)

  // Congela até o cabeçalho da tabela — rolando, a pessoa não perde de vista
  // o que cada coluna significa nem o resumo acima.
  ws.views = [{ state: 'frozen', ySplit: linhaCabecalho }]
}

/** A aba "Resumo Geral" do relatório completo: por fornecedor e função, com o total. */
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
  escreverInfo(ws, linha++, 'Pessoas que trabalharam:', String(new Set(dados.setores.flatMap(s => s.linhas.map(l => l.funcionarioId))).size), nCol)
  linha++

  const linhaCabecalho = linha
  escreverCabecalho(ws, linhaCabecalho, COLUNAS_RESUMO_GERAL)
  linha++

  const total = { entradas: 0, saidas: 0, semSaida: 0, semMeio: 0, horasMs: 0 }
  let linhasEscritas = 0
  const ordenados = [...dados.setores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || (a.area ?? '').localeCompare(b.area ?? '', 'pt-BR'))
  for (const setor of ordenados) {
    for (const r of calcularResumoPorFuncao(setor)) {
      const valores = [setor.nome, setor.area ?? '—', r.funcao, r.pessoas, r.entradas, r.saidas, r.semSaida, r.semMeio, horasTexto(r.horasMs), horasDecimais(r.horasMs)]
      valores.forEach((v, i) => {
        const cel = ws.getCell(linha, i + 1)
        cel.value = valorDaCelula(v)
        cel.border = BORDA_CELULA
        cel.alignment = { vertical: 'middle', horizontal: i < 3 ? 'left' : 'center', wrapText: i < 3 }
        if (i === 9) cel.numFmt = FORMATO_DECIMAL
        if ((i === 6 || i === 7) && typeof v === 'number' && v > 0) pintarFalta(cel)
      })
      total.entradas += r.entradas; total.saidas += r.saidas; total.semSaida += r.semSaida; total.semMeio += r.semMeio; total.horasMs += r.horasMs
      linhasEscritas++
      linha++
    }
  }

  const linhaTotal = linha
  const pessoas = new Set(dados.setores.flatMap(s => s.linhas.map(l => l.funcionarioId))).size
  const valoresTotal = ['TOTAL GERAL', null, null, pessoas, total.entradas, total.saidas, total.semSaida, total.semMeio, horasTexto(total.horasMs), horasDecimais(total.horasMs)]
  valoresTotal.forEach((v, i) => {
    const cel = ws.getCell(linhaTotal, i + 1)
    cel.value = valorDaCelula(v)
    cel.font = { bold: true, color: { argb: COR_MARCA } }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } }
    cel.alignment = { vertical: 'middle', horizontal: i < 3 ? 'left' : 'center' }
    cel.border = BORDA_CELULA
    if (i === 9) cel.numFmt = FORMATO_DECIMAL
  })
  ws.mergeCells(linhaTotal, 1, linhaTotal, 3)
  ws.getRow(linhaTotal).height = 22

  ws.views = [{ state: 'frozen', ySplit: linhaCabecalho }]
  if (linhasEscritas) {
    ws.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: linhaCabecalho + linhasEscritas, column: nCol } }
  }
}

const diaComSemana = (d: string) => `${ddmm(d)} ${diaDaSemana(d).slice(0, 3).toLowerCase()}`

/** "Quais dias": a lista simples; quem trabalhou em mais de uma equipe tem a equipe de cada dia. */
function textoDosDias(p: LinhaPagamento): string {
  if (p.diasPorFornecedor.length <= 1) return p.dias.map(diaComSemana).join(', ')
  return p.diasPorFornecedor.map(e => `${e.fornecedor}: ${e.dias.map(diaComSemana).join(', ')}`).join(' · ')
}

/** A aba "Pagamento": uma linha por pessoa que trabalhou, com chave PIX, dias, diárias, horas, valor e se foi pago. */
function escreverAbaPagamento(
  wb: import('exceljs').Workbook, ws: import('exceljs').Worksheet, bufferLogo: ArrayBuffer | null,
  evento: Pick<DadosRelatorioEvento, 'eventoNome' | 'periodo'>, setores: SetorRelatorio[], deQuem?: string,
) {
  const nCol = COLUNAS_PAGAMENTO.length
  ws.columns = COLUNAS_PAGAMENTO.map(c => ({ width: c.largura }))
  const pessoas = montarLinhasPagamento(setores)

  adicionarLogoNaAba(wb, ws, bufferLogo)
  let linha = 2
  escreverTitulo(ws, linha++, `PAGAMENTO — ${(deQuem ?? (setores.length === 1 ? nomeComArea(setores[0]) : evento.eventoNome)).toUpperCase()}`, nCol)
  linha++
  escreverInfo(ws, linha++, 'Evento:', evento.eventoNome, nCol)
  escreverInfo(ws, linha++, 'Período analisado:', textoPeriodo(evento.periodo), nCol)
  escreverInfo(ws, linha++, 'Pessoas que trabalharam:', String(pessoas.length), nCol)
  escreverInfo(ws, linha++, 'Como ler:', 'Uma linha por pessoa (pelo CPF): quem está em mais de um fornecedor aparece uma vez só, e em "Quais dias" vem a equipe de cada dia. "Dias trabalhados" conta os dias com entrada; "Diárias" conta os turnos (quem saiu e voltou no mesmo dia faz dois). Pendências em laranja: resolva antes de pagar. Valor a receber e Pago vêm do cadastro da pessoa.', nCol)
  ws.getRow(linha - 1).height = 30
  ws.getCell(linha - 1, 2).alignment = { wrapText: true, vertical: 'middle' }
  linha++

  const linhaCabecalho = linha
  escreverCabecalho(ws, linhaCabecalho, COLUNAS_PAGAMENTO)
  linha++
  const total = { dias: 0, diarias: 0, horasMs: 0, valor: 0, pagos: 0 }
  for (const p of pessoas) {
    const pendencias = [p.semSaida ? `${p.semSaida} sem saída` : '', p.semMeio ? `${p.semMeio} sem meio` : ''].filter(Boolean).join(' · ')
    const valores: { v: string | number | Date | null; formato?: string; falta?: boolean }[] = [
      { v: p.nome },
      { v: cpfFormatado(p.cpf) },
      { v: p.chavePix },
      { v: p.fornecedores.join(', ') },
      { v: p.areas.join(', ') || '—' },
      { v: p.funcoes.join(', ') || '—' },
      { v: p.dias.length },
      { v: textoDosDias(p) },
      { v: p.diarias },
      { v: horasTexto(p.horasMs) },
      { v: horasDecimais(p.horasMs), formato: FORMATO_DECIMAL },
      { v: pendencias || null, falta: !!pendencias },
      { v: p.valorReceber, formato: '"R$" #,##0.00' },
      { v: p.pago === 'parcial' ? 'Parcial' : p.pago ? 'Sim' : 'Não' },
      { v: p.pagoEm ? new Date(p.pagoEm) : null, formato: 'dd/mm/yyyy' },
      { v: p.baixaEm ? new Date(p.baixaEm) : null, formato: 'dd/mm/yyyy' },
    ]
    valores.forEach(({ v, formato, falta }, i) => {
      const cel = ws.getCell(linha, i + 1)
      cel.value = valorDaCelula(v)
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: COLUNAS_PAGAMENTO[i].esquerda ? 'left' : 'center', wrapText: COLUNAS_PAGAMENTO[i].esquerda }
      if (formato) cel.numFmt = formato
      if (falta) pintarFalta(cel)
      else if (p.baixaEm) cel.font = { color: { argb: CINZA_TEXTO } }
    })
    total.dias += p.dias.length; total.diarias += p.diarias; total.horasMs += p.horasMs; total.valor += p.valorReceber ?? 0; if (p.pago === true) total.pagos++
    linha++
  }
  if (pessoas.length) {
    const valoresTotal: (string | number | null)[] = ['TOTAL', `${pessoas.length} pessoa(s)`, null, null, null, null, total.dias, null, total.diarias, horasTexto(total.horasMs), horasDecimais(total.horasMs), null, total.valor || null, `${total.pagos} pagas`, null, null]
    valoresTotal.forEach((v, i) => {
      const cel = ws.getCell(linha, i + 1)
      cel.value = valorDaCelula(v)
      cel.font = { bold: true, color: { argb: COR_MARCA } }
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } }
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' }
      if (i === 10) cel.numFmt = FORMATO_DECIMAL
      if (i === 12) cel.numFmt = '"R$" #,##0.00'
    })
    ws.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: linha - 1, column: nCol } }
  } else {
    ws.getCell(linha, 1).value = 'Ninguém trabalhou no período escolhido.'
  }
  ws.views = [{ state: 'frozen', ySplit: linhaCabecalho, xSplit: 1 }]
}

/** "Todas as batidas" do completo: a tabela de todos os fornecedores junta, com a coluna do fornecedor. */
function escreverAbaTodasAsBatidas(
  wb: import('exceljs').Workbook, ws: import('exceljs').Worksheet, bufferLogo: ArrayBuffer | null, dados: DadosRelatorioEvento,
) {
  const nCol = COLUNAS_DETALHE.length + 1
  ws.columns = [...COLUNAS_DETALHE.slice(0, 2), COLUNA_FORNECEDOR, ...COLUNAS_DETALHE.slice(2)].map(c => ({ width: c.largura }))
  adicionarLogoNaAba(wb, ws, bufferLogo)
  let linha = 2
  escreverTitulo(ws, linha++, `TODAS AS BATIDAS — ${dados.eventoNome.toUpperCase()}`, nCol)
  linha++
  escreverInfo(ws, linha++, 'Período analisado:', textoPeriodo(dados.periodo), nCol)
  escreverInfo(ws, linha++, 'Legenda:', 'Uma linha por pessoa por dia (dois turnos no mesmo dia = duas linhas). Laranja = falta batida ou fora do local; cinza = baixa. Use o filtro do cabeçalho para recortar por fornecedor, área, dia ou situação.', nCol)
  linha++
  const itens = dados.setores
    .flatMap(setor => setor.linhas.map(l => ({ l, setor })))
    .sort((a, b) => a.l.dataRef.localeCompare(b.l.dataRef) || a.setor.nome.localeCompare(b.setor.nome, 'pt-BR')
      || a.l.nome.localeCompare(b.l.nome, 'pt-BR') || (a.l.entradaISO ?? '').localeCompare(b.l.entradaISO ?? ''))
  escreverDetalhe(ws, linha, itens, true)
  ws.views = [{ state: 'frozen', ySplit: linha }]
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

/** O nome do fornecedor com o subgrupo, pra distinguir os homônimos (três "NASCIMENTO" no VITAL). */
const nomeComArea = (s: SetorRelatorio) => (s.area ? `${s.nome} · ${s.area}` : s.nome)

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

const COLUNAS_AUSENTES: Coluna[] = [
  { titulo: 'Fornecedor', largura: 28, esquerda: true },
  { titulo: 'Área', largura: 24, esquerda: true },
  { titulo: 'Função', largura: 20, esquerda: true },
  { titulo: 'Nome', largura: 32, esquerda: true },
  { titulo: 'CPF', largura: 16 },
  { titulo: 'Baixa', largura: 14 },
]

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

  const todos = setores.flatMap(s => s.ausentes.map(p => ({ p, area: s.area ?? null })))
  escreverInfo(ws, linha++, 'Sem nenhum registro:', `${todos.length} pessoa(s)`, nCol)
  linha++

  escreverCabecalho(ws, linha++, COLUNAS_AUSENTES)

  const ordenados = [...todos].sort((a, b) =>
    a.p.setor.localeCompare(b.p.setor, 'pt-BR') ||
    (a.area ?? '').localeCompare(b.area ?? '', 'pt-BR') ||
    a.p.funcao.localeCompare(b.p.funcao, 'pt-BR') ||
    a.p.nome.localeCompare(b.p.nome, 'pt-BR'))

  for (const { p, area } of ordenados) {
    const valores = [p.setor, area ?? '—', p.funcao || '—', p.nome, cpfFormatado(p.cpf), p.baixaEm ? new Date(p.baixaEm) : null]
    valores.forEach((v, i) => {
      const cel = ws.getCell(linha, i + 1)
      cel.value = valorDaCelula(v)
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: COLUNAS_AUSENTES[i].esquerda ? 'left' : 'center' }
      if (i === 5) cel.numFmt = 'dd/mm/yyyy'
      if (p.baixaEm) cel.font = { color: { argb: CINZA_TEXTO } }
    })
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
export async function gerarRelatorioAusentes(dados: DadosRelatorioEvento, sufixo = 'Nao_credenciaram'): Promise<void> {
  const [wb, bufferLogo] = await Promise.all([novaPlanilha(), carregarLogoBuffer()])
  const umSetorSo = dados.setores.length === 1 ? dados.setores[0] : null
  const ws = wb.addWorksheet(nomeDaAba(umSetorSo ? umSetorSo.nome : 'Nao credenciaram', new Set()))
  escreverAbaAusentes(
    wb, ws, bufferLogo, dados, dados.setores,
    `NÃO CREDENCIARAM${umSetorSo ? ` — ${nomeComArea(umSetorSo).toUpperCase()}` : ''}`,
  )
  await baixarWorkbook(wb, nomeDoArquivo(dados.eventoNome, umSetorSo ? `${nomeComArea(umSetorSo)}_nao_credenciaram` : sufixo))
}

/** A planilha de UM fornecedor (sem baixar): a aba dele e a aba "Pagamento". Separada pro teste montar no Node. */
export async function montarPlanilhaSetor(dados: DadosRelatorioEvento, setor: SetorRelatorio, logo: ArrayBuffer | null): Promise<import('exceljs').Workbook> {
  const wb = await novaPlanilha()
  const usados = new Set<string>(['Pagamento'])
  escreverAbaSetor(wb, wb.addWorksheet(nomeDaAba(setor.nome, usados)), logo, dados, setor)
  escreverAbaPagamento(wb, wb.addWorksheet('Pagamento'), logo, dados, [setor])
  return wb
}

/** Relatório de UM setor — baixa direto no navegador. */
export async function gerarRelatorioSetor(dados: DadosRelatorioEvento): Promise<void> {
  const setor = dados.setores[0]
  if (!setor) return
  const wb = await montarPlanilhaSetor(dados, setor, await carregarLogoBuffer())
  await baixarWorkbook(wb, nomeDoArquivo(dados.eventoNome, nomeComArea(setor)))
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
  const ordenados = [...dados.setores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || (a.area ?? '').localeCompare(b.area ?? '', 'pt-BR'))
  const sufixo = modo === 'ausentes' ? '_nao_credenciaram' : ''
  for (const setor of ordenados) {
    let wb: import('exceljs').Workbook
    if (modo === 'ausentes') {
      wb = await novaPlanilha()
      escreverAbaAusentes(wb, wb.addWorksheet(nomeDaAba(setor.nome, new Set())), bufferLogo, dados, [setor], `NÃO CREDENCIARAM — ${nomeComArea(setor).toUpperCase()}`)
    } else {
      wb = await montarPlanilhaSetor(dados, setor, bufferLogo)
    }
    const buffer = await wb.xlsx.writeBuffer()
    // Dois setores com o mesmo nome não podem virar o mesmo arquivo (o subgrupo já separa quase todos).
    let nome = nomeDoArquivo(dados.eventoNome, `${nomeComArea(setor)}${sufixo}`)
    for (let n = 2; usados.has(nome); n++) nome = nomeDoArquivo(dados.eventoNome, `${nomeComArea(setor)}${sufixo} (${n})`)
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

/**
 * O relatório completo do evento (sem baixar): Resumo Geral, Pagamento, Todas as batidas e uma aba por fornecedor.
 * Separado pro teste montar o arquivo no Node.
 */
export async function montarPlanilhaCompleta(dados: DadosRelatorioEvento, logo: ArrayBuffer | null): Promise<import('exceljs').Workbook> {
  const wb = await novaPlanilha()
  escreverAbaResumoGeral(wb, wb.addWorksheet('Resumo Geral'), logo, dados)
  escreverAbaPagamento(wb, wb.addWorksheet('Pagamento'), logo, dados, dados.setores)
  escreverAbaTodasAsBatidas(wb, wb.addWorksheet('Todas as batidas'), logo, dados)

  const usados = new Set<string>(['Resumo Geral', 'Pagamento', 'Todas as batidas'])
  const ordenados = [...dados.setores].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR') || (a.area ?? '').localeCompare(b.area ?? '', 'pt-BR'))
  for (const setor of ordenados) {
    escreverAbaSetor(wb, wb.addWorksheet(nomeDaAba(setor.nome, usados)), logo, dados, setor)
  }
  return wb
}

/** Relatório completo do evento — baixa direto no navegador. */
export async function gerarRelatorioCompleto(dados: DadosRelatorioEvento, sufixo = 'Completo'): Promise<void> {
  const wb = await montarPlanilhaCompleta(dados, await carregarLogoBuffer())
  await baixarWorkbook(wb, nomeDoArquivo(dados.eventoNome, sufixo))
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
      cel.value = valorDaCelula(v)
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
  // As mesmas linhas do relatório completo (dia da semana, CPF, meio, horas, situação, origem, fora do local) quando o
  // servidor manda; sem elas (dados antigos), a tabela simples de antes.
  if (dados.setoresRelatorio) {
    const ws = wb.addWorksheet('Batidas')
    const colunas = [...COLUNAS_DETALHE.slice(0, 2), COLUNA_FORNECEDOR, ...COLUNAS_DETALHE.slice(2)]
    ws.columns = colunas.map(c => ({ width: c.largura }))
    const itens = dados.setoresRelatorio
      .flatMap(setor => setor.linhas.map(l => ({ l, setor })))
      .sort((a, b) => a.l.dataRef.localeCompare(b.l.dataRef) || a.setor.nome.localeCompare(b.setor.nome, 'pt-BR')
        || a.l.nome.localeCompare(b.l.nome, 'pt-BR') || (a.l.entradaISO ?? '').localeCompare(b.l.entradaISO ?? ''))
    const linhaInfo = cabecalhoDaAba(wb, ws, logo, dados, 'HORÁRIOS DAS BATIDAS', colunas.length, [
      ['Linhas:', String(itens.length)],
      ['Legenda:', 'Laranja = falta batida (sem saída, sem meio) ou batida fora do local. Cinza = pessoa com baixa. Horas = da entrada à saída.'],
    ])
    if (itens.length) escreverDetalhe(ws, linhaInfo, itens, true)
    else ws.getCell(linhaInfo, 1).value = 'Nenhuma batida no período.'
    ws.views = [{ state: 'frozen', ySplit: linhaInfo }]
  } else {
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
    escreverTabela(ws, linhaInfo, colunas, linhas.map(({ s, p, b }) => [diaCurto(b.dia), s.nome, p.nome, p.funcao || '—', ROTULO_SITUACAO[p.situacao], horaDe(b.entradaISO), [...(b.meiosAnterioresISO ?? []), b.meioISO].filter(Boolean).map(m => horaDe(m as string)).join(' · '), horaDe(b.saidaISO)]),
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

  // ── 6) Pagamento (uma linha por pessoa que trabalhou no período) ──────
  if (dados.setoresRelatorio) {
    escreverAbaPagamento(wb, wb.addWorksheet('Pagamento'), logo, dados, dados.setoresRelatorio, dados.subeventoNome)
  }

  // ── 7) Uma aba por fornecedor ──────────────────────────────────────────
  const usados = new Set<string>(['Resumo Geral', 'Faltam aprovar', 'Equipe', 'Batidas', 'Supervisores', 'Pagamento'])
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
