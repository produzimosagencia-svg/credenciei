import { NextRequest, NextResponse } from 'next/server'
import { sincronizarRegistroNaPlanilha } from '@/lib/actions'

export async function POST(req: NextRequest) {
  const { funcionarioId, eventoId, tipo } = await req.json()
  if (!funcionarioId || !eventoId || !tipo) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  await sincronizarRegistroNaPlanilha(funcionarioId, eventoId, tipo)
  return NextResponse.json({ ok: true })
}
