import { NextRequest, NextResponse } from 'next/server'
import { getPerfil } from '@/lib/supabase-server'
import { podeGerenciarEventos } from '@/lib/permissions'
import { importarFuncionarios } from '@/lib/importacao'
import type { LinhaPlanilha } from '@/lib/planilha'

// Lotes grandes (100+): a resposta volta rápido (só o insert), mas o espelho
// no Google Sheets roda depois dela (after) e precisa desta folga pra concluir.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const perfil = await getPerfil()
    if (!perfil || !podeGerenciarEventos(perfil.role)) {
      return NextResponse.json({ error: 'Você não tem permissão para importar funcionários.' }, { status: 403 })
    }

    const { fornecedorId, funcionarios }: { fornecedorId: string; funcionarios: LinhaPlanilha[] } = await request.json()

    const res = await importarFuncionarios(
      { role: perfil.role, organizacao_id: perfil.organizacao_id ?? null },
      fornecedorId,
      funcionarios
    )

    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })
    return NextResponse.json(res)
  } catch (err) {
    console.error('[import/funcionarios]', err)
    return NextResponse.json({ error: 'Não foi possível concluir a importação. Tente de novo em alguns instantes.' }, { status: 500 })
  }
}
