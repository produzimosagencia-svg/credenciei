import { NextRequest, NextResponse } from 'next/server'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos, veTodosEventos } from '@/lib/permissions'
import { montarModeloDeEquipe, nomeDoArquivoModelo } from '@/lib/modelo-equipe'

/**
 * O MODELO da planilha de equipe, gerado na hora PARA ESTE SETOR (pedido do Juan, 09/10/2026: "precisa ter um
 * padrão de acordo com o modelo do evento, das perguntas que tem no formulário que o funcionário preenche").
 *
 * Colunas (Juan, 09/10/2026, 2ª volta: "CPF, telefone, cargo, cidade, chave Pix e os dias trabalhados... 10 dias no
 * evento, 10 colunas, a data de cada coluna e um X ou um sim"): Nome, CPF, Telefone, Cargo, Cidade, Chave PIX e, em
 * evento com escala por dia, UMA COLUNA POR DIA DO EVENTO (todos, com a data no cabeçalho). X ou SIM = trabalha
 * naquele dia; vazio = não trabalha; tudo marcado = todos os dias. Os nomes batem com o que `lerPlanilhaDeEquipe`
 * (lib/planilha.ts) reconhece. O arquivo fixo public/modelo-importacao.xlsx virou a versão genérica deste.
 */
export async function GET(request: NextRequest) {
  const perfil = await getPerfil()
  if (!perfil || (!podeGerenciarEventos(perfil) && perfil.role !== 'supervisor')) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }
  const fornecedorId = request.nextUrl.searchParams.get('fornecedor') ?? ''
  const { data: setor } = await supabaseAdmin
    .from('fornecedores').select('id, nome, evento_id, eventos(nome, organizacao_id)').eq('id', fornecedorId).maybeSingle()
  if (!setor) return NextResponse.json({ error: 'Fornecedor não encontrado.' }, { status: 404 })
  const evento = setor.eventos as unknown as { nome?: string; organizacao_id?: string | null } | null
  if (perfil.role === 'supervisor') {
    const { data: vinculo } = await supabaseAdmin.from('supervisor_setores').select('fornecedor_id')
      .eq('perfil_id', perfil.id).eq('fornecedor_id', fornecedorId).maybeSingle()
    if (!vinculo && perfil.fornecedor_id !== fornecedorId) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  } else if (!veTodosEventos(perfil) && evento?.organizacao_id !== perfil.organizacao_id) {
    return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 })
  }

  const arquivo = await montarModeloDeEquipe({ eventoId: setor.evento_id as string, eventoNome: evento?.nome ?? '', setorNome: setor.nome as string })
  const nomeArquivo = nomeDoArquivoModelo(String(setor.nome))
  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}
