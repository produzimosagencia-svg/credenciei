/**
 * Planilha do relatório "Fora do local" — gerada no navegador. Usada pela tela do relatório e pela central de
 * Relatórios.
 */
import type { LinhaForaDoLocal } from './alertas-local'
import { formatarBR } from './tz'
import { COR_MARCA, COR_ACENTO, COR_FAIXA_CLARA, COR_TEXTO, BRANCO, BORDA_CELULA, carregarLogoBuffer, adicionarLogoNaAba } from './marca-relatorio'

export const ROTULO_TIPO: Record<string, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

export const distancia = (m: number | null) =>
  m == null ? '—' : m >= 1000 ? `${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `${m} m`

export const linkMapa = (l: LinhaForaDoLocal) =>
  l.latitude != null && l.longitude != null ? `https://www.google.com/maps?q=${l.latitude},${l.longitude}` : null

export async function baixarPlanilhaForaDoLocal(linhas: LinhaForaDoLocal[], eventoNome: string, raioM: number | null, recorte: string) {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Fora do local')
  const colunas = [
    { titulo: 'Situação', largura: 12 }, { titulo: 'Data e hora', largura: 17 }, { titulo: 'Colaborador', largura: 34 },
    { titulo: 'Setor', largura: 32 }, { titulo: 'Batida', largura: 10 }, { titulo: 'Distância do local', largura: 14 },
    { titulo: 'Quem registrou', largura: 26 }, { titulo: 'Endereço aproximado', largura: 40 }, { titulo: 'Mapa', largura: 40 },
  ]
  ws.columns = colunas.map(c => ({ width: c.largura }))
  adicionarLogoNaAba(wb, ws, await carregarLogoBuffer())
  ws.mergeCells(2, 1, 2, colunas.length)
  const t = ws.getCell(2, 1)
  t.value = `BATIDAS FORA DO LOCAL — ${eventoNome.toUpperCase()} — ${recorte.toUpperCase()}`
  t.font = { bold: true, size: 14, color: { argb: BRANCO } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_MARCA } }
  ws.getRow(2).height = 26
  ws.mergeCells(3, 1, 3, colunas.length)
  const info = ws.getCell(3, 1)
  info.value = `${linhas.length} registro(s). Raio do local: ${raioM ?? '—'} m. Gerado em ${formatarBR(new Date().toISOString(), 'completo')}`
  info.font = { italic: true, size: 9, color: { argb: COR_TEXTO } }
  const cab = 5
  colunas.forEach((c, i) => {
    const cel = ws.getCell(cab, i + 1)
    cel.value = c.titulo
    cel.font = { bold: true, color: { argb: BRANCO }, size: 10 }
    cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_ACENTO } }
    cel.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cel.border = BORDA_CELULA
  })
  linhas.forEach((l, idx) => {
    const mapa = linkMapa(l)
    // Data já em texto no horário de Brasília: um Date cru o Excel mostra em UTC (3 horas a mais).
    const valores: (string | { text: string; hyperlink: string })[] = [
      l.situacao === 'registrada' ? 'Registrada' : 'Recusada', formatarBR(l.quando, 'completo'), l.funcionarioNome, l.setorNome ?? '—',
      l.tipo ? ROTULO_TIPO[l.tipo] : '—', distancia(l.distanciaM), l.quemRegistrou, l.endereco ?? '',
      mapa ? { text: 'Abrir no mapa', hyperlink: mapa } : '',
    ]
    valores.forEach((v, i) => {
      const cel = ws.getCell(cab + 1 + idx, i + 1)
      cel.value = v
      cel.border = BORDA_CELULA
      cel.alignment = { vertical: 'middle', horizontal: [2, 3, 6, 7].includes(i) ? 'left' : 'center', wrapText: i === 7 }
      if (idx % 2 === 1) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_FAIXA_CLARA } }
    })
  })
  ws.views = [{ state: 'frozen', ySplit: cab }]
  if (linhas.length) ws.autoFilter = { from: { row: cab, column: 1 }, to: { row: cab + linhas.length, column: colunas.length } }
  const buffer = await wb.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `fora-do-local-${`${eventoNome}-${recorte}`.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

