import { NextRequest, NextResponse } from 'next/server'
import { adicionarFuncionarioNaPlanilha } from '@/lib/google-sheets'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos, ehMaster } from '@/lib/permissions'

type FuncionarioRow = {
  nome: string
  cpf: string
  telefone: string
  email: string
  empresa: string
  cargo: string
  setor?: string
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

    // Busca o fornecedor e o evento para pegar o spreadsheet_id
    const { data: fornecedor } = await supabaseAdmin
      .from('fornecedores')
      .select('*, eventos(id, spreadsheet_id, nome, organizacao_id)')
      .eq('id', fornecedorId)
      .single()

    if (!fornecedor) {
      return NextResponse.json({ error: 'Fornecedor não encontrado' }, { status: 404 })
    }

    const evento = fornecedor.eventos as any

    // Isolamento por organização: só master ou admin da mesma org do evento
    if (!ehMaster(perfil.role) && evento?.organizacao_id !== perfil.organizacao_id) {
      return NextResponse.json({ error: 'Sem permissão sobre este fornecedor' }, { status: 403 })
    }
    const spreadsheetId = evento?.spreadsheet_id
    const eventoId = evento?.id ?? fornecedor.evento_id

    // Resolve setores pelo nome (cria automaticamente os que não existirem)
    const nomesSetores = [...new Set(
      funcionarios.map(f => f.setor?.trim()).filter((s): s is string => !!s)
    )]
    const setorIdPorNome: Record<string, string> = {}
    if (nomesSetores.length && eventoId) {
      const { data: existentes } = await supabaseAdmin
        .from('setores')
        .select('id, nome')
        .eq('evento_id', eventoId)
      for (const s of existentes ?? []) setorIdPorNome[s.nome.toLowerCase()] = s.id

      const faltantes = nomesSetores.filter(n => !setorIdPorNome[n.toLowerCase()])
      if (faltantes.length) {
        const { data: criados } = await supabaseAdmin
          .from('setores')
          .insert(faltantes.map(nome => ({ evento_id: eventoId, nome })))
          .select('id, nome')
        for (const s of criados ?? []) setorIdPorNome[s.nome.toLowerCase()] = s.id
      }
    }

    // Prepara os registros com CPF e telefone limpos
    const payload = funcionarios.map(f => ({
      nome: f.nome?.trim(),
      cpf: String(f.cpf ?? '').replace(/\D/g, ''),
      telefone: String(f.telefone ?? '').replace(/\D/g, ''),
      email: f.email?.trim() ?? '',
      empresa: f.empresa?.trim() ?? fornecedor.nome,
      cargo: f.cargo?.trim() ?? '',
      setor_id: f.setor?.trim() ? setorIdPorNome[f.setor.trim().toLowerCase()] ?? null : null,
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
