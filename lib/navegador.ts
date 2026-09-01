/**
 * A pessoa está no navegador embutido de outro aplicativo?
 *
 * O link chega pelo WhatsApp, e tocar nele abre um navegador de dentro do
 * próprio WhatsApp. Essa WebView não recebe as permissões do sistema —
 * localização e CÂMERA simplesmente não respondem, nem com sucesso nem com
 * erro. Já derrubou duas coisas em produção:
 *
 *   • o registro por foto do meio (ficava girando pra sempre);
 *   • o scanner de QR do portão (quadrado preto, sem explicação nenhuma).
 *
 * Não dá para consertar isso de dentro da página: a permissão é do aplicativo
 * hospedeiro. O que dá é reconhecer onde estamos e dizer à pessoa o caminho —
 * abrir num navegador de verdade — antes de ela perder tempo tentando.
 *
 * Mora aqui, e não em cada tela, porque as duas precisam concordar sobre o
 * que é "navegador embutido": duas listas separadas divergiriam no primeiro
 * aplicativo novo que aparecesse, e uma das telas voltaria a falhar calada.
 */
export function emNavegadorEmbutido(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // `; wv` marca WebView no Android; os demais são os apps que mais aparecem.
  return /;\s*wv\)|WhatsApp|FB_IAB|FBAN|FBAV|Instagram|Line\/|MicroMessenger/i.test(ua)
}

/**
 * Copia um texto, com uma saída para navegador embutido antigo.
 *
 * A Clipboard API não existe em toda WebView — e é justamente na WebView que
 * este botão mais importa, porque é lá que a pessoa precisa levar o link para
 * outro navegador. O campo temporário funciona onde a API moderna não existe.
 */
export async function copiarTexto(texto: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
      return true
    }
    const temp = document.createElement('textarea')
    temp.value = texto
    temp.style.position = 'fixed'
    temp.style.opacity = '0'
    document.body.appendChild(temp)
    temp.focus()
    temp.select()
    document.execCommand('copy')
    document.body.removeChild(temp)
    return true
  } catch {
    return false
  }
}
