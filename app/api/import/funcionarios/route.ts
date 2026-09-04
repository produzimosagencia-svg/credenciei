import { NextRequest, NextResponse } from 'next/server'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos } from '@/lib/permissions'
import { importarFuncionarios } from '@/lib/importacao'
import type { LinhaPlanilha } from '@/lib/planilha'

// Lotes grandes (100+): a resposta volta rápido (só o insert), mas o espelho
// no Google Sheets roda depois dela (after) e precisa desta folga pra concluir.
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const perfil = await getPerfil()
    if (!perfil || (!podeGerenciarEventos(perfil) && perfil.role !== 'supervisor')) {
      return NextResponse.json({ error: 'Você não tem permissão para importar funcionários.' }, { status: 403 })
    }

    const { fornecedorId, funcionarios }: { fornecedorId: string; funcionarios: LinhaPlanilha[] } = await request.json()

    /*
     * O supervisor importa — mas SÓ na própria equipe.
     *
     * O botão passou a aparecer para ele no painel do setor (antes só existia
     * na tela do evento, que ele não enxerga). Sem esta linha, `podeGerenciar
     * Eventos` o barraria e o botão daria 403 sempre; com ela sozinha, ele
     * importaria em qualquer setor da organização, porque `importarFuncionarios`
     * só confere a ORGANIZAÇÃO, não o setor. É a mesma régua de
     * `exigirAcessoFuncionarios`, aplicada aqui.
     *
     * `supervisor_setores` entra na conta: quem cobre vários setores importa
     * em qualquer um dos seus, não só no que está aberto agora.
     */
    if (perfil.role === 'supervisor') {
      const { data: vinculo } = await supabaseAdmin
        .from('supervisor_setores').select('fornecedor_id')
        .eq('perfil_id', perfil.id).eq('fornecedor_id', fornecedorId).maybeSingle()
      if (!vinculo && perfil.fornecedor_id !== fornecedorId) {
        return NextResponse.json({ error: 'Você só pode importar para a sua equipe.' }, { status: 403 })
      }
    }

    const res = await importarFuncionarios(
      { role: perfil.role, organizacao_id: perfil.organizacao_id ?? null },
      fornecedorId,
      funcionarios
    )

    // `ignorados` vai junto também no erro: o caso mais comum de falha é
    // "todos já estavam cadastrados", e é aí que saber QUEM mais importa.
    if (!res.ok) return NextResponse.json({ error: res.error, ignorados: res.ignorados ?? [] }, { status: res.status })
    return NextResponse.json(res)
  } catch (err) {
    console.error('[import/funcionarios]', err)
    return NextResponse.json({ error: 'Não foi possível concluir a importação. Tente de novo em alguns instantes.' }, { status: 500 })
  }
}
