import { NextRequest, NextResponse, after } from 'next/server'
import { adicionarFuncionarioNaPlanilha } from '@/lib/google-sheets'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos, ehMaster } from '@/lib/permissions'
import { sincronizarAgendamentos } from '@/lib/mensagens'

type FuncionarioRow = {
  nome: string
  cpf: string
  telefone: string
  chavePix?: string
  empresa: string
  cargo: string
  valor?: string
}

export async function POST(request: NextRequest) {
  try {
    const perfil = await getPerfil()
    if (!perfil || !podeGerenciarEventos(perfil.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const { fornecedorId, funcionarios }: { fornecedorId: string; funcionarios: FuncionarioRow[] } = await request.json()

    if (!fornecedorId || !Array.isArray(funcionarios) || funcionarios.length === 0) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    // Busca o fornecedor (setor) e o evento para pegar o spreadsheet_id
    const { data: fornecedor } = await supabaseAdmin
      .from('fornecedores')
      .select('*, eventos(id, spreadsheet_id, nome, organizacao_id)')
      .eq('id', fornecedorId)
      .single()

    if (!fornecedor) {
      return NextResponse.json({ error: 'Fornecedor/Setor não encontrado' }, { status: 404 })
    }

    const evento = fornecedor.eventos as any

    // Isolamento por organização: só master ou admin da mesma org do evento
    if (!ehMaster(perfil.role) && evento?.organizacao_id !== perfil.organizacao_id) {
      return NextResponse.json({ error: 'Sem permissão sobre este fornecedor/setor' }, { status: 403 })
    }
    const spreadsheetId = evento?.spreadsheet_id
    const eventoId = evento?.id ?? fornecedor.evento_id

    // Prepara os registros com CPF e telefone limpos. O funcionário já fica
    // no setor certo via fornecedorId (a coluna "Empresa/Setor" da planilha
    // vira só o campo "empresa" — não cria setores novos).
    const payload = funcionarios.map(f => {
      const valor = parseFloat(String(f.valor ?? '').replace(',', '.'))
      return {
        nome: f.nome?.trim(),
        cpf: String(f.cpf ?? '').replace(/\D/g, ''),
        telefone: String(f.telefone ?? '').replace(/\D/g, ''),
        chave_pix: f.chavePix?.trim() || null,
        empresa: f.empresa?.trim() || fornecedor.nome,
        cargo: f.cargo?.trim() ?? '',
        valor_receber: Number.isFinite(valor) && valor > 0 ? valor : 0,
        fornecedor_id: fornecedorId,
      }
    }).filter(f => f.nome && f.cpf)

    if (payload.length === 0) {
      return NextResponse.json({ error: 'Nenhum funcionário válido encontrado' }, { status: 400 })
    }

    // Insere em lote no Supabase
    const { data: inseridos, error } = await supabaseAdmin
      .from('funcionarios')
      .insert(payload)
      .select('id, nome, cpf, telefone, empresa, cargo, chave_pix, valor_receber, qr_token')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Sincroniza com Google Sheets (aguarda antes de retornar)
    if (spreadsheetId && inseridos) {
      try {
        for (const f of inseridos) {
          await adicionarFuncionarioNaPlanilha(spreadsheetId, fornecedor.nome, {
            nome: f.nome,
            cpf: f.cpf,
            telefone: f.telefone,
            empresa: f.empresa,
            cargo: f.cargo,
            chavePix: f.chave_pix,
            valorReceber: f.valor_receber,
            qr_token: f.qr_token,
          })
        }
      } catch (e) {
        console.error('[import/funcionarios] Erro ao sincronizar planilha:', e)
      }
    }

    // Agenda os lembretes de WhatsApp pra quem acabou de entrar (uma vez pro lote, não por linha)
    if (inseridos?.length) {
      after(() => sincronizarAgendamentos(eventoId).catch(console.error))
    }

    return NextResponse.json({ ok: true, total: inseridos?.length ?? 0 })
  } catch (err) {
    console.error('[import/funcionarios]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
