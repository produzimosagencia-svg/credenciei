import { NextRequest, NextResponse } from 'next/server'
import { executarChecagens } from '@/lib/performance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Health-check de todos os serviços do Painel de Performance — 1x/minuto
 * (ver vercel.json), mesmo padrão de autenticação de
 * app/api/cron/enviar-mensagens/route.ts. Cada serviço decide sozinho se já
 * venceu o próprio intervalo (`lib/performance.ts::executarChecagens`), então
 * um cron de 1 minuto serve API/banco a cada 1 min e Gemini/domínio a cada
 * 5 min sem precisar de crons separados.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  try {
    const resultado = await executarChecagens()
    return NextResponse.json(resultado)
  } catch (e) {
    // Ainda sem a migração rodada (supabase/upgrade-performance.sql) — não
    // pode virar erro 500 repetindo no log a cada minuto até alguém notar.
    const erro = e instanceof Error ? e.message : String(e)
    console.error('[performance-check] falhou:', erro)
    return NextResponse.json({ checados: [], pulados: [], erro }, { status: 200 })
  }
}
