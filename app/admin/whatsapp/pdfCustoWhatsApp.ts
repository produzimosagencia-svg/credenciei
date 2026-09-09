import type { CustoWhatsAppDoEvento } from '@/lib/actions-whatsapp'
import { formatarBR } from '@/lib/tz'
// Tipo vem do pacote normal (type-only, apagado na compilação — não influencia
// qual arquivo é carregado em runtime). O valor vem do caminho explícito
// logo abaixo, pelo motivo explicado no comentário dentro da função.
import type { jsPDF as JsPDFCtor } from 'jspdf'

/**
 * Monta o PDF de "Extrair custo evento" — o fechamento do gasto de WhatsApp
 * de um evento, pronto pra anexar como comprovante de custo no Financeiro
 * (pedido do Juan, 09/09/2026).
 *
 * `jsPDF`/`jspdf-autotable` chegam por `import()` dinâmico — só entram no
 * bundle de quem de fato clica em "Gerar PDF", igual `xlsx` já faz nas
 * exportações de planilha do sistema.
 */

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const ROTULO_CATEGORIA_META: Record<string, string> = {
  AUTHENTICATION: 'Autenticação',
  MARKETING: 'Marketing',
  UTILITY: 'Utilidade',
}

const LARANJA: [number, number, number] = [255, 74, 15]
const CINZA_TEXTO: [number, number, number] = [51, 65, 85]
const CINZA_CLARO: [number, number, number] = [248, 250, 252]

export async function gerarPdfCustoWhatsApp(dados: CustoWhatsAppDoEvento): Promise<void> {
  /*
   * Caminho explícito do build de NAVEGADOR, e não `import('jspdf')` puro.
   *
   * O `package.json` do jsPDF declara `exports` condicionais com um build
   * para "node" (usa `fs`, não existe no navegador) e outro para "browser".
   * Quando o bundle resolveu a condição errada, `doc.save()` chamava a
   * versão que grava em disco via `fs` — e quebrava com um erro genérico de
   * runtime dentro do modal (relato do Juan, 09/09/2026). O caminho
   * `jspdf/dist/jspdf.es.min.js` aponta direto pro arquivo certo, sem
   * depender de qual condição o bundler escolher.
   */
  const { jsPDF } = await import('jspdf/dist/jspdf.es.min.js') as unknown as { jsPDF: typeof JsPDFCtor }
  const { autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const largura = doc.internal.pageSize.getWidth()
  const margem = 14

  // ─── Cabeçalho ──────────────────────────────────────────────────────────
  doc.setFillColor(...LARANJA)
  doc.rect(0, 0, largura, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text('Custo de WhatsApp — fechamento do evento', margem, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(dados.eventoNome, margem, 21)

  let y = 38

  // ─── Ficha do evento ────────────────────────────────────────────────────
  doc.setTextColor(...CINZA_TEXTO)
  doc.setFontSize(9)
  const linhaFicha = [
    dados.eventoData ? `Data do evento: ${formatarBR(dados.eventoData, 'data')}` : null,
    dados.organizacaoNome ? `Organização: ${dados.organizacaoNome}` : null,
    `Extraído em: ${formatarBR(new Date().toISOString(), 'completo')}`,
  ].filter(Boolean).join('   ·   ')
  doc.text(linhaFicha, margem, y)
  y += 10

  // ─── Os três números que importam ──────────────────────────────────────
  const cartoes: [string, string][] = [
    ['Mensagens enviadas', String(dados.enviados)],
    ['Pessoas atingidas', String(dados.destinatarios)],
    ['Custo total (estimado)', brl(dados.custoTotal)],
  ]
  const larguraCartao = (largura - margem * 2 - 8) / 3
  cartoes.forEach(([rotulo, valor], i) => {
    const x = margem + i * (larguraCartao + 4)
    doc.setFillColor(...CINZA_CLARO)
    doc.roundedRect(x, y, larguraCartao, 20, 2, 2, 'F')
    doc.setTextColor(120, 120, 130)
    doc.setFontSize(7.5)
    doc.text(rotulo.toUpperCase(), x + 4, y + 7)
    doc.setTextColor(...CINZA_TEXTO)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.text(valor, x + 4, y + 15.5)
    doc.setFont('helvetica', 'normal')
  })
  y += 30

  // ─── Por tipo de mensagem ───────────────────────────────────────────────
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...CINZA_TEXTO)
  doc.text('Por tipo de mensagem', margem, y)
  y += 3

  autoTable(doc, {
    startY: y,
    margin: { left: margem, right: margem },
    head: [['Tipo', 'Enviadas', 'Custo estimado']],
    body: dados.porTipo.map(t => [t.rotulo, String(t.enviados), brl(t.custo)]),
    foot: [['Total', String(dados.enviados), brl(dados.custoTotal)]],
    theme: 'striped',
    headStyles: { fillColor: LARANJA, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [30, 30, 30], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, textColor: CINZA_TEXTO },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  })

  // ─── Por categoria da Meta ──────────────────────────────────────────────
  // `lastAutoTable` vem anexado ao doc pelo plugin — é a única forma de saber
  // onde a tabela anterior terminou pra continuar o layout logo abaixo.
  const y2 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Por categoria (tabela de preço da Meta)', margem, y2)

  autoTable(doc, {
    startY: y2 + 3,
    margin: { left: margem, right: margem },
    head: [['Categoria', 'Enviadas', 'Custo estimado']],
    body: dados.porCategoria.map(c => [ROTULO_CATEGORIA_META[c.categoria] ?? c.categoria, String(c.enviados), brl(c.custo)]),
    theme: 'striped',
    headStyles: { fillColor: [71, 85, 105], textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, textColor: CINZA_TEXTO },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  })

  // ─── Rodapé — a ressalva que evita confundir isto com a fatura da Meta ──
  const paginas = doc.getNumberOfPages()
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p)
    const alturaPagina = doc.internal.pageSize.getHeight()
    doc.setFontSize(7)
    doc.setTextColor(150, 150, 150)
    doc.text(
      'Valores estimados pela tabela de preço da Meta por categoria de template — não substitui a fatura oficial da Meta.',
      margem, alturaPagina - 8,
    )
    doc.text(`Credenciei · página ${p} de ${paginas}`, largura - margem, alturaPagina - 8, { align: 'right' })
  }

  const nomeArquivo = `Custo WhatsApp - ${dados.eventoNome}`.replace(/[\\/:*?"<>|]/g, '').slice(0, 120)
  doc.save(`${nomeArquivo}.pdf`)
}
