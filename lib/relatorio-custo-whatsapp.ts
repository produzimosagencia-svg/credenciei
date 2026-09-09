/**
 * O PDF de custo de WhatsApp de UM evento — montagem pura, sem banco e sem
 * `next/headers`, pra poder rodar tanto na rota que o gera quanto num script
 * de teste em Node (foi assim que ele foi conferido antes de subir).
 *
 * ─── POR QUE SIMPLES ─────────────────────────────────────────────────────────
 *
 * A primeira versão listava tudo: destinatários únicos, quebra por categoria
 * da Meta, duas tabelas geradas por `jspdf-autotable`. O Juan pediu o oposto
 * (09/09/2026): "um comprovante simples — quantas mensagens, quanto gastou,
 * quantos funcionários". É o que este arquivo faz, e nada além. Sem
 * `autotable`: a listinha por tipo é desenhada com `text()` mesmo, o que tira
 * uma dependência inteira do caminho.
 *
 * ─── UM EVENTO, DO ZERO ──────────────────────────────────────────────────────
 *
 * Todo número aqui já vem filtrado por `evento_id` — o relatório do próximo
 * evento começa em zero, sem herdar um centavo do anterior. O PDF diz isso em
 * letra visível no rodapé, porque um comprovante que vai pro cliente precisa
 * dizer o que ele está contando.
 */

export type CustoWhatsAppDoEvento = {
  eventoNome: string
  organizacaoNome: string | null
  eventoInicio: string | null
  eventoFim: string | null
  /** Mensagens com status `enviado` DESTE evento. */
  enviados: number
  /** Soma do preço da Meta por mensagem enviada, em reais. */
  custoTotal: number
  /** Pessoas cadastradas na equipe deste evento. */
  funcionarios: number
  porTipo: { rotulo: string; enviados: number; custo: number }[]
  geradoEm: string
}

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = (v: number) => v.toLocaleString('pt-BR')

function dataBR(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** O período do evento em uma linha: "05/09/2026 a 06/09/2026", ou só o início. */
export function periodoEmTexto(inicio: string | null, fim: string | null): string {
  const de = dataBR(inicio)
  const ate = dataBR(fim)
  if (de && ate && de !== ate) return `${de} a ${ate}`
  return de ?? ate ?? 'sem data cadastrada'
}

const LARANJA: [number, number, number] = [255, 74, 15]
const ESCURO: [number, number, number] = [31, 33, 36]
const CINZA: [number, number, number] = [120, 124, 130]
const BORDA: [number, number, number] = [222, 224, 228]

export async function montarPdfCustoWhatsApp(dados: CustoWhatsAppDoEvento): Promise<Uint8Array> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })

  const margem = 48
  const largura = doc.internal.pageSize.getWidth() - margem * 2
  let y = 64

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...ESCURO)
  doc.text('Custo de WhatsApp do evento', margem, y)

  y += 22
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(12)
  doc.setTextColor(...LARANJA)
  doc.text(doc.splitTextToSize(dados.eventoNome, largura) as string[], margem, y)

  y += 18
  doc.setFontSize(9.5)
  doc.setTextColor(...CINZA)
  const linhaTopo = [
    dados.organizacaoNome,
    periodoEmTexto(dados.eventoInicio, dados.eventoFim),
  ].filter(Boolean).join('  ·  ')
  doc.text(linhaTopo, margem, y)

  y += 14
  doc.setDrawColor(...BORDA)
  doc.setLineWidth(1)
  doc.line(margem, y, margem + largura, y)

  // ── Os três números ────────────────────────────────────────────────────────
  y += 22
  const larguraCartao = (largura - 16 * 2) / 3
  const alturaCartao = 78
  const cartoes: [string, string][] = [
    ['Mensagens enviadas', numero(dados.enviados)],
    ['Valor gasto', brl(dados.custoTotal)],
    ['Funcionários no evento', numero(dados.funcionarios)],
  ]
  cartoes.forEach(([rotulo, valor], i) => {
    const x = margem + i * (larguraCartao + 16)
    doc.setDrawColor(...BORDA)
    doc.setFillColor(250, 250, 251)
    doc.roundedRect(x, y, larguraCartao, alturaCartao, 6, 6, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...CINZA)
    doc.text(rotulo.toUpperCase(), x + 14, y + 22)

    doc.setFontSize(20)
    doc.setTextColor(...ESCURO)
    // Cabe sempre: valores longos (R$ 1.234.567,89) encolhem em vez de vazar.
    let tamanho = 20
    while (tamanho > 11 && doc.getTextWidth(valor) > larguraCartao - 28) {
      tamanho -= 1
      doc.setFontSize(tamanho)
    }
    doc.text(valor, x + 14, y + 56)
  })
  y += alturaCartao + 30

  // ── Quebra por tipo de mensagem ────────────────────────────────────────────
  if (dados.porTipo.length) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...ESCURO)
    doc.text('Por tipo de mensagem', margem, y)
    y += 16

    const colEnviados = margem + largura - 190
    const colCusto = margem + largura

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(...CINZA)
    doc.text('TIPO', margem, y)
    doc.text('ENVIADAS', colEnviados, y, { align: 'right' })
    doc.text('VALOR', colCusto, y, { align: 'right' })
    y += 6
    doc.setDrawColor(...BORDA)
    doc.line(margem, y, margem + largura, y)
    y += 16

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    for (const linha of dados.porTipo) {
      doc.setTextColor(...ESCURO)
      doc.text(linha.rotulo, margem, y)
      doc.text(numero(linha.enviados), colEnviados, y, { align: 'right' })
      doc.text(brl(linha.custo), colCusto, y, { align: 'right' })
      y += 15
      if (y > doc.internal.pageSize.getHeight() - 130) break
    }

    y += 2
    doc.setDrawColor(...BORDA)
    doc.line(margem, y, margem + largura, y)
    y += 16
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...ESCURO)
    doc.text('Total', margem, y)
    doc.text(numero(dados.enviados), colEnviados, y, { align: 'right' })
    doc.text(brl(dados.custoTotal), colCusto, y, { align: 'right' })
    y += 26
  }

  // ── Rodapé ─────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(...CINZA)
  const rodape = [
    `Este relatório conta apenas as mensagens do evento "${dados.eventoNome}". Nenhum outro evento entra neste total.`,
    'Valores calculados pela tabela de preços da Meta por categoria de mensagem (utilidade/autenticação e marketing).',
    `Gerado em ${dados.geradoEm} pelo Credenciei.`,
  ]
  for (const texto of rodape) {
    const linhas = doc.splitTextToSize(texto, largura) as string[]
    doc.text(linhas, margem, y)
    y += linhas.length * 11 + 3
  }

  return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer)
}
