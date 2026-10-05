import { NextResponse } from 'next/server'
import { midiaCompartilhada } from '@/lib/respostas-compartilhadas'

export const dynamic = 'force-dynamic'

/**
 * Entrega a foto, figurinha, áudio, vídeo ou documento de uma mensagem do link
 * compartilhado. Toda a conferência de acesso mora em `midiaCompartilhada`;
 * qualquer recusa responde 404 igual, para o endereço não servir de sonda.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params
  const midia = await midiaCompartilhada(token, id)
  if (!midia) return new NextResponse('Arquivo indisponível.', { status: 404 })

  /*
   * O arquivo vem de quem escreveu para o número, ou seja, de qualquer pessoa.
   * Só formatos que o navegador exibe sem executar nada abrem na página; o
   * resto (um HTML ou SVG mandado como documento, por exemplo) desce como
   * download, para nunca rodar com o endereço do sistema.
   */
  const exibivel = /^(image\/(jpeg|png|webp|gif)|audio\/[\w.+-]+|video\/[\w.+-]+|application\/pdf)$/.test(midia.mime)
  const cabecalhos = new Headers({
    'Content-Type': exibivel ? midia.mime : 'application/octet-stream',
    // O arquivo de uma mensagem não muda. `private` porque é conteúdo de
    // conversa: só o navegador de quem abriu guarda, nenhum intermediário.
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex',
  })
  if (midia.tamanho) cabecalhos.set('Content-Length', midia.tamanho)
  const nome = midia.nome ? `; filename*=UTF-8''${encodeURIComponent(midia.nome)}` : ''
  cabecalhos.set('Content-Disposition', `${exibivel ? 'inline' : 'attachment'}${nome}`)
  // O leitor de PDF do navegador não abre dentro de sandbox; para o resto a
  // trava extra não custa nada.
  if (midia.mime !== 'application/pdf') cabecalhos.set('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'")
  return new NextResponse(midia.corpo, { headers: cabecalhos })
}
