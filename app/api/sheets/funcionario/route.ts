import { NextRequest, NextResponse } from 'next/server'
import { sincronizarFuncionarioNaPlanilha } from '@/lib/actions'

export async function POST(req: NextRequest) {
  const { funcionarioId } = await req.json()
  if (!funcionarioId) return NextResponse.json({ error: 'Missing funcionarioId' }, { status: 400 })
  await sincronizarFuncionarioNaPlanilha(funcionarioId)
  return NextResponse.json({ ok: true })
}
