import { headers } from 'next/headers'

/**
 * URL pública do sistema, tirada da própria requisição.
 *
 * O link do formulário do setor era montado com
 * `NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'` — o único lugar do
 * sistema com esse fallback (todo o resto cai na URL de produção). Duas
 * consequências reais: em desenvolvimento o botão "copiar link" entregava
 * um endereço que não serve pra mandar pra ninguém, e em produção bastaria
 * a variável não estar configurada na Vercel pra distribuir link de
 * localhost pros funcionários.
 *
 * Lendo do host da requisição, o link fica certo nos dois ambientes sem
 * depender de configuração. `x-forwarded-*` porque a Vercel serve atrás de
 * proxy — sem eles o host viria interno.
 *
 * Só funciona onde existe requisição. O worker de WhatsApp e a sincronia do
 * Sheets rodam fora de uma, e continuam usando a variável de ambiente.
 */
export async function urlDoSite(): Promise<string> {
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host')
  if (host) {
    const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
    return `${protocolo}://${host}`
  }
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'
}
