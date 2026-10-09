/**
 * Planilha .xlsx com a cara do Credenciei, gerada NO NAVEGADOR — para os relatórios da central de Relatórios
 * (lib/relatorios-extras.ts devolve as abas prontas; aqui só se desenha). Mesmo padrão visual da auditoria e do
 * relatório de presença: logo na linha 1, faixa laranja com o título, cabeçalho destacado e congelado, filtro em
 * cada coluna, linhas zebradas.
 */
import type { AbaRelatorio } from './relatorios-extras'
import { formatarBR } from './tz'
import { COR_MARCA, COR_ACENTO, COR_FAIXA_CLARA, COR_TEXTO, BRANCO, BORDA_CELULA, carregarLogoBuffer, adicionarLogoNaAba } from './marca-relatorio'

export async function baixarPlanilhaPadrao(r: { titulo: string; arquivo: string; abas: AbaRelatorio[] }): Promise<void> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const logo = await carregarLogoBuffer()

  for (const aba of r.abas) {
    // O Excel não aceita estes caracteres no nome da aba, e corta em 31.
    const ws = wb.addWorksheet(aba.nome.replace(/[\\/?*[\]:]/g, '-').slice(0, 31))
    const nCol = Math.max(aba.colunas.length, 1)
    ws.columns = aba.colunas.map(c => ({ width: c.largura }))
    adicionarLogoNaAba(wb, ws, logo)

    ws.mergeCells(2, 1, 2, nCol)
    const titulo = ws.getCell(2, 1)
    titulo.value = `${r.titulo.toUpperCase()}${r.abas.length > 1 ? ` — ${aba.nome.toUpperCase()}` : ''}`
    titulo.font = { bold: true, size: 14, color: { argb: BRANCO } }
    titulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_MARCA } }
    titulo.alignment = { vertical: 'middle', horizontal: 'left' }
    ws.getRow(2).height = 26

    ws.mergeCells(3, 1, 3, nCol)
    const info = ws.getCell(3, 1)
    info.value = `${aba.linhas.length} registro${aba.linhas.length === 1 ? '' : 's'} — gerado em ${formatarBR(new Date().toISOString(), 'completo')} (horário de Brasília)`
    info.font = { italic: true, size: 9, color: { argb: COR_TEXTO } }

    const cab = 5
    aba.colunas.forEach((c, i) => {
      const cel = ws.getCell(cab, i + 1)
      cel.value = c.titulo
      cel.font = { bold: true, color: { argb: BRANCO }, size: 10 }
      cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ACENTO } }
      cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
      cel.border = BORDA_CELULA
    })
    ws.getRow(cab).height = 28

    aba.linhas.forEach((linha, idx) => {
      linha.forEach((v, i) => {
        const cel = ws.getCell(cab + 1 + idx, i + 1)
        cel.value = v ?? ''
        cel.border = BORDA_CELULA
        cel.alignment = { vertical: 'middle', horizontal: typeof v === 'number' ? 'center' : 'left', wrapText: (aba.colunas[i]?.largura ?? 0) >= 30 }
        if (idx % 2 === 1) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } }
      })
    })

    ws.views = [{ state: 'frozen', ySplit: cab }]
    if (aba.linhas.length) ws.autoFilter = { from: { row: cab, column: 1 }, to: { row: cab + aba.linhas.length, column: nCol } }
    if (!aba.linhas.length) {
      ws.mergeCells(cab + 1, 1, cab + 1, nCol)
      const vazio = ws.getCell(cab + 1, 1)
      vazio.value = 'Nada para mostrar neste evento.'
      vazio.font = { italic: true, color: { argb: COR_TEXTO } }
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${r.arquivo.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/-+$/, '').toLowerCase()}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
