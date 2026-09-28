/**
 * Identidade visual compartilhada dos relatórios .xlsx gerados no
 * NAVEGADOR (exceljs, via import dinâmico) — cores e a logo.
 *
 * Pedido do Juan (28/09/2026): "todo relatório que o sistema puxar, quero
 * que venha com a cara do Credenciei, as cores laranjas e a logo
 * aparecendo". Existia uma cópia quase idêntica destas cores em cada
 * arquivo que gera um .xlsx (lib/relatorio-excel.ts,
 * app/admin/auditoria/FiltrosAuditoria.tsx) — um lugar só evita a próxima
 * divergência, e é onde a logo passa a morar, porque nenhum dos dois tinha.
 *
 * Só serve pra exportação gerada NO NAVEGADOR. A gerada no SERVIDOR
 * (lib/actions-gastos.ts, PDFs em lib/orcamentos-pdf.ts e
 * lib/relatorio-custo-whatsapp.ts) lê a logo do disco com `fs`, não busca
 * — são dois ambientes, cada um com o jeito certo de carregar o arquivo.
 */
export const COR_MARCA = 'FFFF4A0F'
export const COR_ACENTO = 'FFE33C06'
export const COR_FAIXA_CLARA = 'FFFFF2EC'
export const COR_BORDA = 'FFE5E1DF'
export const COR_TEXTO = 'FF201E1D'
export const BRANCO = 'FFFFFFFF'

const bordaFina = { style: 'thin' as const, color: { argb: COR_BORDA } }
export const BORDA_CELULA = { top: bordaFina, left: bordaFina, bottom: bordaFina, right: bordaFina }

/**
 * Busca os BYTES da logo — uma vez só por exportação, mesmo quando ela gera
 * vários workbooks (ex.: um .xlsx por setor, dentro de um .zip): o mesmo
 * buffer é reaproveitado em cada `adicionarLogoNaAba`, sem baixar de novo a
 * cada arquivo.
 *
 * `null` quando a busca falha (rede lenta, arquivo movido) — o chamador
 * simplesmente pula a logo nesse caso; sem logo é melhor que sem relatório,
 * mesmo princípio já usado em lib/orcamentos-pdf.ts pro PDF de orçamento.
 */
export async function carregarLogoBuffer(): Promise<ArrayBuffer | null> {
  try {
    const resposta = await fetch('/marca/iso-laranja.png')
    if (!resposta.ok) throw new Error(`status ${resposta.status}`)
    return await resposta.arrayBuffer()
  } catch (e) {
    console.error('[marca-relatorio] logo não carregou', e)
    return null
  }
}

/**
 * Registra a logo NESTE workbook (cada workbook precisa da própria
 * chamada a `wb.addImage`, mesmo reaproveitando o buffer já baixado) e
 * posiciona no canto superior esquerdo da linha 1 desta aba — os
 * chamadores começam o conteúdo de verdade (faixa colorida do título) na
 * LINHA 2, deixando a 1 só pra logo, em fundo branco (por isso a versão
 * LARANJA do símbolo, não a branca: aqui ela não fica sobre uma faixa
 * colorida).
 */
export function adicionarLogoNaAba(
  wb: import('exceljs').Workbook,
  ws: import('exceljs').Worksheet,
  bufferLogo: ArrayBuffer | null,
): void {
  if (bufferLogo) {
    const imageId = wb.addImage({ buffer: bufferLogo, extension: 'png' })
    ws.addImage(imageId, { tl: { col: 0.15, row: 0.15 }, ext: { width: 26, height: 26 } })
  }
  ws.getRow(1).height = 28
}
