import { NextResponse } from 'next/server'
import { getPerfil } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { orcamentoPorId } from '@/lib/orcamentos'
import { montarPdfOrcamento } from '@/lib/orcamentos-pdf'
import { numeroOrcamento } from '@/lib/orcamentos-constantes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * O PDF de um orçamento, pronto, como arquivo pra baixar.
 *
 * Rota HTTP, não Server Action — mesmo motivo de app/api/whatsapp/custo-evento:
 * em produção o Next mascara toda exceção que sai de uma Server Action, e
 * este PDF vai direto pro cliente final, então um erro silencioso aqui é
 * pior que em qualquer outro lugar do sistema.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) {
    return new NextResponse('Sua sessão expirou. Entre no sistema de novo.', { status: 401 })
  }
  if (!ehMaster(perfil.role)) {
    return new NextResponse('Apenas o master pode gerar orçamentos.', { status: 403 })
  }

  const { id } = await params
  try {
    const orcamento = await orcamentoPorId(id)
    if (!orcamento) return new NextResponse('Não encontrei esse orçamento.', { status: 404 })

    const pdf = await montarPdfOrcamento(orcamento)
    return new NextResponse(pdf as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="orcamento-${numeroOrcamento(orcamento.numero).slice(1)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    const bruta = e instanceof Error ? e.message : String(e)
    console.error('[orcamentos-pdf] falhou', { id, erro: bruta })
    return new NextResponse(`Não consegui montar o orçamento: ${bruta}`, { status: 500 })
  }
}
