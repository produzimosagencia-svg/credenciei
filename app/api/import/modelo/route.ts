import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos, veTodosEventos } from '@/lib/permissions'
import { eventoUsaEscalaPorDia, diasDaEscalaDoEvento } from '@/lib/escala'
import { rotuloDoDia, ROTULO_FASE } from '@/lib/escala-regras'
import { diaBRT } from '@/lib/janelas'

/**
 * O MODELO da planilha de equipe, gerado na hora PARA ESTE SETOR (pedido do Juan, 09/10/2026: "precisa ter um
 * padrão de acordo com o modelo do evento, das perguntas que tem no formulário que o funcionário preenche").
 *
 * As colunas são as perguntas do formulário público, na mesma ordem: CPF, Nome completo, Telefone, Cidade onde
 * mora e Chave PIX — e, em evento com escala por dia, UMA COLUNA POR DIA de trabalho (de hoje em diante, como no
 * formulário), pra marcar com X. Os nomes batem com o que `lerPlanilhaDeEquipe` (lib/planilha.ts) reconhece.
 * Substitui o arquivo fixo public/modelo-importacao.xlsx, que tinha Cargo e Valor (o formulário não pergunta) e
 * não tinha os dias.
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
  const hoje = diaBRT()
  const dias = todosOsDias.some(d => d.data >= hoje) ? todosOsDias.filter(d => d.data >= hoje) : todosOsDias
  const colunasDeDia = dias.map(d => {
    const r = rotuloDoDia(d.data)
    return `${r.curto} ${r.semanaCurta} · ${ROTULO_FASE[d.fase]}`
  })

  const cabecalho = ['CPF', 'Nome completo', 'Telefone', 'Cidade onde mora', 'Chave PIX', ...colunasDeDia]
  const equipe = XLSX.utils.aoa_to_sheet([cabecalho])
  equipe['!cols'] = cabecalho.map((c, i) => ({ wch: i < 5 ? [16, 34, 18, 22, 26][i] : Math.max(14, c.length + 2) }))

  const instrucoes = [
    ['Como preencher'],
    [''],
    [`Evento: ${evento?.nome ?? ''}`],
    [`Fornecedor: ${setor.nome}`],
    [''],
    ['Uma pessoa por linha, na aba "Equipe". As colunas são as mesmas perguntas do formulário de cadastro.'],
    ['CPF, Nome completo, Telefone e Cidade onde mora: obrigatórios. Chave PIX: opcional.'],
    ['Telefone com DDD (é por ele que a credencial chega no WhatsApp).'],
    ...(colunasDeDia.length
      ? [
          ['Dias de trabalho: marque X na coluna de cada dia em que a pessoa vai trabalhar (pelo menos um).'],
          ['Quem ficar sem nenhum dia marcado não é importado. Os dias marcados entram já aprovados, respeitando o limite de pessoas por dia do setor.'],
        ]
      : []),
    ['Não mude o nome das colunas.'],
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
