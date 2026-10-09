import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos, veTodosEventos } from '@/lib/permissions'
import { eventoUsaEscalaPorDia, diasDaEscalaDoEvento } from '@/lib/escala'
import { rotuloDoDia, ROTULO_FASE } from '@/lib/escala-regras'

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

  const eventoId = setor.evento_id as string
  const usaEscala = await eventoUsaEscalaPorDia(eventoId)
  const todosOsDias = usaEscala ? await diasDaEscalaDoEvento(eventoId) : []
  // TODOS os dias do evento (Juan: "10 dias no evento, então vai ser 10 colunas").
  const dias = todosOsDias
  const colunasDeDia = dias.map(d => {
    const r = rotuloDoDia(d.data)
    return `${r.curto} ${r.semanaCurta} · ${ROTULO_FASE[d.fase]}`
  })

  const cabecalho = ['Nome', 'CPF', 'Telefone', 'Cargo', 'Cidade', 'Chave PIX', ...colunasDeDia]
  const equipe = XLSX.utils.aoa_to_sheet([cabecalho])
  equipe['!cols'] = cabecalho.map((c, i) => ({ wch: i < 6 ? [34, 16, 18, 20, 20, 26][i] : Math.max(16, c.length + 2) }))

  const instrucoes = [
    ['Como preencher'],
    [''],
    [`Evento: ${evento?.nome ?? ''}`],
    [`Fornecedor: ${setor.nome}`],
    [''],
    ['Uma pessoa por linha, na aba "Equipe".'],
    ['Nome, CPF, Telefone (com DDD — é por ele que a credencial chega no WhatsApp) e Cidade: obrigatórios. Cargo e Chave PIX: opcionais.'],
    ...(colunasDeDia.length
      ? [
          [''],
          ['DIAS DE TRABALHO — uma coluna para cada dia do evento:'],
          ['   X ou SIM na coluna do dia = a pessoa trabalha nesse dia.'],
          ['   Vazio = não trabalha nesse dia.'],
          ['   Todas as colunas marcadas = trabalha todos os dias.'],
          ['Quem ficar sem nenhum dia marcado não é importado. Os dias marcados entram já aprovados, respeitando o limite de pessoas por dia do setor.'],
        ]
      : []),
    [''],
    ['Não mude o nome das colunas e não deixe linha de exemplo: toda linha com nome é cadastrada.'],
  ]
  const comoPreencher = XLSX.utils.aoa_to_sheet(instrucoes)
  comoPreencher['!cols'] = [{ wch: 110 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, equipe, 'Equipe')
  XLSX.utils.book_append_sheet(wb, comoPreencher, 'Como preencher')
  const arquivo = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

  const nomeArquivo = `modelo-equipe-${String(setor.nome).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'setor'}.xlsx`
  return new NextResponse(new Uint8Array(arquivo), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}
