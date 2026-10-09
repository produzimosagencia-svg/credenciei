import { NextResponse } from 'next/server'
import { exigirAcessoAoEvento } from '@/lib/relatorios-acesso'
import { dadosEntregaValor } from '@/lib/entrega-valor'
import { montarPdfEntregaValor } from '@/lib/entrega-valor-pdf'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O PDF de entrega de valor do evento, pronto para baixar (pedido do Juan, 09/10/2026). Rota HTTP, não Server
 * Action — mesmo motivo do PDF de orçamento: em produção o Next esconde o erro de uma Server Action, e este
 * arquivo vai para o cliente final. Só para quem gerencia o evento inteiro (o supervisor não vê o evento todo).
 */
export async function GET(request: Request) {
  const eventoId = new URL(request.url).searchParams.get('evento') ?? ''
  if (!eventoId) return new NextResponse('Escolha o evento.', { status: 400 })

  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) return new NextResponse(acesso.erro, { status: 403 })
  if (acesso.setoresPermitidos) {
    return new NextResponse('O relatório de entrega de valor é só para quem gerencia o evento inteiro.', { status: 403 })
  }

  try {
    const dados = await dadosEntregaValor(eventoId)
    if (!dados) return new NextResponse('Evento não encontrado.', { status: 404 })
    const pdf = await montarPdfEntregaValor(dados)
    const nome = dados.eventoNome.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase()
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="entrega-de-valor-${nome || 'evento'}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[entrega-valor]', e)
    return new NextResponse('Não foi possível gerar o PDF agora. Tente de novo em instantes.', { status: 500 })
  }
}
