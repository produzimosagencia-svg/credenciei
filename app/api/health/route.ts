import { NextResponse } from 'next/server'

/**
 * O "estou vivo" da própria API — é o que `checarApi()` em
 * lib/performance-checks.ts chama de fora (self-ping via HTTP), pra medir
 * exatamente a mesma latência que qualquer outro cliente veria.
 *
 * De propósito sem tocar em banco/storage/integração nenhuma: cada um
 * desses já tem o próprio check (lib/performance-checks.ts). Se esta rota
 * checasse tudo, o "API offline" ficaria indistinguível de "banco offline".
 *
 * `commit`/`ambiente` — análise de infraestrutura de 02/10/2026: sem isto,
 * "o que está no ar agora" só dava pra responder abrindo o painel da
 * Vercel. `VERCEL_GIT_COMMIT_SHA`/`VERCEL_ENV` são injetadas sozinhas pela
 * Vercel em todo build, não precisam de configuração nenhuma. Mesma ideia
 * do `desdeQuando` que a API mobile já tem em `/saude` (criado depois do
 * incidente de 23/09/2026 — um deploy que não subiu de verdade e ninguém
 * percebeu), adaptada pro jeito da Vercel: aqui o sinal confiável é o SHA
 * do commit, não o tempo de processo vivo (função serverless reinicia o
 * tempo todo, "há quanto tempo está de pé" não diz nada sobre deploy).
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
    ambiente: process.env.VERCEL_ENV ?? 'local',
  })
}
