import { after } from 'next/server'
import { adicionarFuncionarioNaPlanilha } from '@/lib/google-sheets'
import { supabaseAdmin } from '@/lib/supabase-server'
import { ehMaster, type Role } from '@/lib/permissions'
import { sincronizarAgendamentos, agendarBoasVindasFuncionario } from '@/lib/mensagens'
import { validarCpf } from '@/lib/format'
import { mensagemAmigavel } from '@/lib/erros'
import type { LinhaPlanilha } from '@/lib/planilha'

/**
 * Cadastro em lote da equipe de um setor.
 *
 * Mora aqui, e não na rota, porque tem dois caminhos até ele: o botão de
 * importar dentro do evento e a planilha anexada no chat da IA. Regra de
 * duplicidade, teto de ativação e reaproveitamento da base precisam ser as
 * mesmas nos dois — se ficassem duplicadas, uma ia envelhecer sozinha.
 */

export type ResultadoImportacao =
  | { ok: true; total: number; invalidos: number; duplicados: number; reaproveitados: number }
  | { ok: false; error: string; status: number }

type PerfilImportador = { role: Role; organizacao_id: string | null }

export async function importarFuncionarios(
  perfil: PerfilImportador,
  fornecedorId: string,
  linhas: LinhaPlanilha[]
): Promise<ResultadoImportacao> {
  if (!fornecedorId || !Array.isArray(linhas) || linhas.length === 0) {
    return { ok: false, status: 400, error: 'A planilha enviada está em um formato que o sistema não reconhece. Confira o arquivo e tente de novo.' }
  }

  const { data: fornecedor } = await supabaseAdmin
    .from('fornecedores')
    .select('*, eventos(id, spreadsheet_id, nome, organizacao_id)')
    .eq('id', fornecedorId)
    .single()

  if (!fornecedor) {
    return { ok: false, status: 404, error: 'Este setor não existe mais. Recarregue a página e tente de novo.' }
  }

  const evento = fornecedor.eventos as unknown as {
    id: string; spreadsheet_id: string | null; nome: string; organizacao_id: string | null
  } | null

  // Isolamento por organização: só master ou admin da mesma org do evento
  if (!ehMaster(perfil.role) && evento?.organizacao_id !== perfil.organizacao_id) {
    return { ok: false, status: 403, error: 'Você não tem permissão para importar funcionários neste setor.' }
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
  // (a coluna de setor da planilha não cria setores novos).
  const preparados = linhas.map(f => {
    const valor = parseFloat(String(f.valor ?? '').replace(',', '.'))
    return {
      nome: f.nome?.trim(),
      cpf: String(f.cpf ?? '').replace(/\D/g, ''),
      telefone: String(f.telefone ?? '').replace(/\D/g, ''),
      chave_pix: f.chavePix?.trim() || null,
      cargo: f.cargo?.trim() ?? '',
      cidade: f.cidade?.trim() || null,
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
        ? `Nenhum CPF no formato certo (${invalidos} linha${invalidos !== 1 ? 's' : ''} com CPF que não tem 11 dígitos).`
        : 'Nenhum funcionário válido encontrado'
    return { ok: false, status: 400, error: motivo }
  }

  // Base central do Credenciei: quem já foi credenciado antes — por este ou
  // por qualquer outro cliente — entra com telefone, cargo, PIX e cidade que
  // a planilha deixou em branco. É o que faz um cliente novo já "conhecer" a
  // equipe dele no primeiro evento.
  let reaproveitados = 0
  const { data: conhecidos } = await supabaseAdmin
    .from('funcionarios')
    .select('cpf, telefone, cargo, chave_pix, cidade')
    .in('cpf', payload.map(f => f.cpf))
    .order('created_at', { ascending: false })

  const base = new Map<string, { telefone: string | null; cargo: string | null; chave_pix: string | null; cidade: string | null }>()
  for (const c of conhecidos ?? []) if (!base.has(c.cpf)) base.set(c.cpf, c)  // vem ordenado: o primeiro é o cadastro mais recente

  for (const f of payload) {
    const anterior = base.get(f.cpf)
    if (!anterior) continue
    const antes = `${f.telefone}|${f.cargo}|${f.chave_pix}|${f.cidade}`
    if (!f.telefone) f.telefone = anterior.telefone ?? ''
    if (!f.cargo) f.cargo = anterior.cargo ?? ''
    if (!f.chave_pix) f.chave_pix = anterior.chave_pix
    if (!f.cidade) f.cidade = anterior.cidade
    if (`${f.telefone}|${f.cargo}|${f.chave_pix}|${f.cidade}` !== antes) reaproveitados++
  }

  const { data: inseridos, error } = await supabaseAdmin
    .from('funcionarios')
    .insert(payload)
    .select('id, nome, cpf, telefone, cargo, chave_pix, valor_receber, qr_token')

  if (error) {
    return { ok: false, status: 500, error: mensagemAmigavel(error) }
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
            cargo: f.cargo,
            chavePix: f.chave_pix,
            valorReceber: f.valor_receber,
            qr_token: f.qr_token,
          })
        } catch (e) {
          console.error('[importacao] Erro ao sincronizar planilha:', e)
        }
      }
    })
  }

  /*
   * Boas-vindas a quem entrou pela planilha.
   *
   * Antes só quem se cadastrava pelo formulário recebia o link da credencial —
   * quem vinha por importação ficava com um QR Code que nunca soube que
   * existia, e aparecia no evento sem credencial nenhuma.
   *
   * Em background e uma por pessoa: a fila cuida do espaçamento entre envios.
   * Mandar aqui num laço faria 100 chamadas na mesma requisição, que é
   * exatamente o que estoura o tempo da função no meio da importação.
   *
   * Sem telefone válido não agenda — `agendarBoasVindasFuncionario` já ignora
   * e a pessoa fica no relatório de importação para o produtor corrigir.
   */
  if (inseridos?.length) {
    after(async () => {
      for (const f of inseridos) {
        try {
          await agendarBoasVindasFuncionario({
            eventoId,
            funcionarioId: f.id,
            telefone: f.telefone ?? '',
          })
        } catch (e) {
          console.error('[importacao] não consegui agendar as boas-vindas:', e)
        }
      }
    })
  }

  // Agenda os lembretes de WhatsApp pra quem acabou de entrar (uma vez pro lote, não por linha)
  if (inseridos?.length) {
    after(() => sincronizarAgendamentos(eventoId).catch(console.error))
  }

  return { ok: true, total: inseridos?.length ?? 0, invalidos, duplicados, reaproveitados }
}
