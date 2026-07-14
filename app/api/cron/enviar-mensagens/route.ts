import { NextRequest, NextResponse } from 'next/server'
import { processarFilaMensagens } from '@/lib/mensagens'

// Fallback do worker da VPS: Vercel Cron bate aqui 1x/minuto (ver vercel.json).
// Também serve pra disparo manual (ex: futuro botão "reenviar agora" no admin).
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  }

  const resultado = await processarFilaMensagens()
  return NextResponse.json(resultado)
}
