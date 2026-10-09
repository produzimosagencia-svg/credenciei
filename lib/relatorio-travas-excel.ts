/**
 * Planilha do relatório "Limite de pessoas por dia" — gerada no NAVEGADOR, mesmo padrão e mesma identidade visual
 * da planilha de auditoria (app/admin/auditoria/FiltrosAuditoria.tsx): logo na linha 1, faixa laranja com o
 * título, cabeçalho destacado e congelado, filtro em cada coluna.
 *
 * Uma linha por setor, uma coluna por dia: "aprovados/limite", ou "livre" quando o dia não tem trava. As cores
 * repetem as da tela — amarelo para livre, vermelho quando já tem mais gente aprovada do que o limite.
 */
import type { RelatorioTravas, LinhaRelatorioTrava } from './escala'
import { formatarBR } from './tz'
import { COR_MARCA, COR_ACENTO, COR_FAIXA_CLARA, COR_TEXTO, BRANCO, BORDA_CELULA, carregarLogoBuffer, adicionarLogoNaAba } from './marca-relatorio'

const COR_LIVRE = 'FFFFF4D6'
const COR_ESTOURADO = 'FFFDE2E2'

const ROTULO_SITUACAO: Record<LinhaRelatorioTrava['situacao'], string> = {
  sem_trava: 'Sem trava',
  parcial: 'Parcial',
  completa: 'Completa',
}
const ORDEM_SITUACAO: Record<LinhaRelatorioTrava['situacao'], number> = { sem_trava: 0, parcial: 1, completa: 2 }
const FASE: Record<string, string> = { montagem: 'montagem', evento: 'evento', desmontagem: 'desmont.' }

export async function gerarPlanilhaTravas(relatorio: RelatorioTravas, eventoNome: string): Promise<void> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Limite por dia')

  const colunas = [
    { titulo: 'Situação', largura: 12 },
    { titulo: 'Setor', largura: 40 },
    { titulo: 'Supervisor(es)', largura: 34 },
    ...relatorio.dias.map(d => {
      const [, m, dd] = d.data.split('-')
      return { titulo: `${dd}/${m}\n${FASE[d.fase] ?? d.fase}`, largura: 11 }
    }),
    { titulo: 'Dias sem trava', largura: 11 },
  ]
  const nCol = colunas.length
  ws.columns = colunas.map(c => ({ width: c.largura }))

  adicionarLogoNaAba(wb, ws, await carregarLogoBuffer())
  let linha = 2
  ws.mergeCells(linha, 1, linha, nCol)
  const titulo = ws.getCell(linha, 1)
  titulo.value = `LIMITE DE PESSOAS POR DIA — ${eventoNome.toUpperCase()}`
  titulo.font = { bold: true, size: 14, color: { argb: BRANCO } }
  titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_MARCA } }
  titulo.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(linha).height = 26
  linha++

  const conta = (s: LinhaRelatorioTrava['situacao']) => relatorio.linhas.filter(l => l.situacao === s).length
  ws.mergeCells(linha, 1, linha, nCol)
  const info = ws.getCell(linha, 1)
  info.value = `${relatorio.linhas.length} setores — ${conta('sem_trava')} sem trava, ${conta('parcial')} parcial, ` +
    `${conta('completa')} completa. Célula = aprovados/limite; "livre" = sem trava no dia. ` +
    `Gerado em ${formatarBR(new Date().toISOString(), 'completo')}`
  info.font = { italic: true, size: 9, color: { argb: COR_TEXTO } }
  linha += 2

  const linhaCabecalho = linha
  colunas.forEach((c, i) => {
    const cel = ws.getCell(linhaCabecalho, i + 1)
    cel.value = c.titulo
    cel.font = { bold: true, color: { argb: BRANCO }, size: 10 }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ACENTO } }
    cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cel.border = BORDA_CELULA
  })
  ws.getRow(linhaCabecalho).height = 32
  linha++

  const ordenadas = [...relatorio.linhas].sort((a, b) =>
    ORDEM_SITUACAO[a.situacao] - ORDEM_SITUACAO[b.situacao] || a.nome.localeCompare(b.nome, 'pt-BR'))

  ordenadas.forEach((l, idx) => {
    const zebra = idx % 2 === 1
    const valores: (string | number)[] = [
      ROTULO_SITUACAO[l.situacao],
      l.nome,
      l.supervisores.join(', ') || 'sem supervisor',
      ...l.porDia.map(d => (d.maximo == null ? 'livre' : `${d.aprovados}/${d.maximo}`)),
      l.porDia.filter(d => d.maximo == null).length,
    ]
    valores.forEach((v, i) => {
      const cel = ws.getCell(linha, i + 1)
      cel.value = v
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: i === 1 || i === 2 ? 'left' : 'center', wrapText: i === 2 }
      const dia = i >= 3 && i < 3 + l.porDia.length ? l.porDia[i - 3] : null
      const cor = dia
        ? dia.maximo == null ? COR_LIVRE : dia.aprovados > dia.maximo ? COR_ESTOURADO : null
        : null
      if (cor) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: cor } }
      else if (zebra) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } }
    })
    linha++
  })

  ws.views = [{ state: 'frozen', ySplit: linhaCabecalho, xSplit: 2 }]
  if (ordenadas.length) {
    ws.autoFilter = { from: { row: linhaCabecalho, column: 1 }, to: { row: linhaCabecalho + ordenadas.length, column: nCol } }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `limite-por-dia-${eventoNome.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
