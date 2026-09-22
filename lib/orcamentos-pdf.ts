import { readFileSync } from 'fs'
import path from 'path'
import type { OrcamentoComItens } from './orcamentos'
import { brl, numeroOrcamento } from './orcamentos-constantes'

/**
 * O PDF de um orçamento — documento comercial que vai direto pro cliente.
 *
 * Mesmo esqueleto de lib/relatorio-custo-whatsapp.ts: jsPDF puro, sem
 * `autotable` (uma dependência a menos, tabela desenhada com `text()`),
 * `unit: 'pt'`, `format: 'a4'`, margem 48pt, mesma paleta RGB já validada em
 * produção. Roda só no servidor (lê a logo do disco com `fs`), nunca no
 * navegador.
 */

const LARANJA: [number, number, number] = [255, 74, 15]
const LARANJA_CLARO: [number, number, number] = [255, 241, 234]
const ESCURO: [number, number, number] = [31, 33, 36]
const CINZA: [number, number, number] = [120, 124, 130]
const BORDA: [number, number, number] = [222, 224, 228]

function dataBR(iso: string | null): string {
  if (!iso) return 'sem data'
  const [ano, mes, dia] = iso.split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
}

export async function montarPdfOrcamento(orcamento: OrcamentoComItens): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const margem = 48
  const largura = doc.internal.pageSize.getWidth() - margem * 2
  let y = 60

  // ── Cabeçalho: logo + "ORÇAMENTO" + número + data de emissão ───────────────
  let alturaLogo = 0
  try {
    const logoPath = path.join(process.cwd(), 'public/marca/logo-preto.png')
    const logoBase64 = `data:image/png;base64,${readFileSync(logoPath).toString('base64')}`
    const props = doc.getImageProperties(logoBase64)
    const larguraLogo = 110
    alturaLogo = (props.height / props.width) * larguraLogo
    doc.addImage(logoBase64, 'PNG', margem, y - alturaLogo + 6, larguraLogo, alturaLogo)
  } catch (e) {
    // Sem logo é melhor que sem PDF — o orçamento continua legível e correto.
    console.error('[orcamentos-pdf] logo não carregou', e instanceof Error ? e.message : e)
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.setTextColor(...LARANJA)
  doc.text('ORÇAMENTO', margem + largura, y - 10, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...CINZA)
  doc.text(
    `${numeroOrcamento(orcamento.numero)}  ·  Emitido em ${dataBR(new Date().toISOString().slice(0, 10))}`,
    margem + largura, y + 8, { align: 'right' },
  )

  y += Math.max(alturaLogo, 24) + 18
  doc.setDrawColor(...BORDA)
  doc.setLineWidth(1)
  doc.line(margem, y, margem + largura, y)
  y += 28

  // ── Dados do evento ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...CINZA)
  doc.text('DADOS DO EVENTO', margem, y)
  y += 18

  const linhas: [string, string][] = [
    ['Evento', orcamento.nomeEvento],
    ['Responsável', orcamento.responsavel],
    ['Telefone', orcamento.telefone ?? '—'],
    ['Data do evento', dataBR(orcamento.dataEvento)],
  ]
  doc.setFontSize(10.5)
  for (const [rotulo, valor] of linhas) {
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...ESCURO)
    doc.text(`${rotulo}:`, margem, y)
    doc.setFont('helvetica', 'normal')
    doc.text(valor, margem + 118, y)
    y += 17
  }
  y += 14

  // ── Investimento ─────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(...CINZA)
  doc.text('INVESTIMENTO', margem, y)
  y += 8
  doc.setDrawColor(...BORDA)
  doc.line(margem, y, margem + largura, y)
  y += 22

  const colValor = margem + largura
  const diasTexto = orcamento.dias > 1 ? ` (${orcamento.dias} dias)` : ''
  const linhasInvestimento: [string, number][] = [
    [`Valor do dia${diasTexto}`, orcamento.valorDia * orcamento.dias],
    [`Valor por funcionário${diasTexto}`, orcamento.valorFuncionario * orcamento.dias],
    [`Valor do técnico${diasTexto}`, orcamento.valorTecnico * orcamento.dias],
    ...orcamento.itens.map((i): [string, number] => [i.descricao, i.valor]),
  ]
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10.5)
  for (const [descricao, valor] of linhasInvestimento) {
    if (valor <= 0) continue
    doc.setTextColor(...ESCURO)
    doc.text(descricao, margem, y)
    doc.text(brl(valor), colValor, y, { align: 'right' })
    y += 20
    if (y > doc.internal.pageSize.getHeight() - 220) break
  }

  if (orcamento.desconto > 0) {
    doc.setTextColor(...LARANJA)
    doc.text('Desconto', margem, y)
    doc.text(`− ${brl(orcamento.desconto)}`, colValor, y, { align: 'right' })
    y += 20
  }

  y += 6
  doc.setDrawColor(...BORDA)
  doc.line(margem, y, margem + largura, y)
  y += 26

  // ── Total em destaque ────────────────────────────────────────────────────
  const alturaTotal = 52
  doc.setFillColor(...LARANJA_CLARO)
  doc.roundedRect(margem, y, largura, alturaTotal, 8, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(...ESCURO)
  doc.text('VALOR TOTAL DO ORÇAMENTO', margem + 18, y + 32)
  doc.setFontSize(20)
  doc.setTextColor(...LARANJA)
  doc.text(brl(orcamento.valorTotalCalculado), margem + largura - 18, y + 34, { align: 'right' })
  y += alturaTotal + 30

  // ── Observações ──────────────────────────────────────────────────────────
  if (orcamento.observacoes?.trim()) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...CINZA)
    doc.text('OBSERVAÇÕES', margem, y)
    y += 16
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(...ESCURO)
    const texto = doc.splitTextToSize(orcamento.observacoes, largura) as string[]
    doc.text(texto, margem, y)
    y += texto.length * 13 + 20
  }

  // ── Selo da marca, grande, canto inferior direito ───────────────────────
  const alturaPagina = doc.internal.pageSize.getHeight()
  try {
    const isoPath = path.join(process.cwd(), 'public/marca/iso-laranja.png')
    const isoBase64 = `data:image/png;base64,${readFileSync(isoPath).toString('base64')}`
    const propsIso = doc.getImageProperties(isoBase64)
    const larguraIso = 150
    const alturaIso = (propsIso.height / propsIso.width) * larguraIso
    doc.addImage(
      isoBase64, 'PNG',
      margem + largura - larguraIso, alturaPagina - 24 - alturaIso,
      larguraIso, alturaIso,
    )
  } catch (e) {
    console.error('[orcamentos-pdf] ícone não carregou', e instanceof Error ? e.message : e)
  }

  // ── Rodapé ───────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(...LARANJA)
  doc.text('Credenciei', margem, alturaPagina - 46)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...CINZA)
  doc.text('Soluções profissionais para gestão e credenciamento de eventos.', margem, alturaPagina - 33)

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
}
