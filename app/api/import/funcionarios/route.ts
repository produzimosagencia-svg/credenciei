import { NextRequest, NextResponse, after } from 'next/server'
import { adicionarFuncionarioNaPlanilha } from '@/lib/google-sheets'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarEventos, ehMaster } from '@/lib/permissions'
import { sincronizarAgendamentos } from '@/lib/mensagens'
import { validarCpf } from '@/lib/format'

// Lotes grandes (100+): a resposta volta rápido (só o insert), mas o espelho
// no Google Sheets roda depois dela (after) e precisa desta folga pra concluir.
export const maxDuration = 60

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

    // Trava de ativação: cadastro em lote pode passar do estimado, mas só
    // entra ATIVADO quem couber no teto (quantidade_estimada); o excedente
    // fica aguardando ativação manual no painel.
    const teto = fornecedor.quantidade_estimada as number | null
    let vagasAtivas = Infinity
    if (teto && teto > 0) {
      const { count: jaAtivos } = await supabaseAdmin
        .from('funcionarios')
        .select('id', { count: 'exact', head: true })
        .eq('fornecedor_id', fornecedorId)
        .eq('ativo', true)
      vagasAtivas = Math.max(0, teto - (jaAtivos ?? 0))
    }

    // Prepara os registros com CPF e telefone limpos. O funcionário já fica
    // no setor certo via fornecedorId (a coluna "Empresa/Setor" da planilha
    // vira só o campo "empresa" — não cria setores novos).
    const preparados = funcionarios.map(f => {
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

    // Linhas com CPF que não passa no dígito verificador não entram —
    // reportadas separadamente pro usuário corrigir na planilha e reenviar.
    const invalidos = preparados.filter(f => !validarCpf(f.cpf)).length
    const validos = preparados.filter(f => validarCpf(f.cpf))

    // Anti-duplicidade (mesma regra do formulário público): cada CPF entra
    // UMA vez por evento. Remove repetidos dentro da própria planilha e
    // quem já está cadastrado em qualquer setor deste evento — assim dá pra
    // reenviar a mesma planilha corrigida sem duplicar ninguém.
    const vistos = new Set<string>()
    const semRepetidos = validos.filter(f => {
      if (vistos.has(f.cpf)) return false
      vistos.add(f.cpf)
      return true
    })

    let jaCadastrados = new Set<string>()
    if (semRepetidos.length) {
      const { data: existentes } = await supabaseAdmin
        .from('funcionarios')
        .select('cpf, fornecedores!inner(evento_id)')
        .eq('fornecedores.evento_id', eventoId)
        .in('cpf', semRepetidos.map(f => f.cpf))
      jaCadastrados = new Set((existentes ?? []).map(e => e.cpf as string))
    }
    const duplicados = (validos.length - semRepetidos.length) + semRepetidos.filter(f => jaCadastrados.has(f.cpf)).length

    const payload = semRepetidos
      .filter(f => !jaCadastrados.has(f.cpf))
      .map((f, i) => ({ ...f, ativo: i < vagasAtivas }))

    if (payload.length === 0) {
      const motivo = duplicados
        ? `Todos os CPFs da planilha já estão cadastrados neste evento (${duplicados} duplicado${duplicados !== 1 ? 's' : ''}).`
        : invalidos
          ? `Nenhum CPF válido encontrado (${invalidos} linha${invalidos !== 1 ? 's' : ''} com CPF inválido).`
          : 'Nenhum funcionário válido encontrado'
      return NextResponse.json({ error: motivo }, { status: 400 })
    }

    // Insere em lote no Supabase
    const { data: inseridos, error } = await supabaseAdmin
      .from('funcionarios')
      .insert(payload)
      .select('id, nome, cpf, telefone, empresa, cargo, chave_pix, valor_receber, qr_token')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Google Sheets sincroniza DEPOIS da resposta (after → waitUntil): com
    // 100+ linhas, a escrita linha a linha na planilha demora mais que o
    // limite da função e derrubava a importação inteira — o cadastro no banco
    // já está garantido acima, a planilha é espelho.
    if (spreadsheetId && inseridos?.length) {
      after(async () => {
        for (const f of inseridos) {
          try {
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
          } catch (e) {
            console.error('[import/funcionarios] Erro ao sincronizar planilha:', e)
          }
        }
      })
    }

    // Agenda os lembretes de WhatsApp pra quem acabou de entrar (uma vez pro lote, não por linha)
    if (inseridos?.length) {
      after(() => sincronizarAgendamentos(eventoId).catch(console.error))
    }

    return NextResponse.json({ ok: true, total: inseridos?.length ?? 0, invalidos, duplicados })
  } catch (err) {
    console.error('[import/funcionarios]', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
