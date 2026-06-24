import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { adicionarFuncionarioNaPlanilha } from '@/lib/google-sheets'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type FuncionarioRow = {
  nome: string
  cpf: string
  telefone: string
  email: string
  empresa: string
  cargo: string
}

export async function POST(request: NextRequest) {
  try {
    const { fornecedorId, funcionarios }: { fornecedorId: string; funcionarios: FuncionarioRow[] } = await request.json()

    if (!fornecedorId || !Array.isArray(funcionarios) || funcionarios.length === 0) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    // Busca o fornecedor e o evento para pegar o spreadsheet_id
    const { data: fornecedor } = await supabaseAdmin
      .from('fornecedores')
      .select('*, eventos(spreadsheet_id, nome)')
      .eq('id', fornecedorId)
      .single()

    if (!fornecedor) {
      return NextResponse.json({ error: 'Fornecedor não encontrado' }, { status: 404 })
    }

    const evento = fornecedor.eventos as any
    const spreadsheetId = evento?.spreadsheet_id

    // Prepara os registros com CPF e telefone limpos
    const payload = funcionarios.map(f => ({
      nome: f.nome?.trim(),
      cpf: String(f.cpf ?? '').replace(/\D/g, ''),
      telefone: String(f.telefone ?? '').replace(/\D/g, ''),
      email: f.email?.trim() ?? '',
      empresa: f.empresa?.trim() ?? fornecedor.nome,
      cargo: f.cargo?.trim() ?? '',
      fornecedor_id: fornecedorId,
    })).filter(f => f.nome && f.cpf)

    if (payload.length === 0) {
      return NextResponse.json({ error: 'Nenhum funcionário válido encontrado' }, { status: 400 })
    }

    // Insere em lote no Supabase
    const { data: inseridos, error } = await supabaseAdmin
      .from('funcionarios')
      .insert(payload)
      .select('id, nome, cpf, telefone, email, empresa, cargo, qr_token')

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
            email: f.email,
            empresa: f.empresa,
            cargo: f.cargo,
            qr_token: f.qr_token,
          })
        }
      } catch (e) {
        console.error('[import/funcionarios] Erro ao sincronizar planilha:', e)
      }
    }

    return NextResponse.json({ ok: true, total: inseridos?.length ?? 0 })
  } catch (err) {
    console.error('[import/funcionarios]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
