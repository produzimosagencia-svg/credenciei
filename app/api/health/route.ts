import { NextResponse } from 'next/server'

/**
 * O "estou vivo" da própria API — é o que `checarApi()` em
 * lib/performance-checks.ts chama de fora (self-ping via HTTP), pra medir
 * exatamente a mesma latência que qualquer outro cliente veria.
 *
 * De propósito sem tocar em banco/storage/integração nenhuma: cada um
 * desses já tem o próprio check (lib/performance-checks.ts). Se esta rota
 * checasse tudo, o "API offline" ficaria indistinguível de "banco offline".
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ status: 'ok', timestamp: new Date().toISOString() })
}
