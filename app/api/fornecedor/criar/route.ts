import { NextRequest, NextResponse } from 'next/server'
import { garantirAbaFornecedor } from '@/lib/google-sheets'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos, ehMaster } from '@/lib/permissions'

export async function POST(request: NextRequest) {
  try {
    const perfil = await getPerfil()
    if (!perfil || !podeGerenciarEventos(perfil.role)) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const formData = await request.formData()
    const eventoId = formData.get('evento_id') as string
    const nome = formData.get('nome') as string
    const emailContato = (formData.get('email_contato') as string) || null
    const qtdStr = formData.get('quantidade_estimada') as string
    const quantidade_estimada = qtdStr ? parseInt(qtdStr) : null

    if (!eventoId || !nome) {
      return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 })
    }

    // Isolamento por organização: o evento precisa ser da org do usuário (ou master)
    const { data: eventoDono } = await supabaseAdmin
      .from('eventos')
      .select('organizacao_id')
      .eq('id', eventoId)
      .single()
    if (!eventoDono) {
      return NextResponse.json({ error: 'Evento não encontrado' }, { status: 404 })
    }
    if (!ehMaster(perfil.role) && eventoDono.organizacao_id !== perfil.organizacao_id) {
      return NextResponse.json({ error: 'Sem permissão sobre este evento' }, { status: 403 })
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
