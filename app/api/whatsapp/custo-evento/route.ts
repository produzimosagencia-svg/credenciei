import { NextResponse } from 'next/server'
import { getPerfil } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { templatesAprovados, custoWhatsAppDoEvento } from '@/lib/whatsapp-painel'
import { montarPdfCustoWhatsApp } from '@/lib/relatorio-custo-whatsapp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O PDF de custo de WhatsApp de um evento, pronto, como arquivo.
 *
 * ─── POR QUE UMA ROTA, E NÃO UMA SERVER ACTION ───────────────────────────────
 *
 * Este relatório já foi uma Server Action, e passou dois dias falhando com a
 * mesma mensagem: "An error occurred in the Server Components render. The
 * specific message is omitted in production builds". Em produção o Next
 * mascara TODA exceção que sai de uma Server Action — o navegador nunca
 * recebe a causa, só um digest que fica no log. Consertar às cegas virou
 * chute atrás de chute enquanto a operação esperava.
 *
 * Uma rota HTTP comum não tem essa máscara: o que der errado volta como
 * status + texto, e aparece na tela de quem clicou. Além disso o PDF é
 * montado AQUI, no servidor, e desce pronto — o navegador só salva o arquivo.
 * Isso apaga de uma vez os dois outros pontos frágeis do caminho antigo: o
 * `import()` dinâmico do jsPDF no navegador e a serialização do payload de
 * volta pelo protocolo do React.
 */
export async function GET(request: Request) {
  const perfil = await getPerfil()
  if (!perfil) {
    return new NextResponse('Sua sessão expirou. Entre no sistema de novo.', { status: 401 })
  }
  if (!ehMaster(perfil.role)) {
    return new NextResponse('Apenas o master pode extrair o relatório de WhatsApp.', { status: 403 })
  }

  const eventoId = new URL(request.url).searchParams.get('evento')
  if (!eventoId) {
    return new NextResponse('Escolha o evento.', { status: 400 })
  }

  try {
    const templates = await templatesAprovados()
    const dados = await custoWhatsAppDoEvento(eventoId, templates)
    if (!dados) return new NextResponse('Não encontrei esse evento.', { status: 404 })
    if (!dados.enviados) {
      return new NextResponse('Este evento não tem nenhuma mensagem enviada ainda.', { status: 409 })
    }

    const pdf = await montarPdfCustoWhatsApp(dados)
    // Nome do arquivo com o evento, pra não virar uma pasta de
    // "relatorio (3).pdf" quando forem vários eventos.
    const apelido = dados.eventoNome
      // ̀-ͯ = os acentos que o NFD separa das letras.
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
      .slice(0, 60) || 'evento'

    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="custo-whatsapp-${apelido}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    const bruta = e instanceof Error ? e.message : String(e)
    console.error('[custo-whatsapp-pdf] falhou', { eventoId, erro: bruta, stack: e instanceof Error ? e.stack : null })
    // A mensagem real desce pro navegador de propósito: quem chega aqui é
    // master, e uma mensagem vaga foi exatamente o que travou este relatório
    // por dois dias.
    return new NextResponse(`Não consegui montar o relatório: ${bruta}`, { status: 500 })
  }
}
