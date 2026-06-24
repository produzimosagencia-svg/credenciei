import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { garantirAbaFornecedor } from '@/lib/google-sheets'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const eventoId = formData.get('evento_id') as string
    const nome = formData.get('nome') as string
    const emailContato = (formData.get('email_contato') as string) || null
    const qtdStr = formData.get('quantidade_estimada') as string
    const quantidade_estimada = qtdStr ? parseInt(qtdStr) : null

    if (!eventoId || !nome) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    const { data: fornecedor, error } = await supabaseAdmin
      .from('fornecedores')
      .insert([{ evento_id: eventoId, nome, email_contato: emailContato, quantidade_estimada }])
      .select('id')
      .single()

    if (error || !fornecedor) {
      return NextResponse.json({ error: error?.message ?? 'Erro ao criar' }, { status: 500 })
    }

    // Cria aba na planilha em background
    const { data: evento } = await supabaseAdmin
      .from('eventos')
      .select('spreadsheet_id')
      .eq('id', eventoId)
      .single()

    if (evento?.spreadsheet_id) {
      garantirAbaFornecedor(evento.spreadsheet_id, nome).catch(console.error)
    }

    return NextResponse.json({ id: fornecedor.id })
  } catch (err) {
    console.error('[fornecedor/criar]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
