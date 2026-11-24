import { NextRequest, NextResponse } from 'next/server'
import { sincronizarRegistroNaPlanilha } from '@/lib/internos-servidor'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos, ehMaster } from '@/lib/permissions'

/**
 * Escreve uma batida na planilha do Google.
 *
 * Mesma correção da rota irmã: sem autenticação, qualquer um escrevia linhas
 * falsas de presença na planilha de qualquer organização — e planilha é o que
 * o cliente usa para conferir pagamento.
 */
export async function POST(req: NextRequest) {
  const perfil = await getPerfil()
  if (!perfil || !podeGerenciarEventos(perfil)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { funcionarioId, eventoId, tipo } = await req.json()
  if (!funcionarioId || !eventoId || !tipo) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }
  if (tipo !== 'entrada' && tipo !== 'saida') {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  }

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('id, organizacao_id').eq('id', eventoId).single()
  if (!evento) return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 })
  if (!ehMaster(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
    return NextResponse.json({ error: 'Sem permissão sobre este evento' }, { status: 403 })
  }

  /*
   * O funcionário também tem que ser DESTE evento (auditoria de segurança,
   * 24/11/2026). Conferir só o evento deixava um admin mandar o id de um
   * funcionário de outra organização e ver o nome/CPF dele aparecer na
   * planilha do próprio evento.
   */
  const { data: func } = await supabaseAdmin
    .from('funcionarios').select('id, fornecedores!inner(evento_id)')
    .eq('id', funcionarioId).eq('fornecedores.evento_id', eventoId).maybeSingle()
  if (!func) return NextResponse.json({ error: 'Funcionário não pertence a este evento' }, { status: 403 })

  await sincronizarRegistroNaPlanilha(funcionarioId, eventoId, tipo)
  return NextResponse.json({ ok: true })
}
