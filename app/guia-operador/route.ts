import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const dynamic = 'force-dynamic'

/**
 * O guia do operador de portão (a documentação animada) como página PÚBLICA: qualquer
 * pessoa com o link abre, sem conta (decisão do Juan, 07/10/2026 — serve pra
 * mandar a quem ainda vai ser operador de portão). Por isso `/guia-operador` está na
 * lista de rotas abertas do proxy.ts.
 *
 * Também é o que a tela "Tutorial operador" (menu da foto de perfil) mostra
 * num iframe do mesmo site — por isso o X-Frame-Options daqui é SAMEORIGIN, e
 * não o DENY do resto (ver next.config.ts).
 *
 * O arquivo mora em `conteudo/`. `?tema=claro|escuro` acompanha o tema do
 * sistema quando embutido; aberto direto, o guia segue o tema do aparelho.
 */
export async function GET(req: Request) {
  const tema = new URL(req.url).searchParams.get('tema')
  const atributo = tema === 'escuro' ? ' data-theme="dark"' : tema === 'claro' ? ' data-theme="light"' : ''
  const guia = await readFile(path.join(process.cwd(), 'conteudo', 'guia-operador-portao.html'), 'utf8')
  const html =
    `<!doctype html><html lang="pt-BR"${atributo}><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${guia}</body></html>`

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  })
}
