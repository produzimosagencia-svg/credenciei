import { NextRequest, NextResponse } from 'next/server'
import { sincronizarFuncionarioNaPlanilha } from '@/lib/actions'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos, ehMaster } from '@/lib/permissions'

/**
 * Reescreve a linha de um funcionário na planilha do Google.
 *
 * Nasceu sem autenticação e aceitando qualquer `funcionarioId`, o que permitia
 * a qualquer pessoa na internet escrever na planilha de qualquer organização.
 * Agora exige sessão com permissão de gestão E que o funcionário pertença à
 * organização de quem chama.
 */
export async function POST(req: NextRequest) {
  const perfil = await getPerfil()
  if (!perfil || !podeGerenciarEventos(perfil.role)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { funcionarioId } = await req.json()
  if (!funcionarioId) return NextResponse.json({ error: 'Missing funcionarioId' }, { status: 400 })

  // Isolamento por organização: o id vem do cliente, então precisa ser provado.
  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('id, fornecedores!inner(eventos!inner(organizacao_id))')
    .eq('id', funcionarioId)
    .single()
  if (!func) return NextResponse.json({ error: 'Funcionário não encontrado' }, { status: 404 })

  const org = (func.fornecedores as unknown as { eventos: { organizacao_id: string | null } }).eventos.organizacao_id
  if (!ehMaster(perfil.role) && org !== perfil.organizacao_id) {
    return NextResponse.json({ error: 'Sem permissão sobre este funcionário' }, { status: 403 })
  }

  await sincronizarFuncionarioNaPlanilha(funcionarioId)
  return NextResponse.json({ ok: true })
}
