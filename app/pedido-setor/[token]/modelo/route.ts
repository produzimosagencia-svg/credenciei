import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { montarModeloDeEquipe, nomeDoArquivoModelo } from '@/lib/modelo-equipe'

/**
 * O modelo da planilha de equipe pelo LINK PÚBLICO do pedido de setor (Juan, 13/10/2026: antes de enviar o pedido, o
 * fornecedor é obrigado a baixar o modelo e preencher a equipe — depois de aprovado, o supervisor importa a planilha).
 * Sem login: vale o token do link, como a própria página. O modelo só tem as colunas e os dias do evento, nada de dado
 * de ninguém.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const { data: evento } = await supabaseAdmin.from('eventos').select('id, nome').eq('pedido_setor_token', token).maybeSingle()
  if (!evento) return NextResponse.json({ error: 'Link inválido.' }, { status: 404 })
  const arquivo = await montarModeloDeEquipe({ eventoId: evento.id as string, eventoNome: evento.nome as string, setorNome: null })
  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeDoArquivoModelo(String(evento.nome))}"`,
      'Cache-Control': 'no-store',
    },
  })
}
