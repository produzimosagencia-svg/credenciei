import { after } from 'next/server'
import { adicionarFuncionarioNaPlanilha } from '@/lib/google-sheets'
import { supabaseAdmin } from '@/lib/supabase-server'
import { ehMaster, type Role } from '@/lib/permissions'
import { sincronizarAgendamentos, agendarBoasVindasFuncionario } from '@/lib/mensagens'
import { validarCpf } from '@/lib/format'
import { mensagemAmigavel } from '@/lib/erros'
import { registrarCadastrosEmLote } from '@/lib/auditoria'
import { obterFuncionalidadesOrganizacao } from '@/lib/actions'
import type { LinhaPlanilha } from '@/lib/planilha'

/**
 * Cadastro em lote da equipe de um setor.
 *
 * Mora aqui, e não na rota, porque tem dois caminhos até ele: o botão de
 * importar dentro do evento e a planilha anexada no chat da IA. Regra de
 * duplicidade, teto de ativação e reaproveitamento da base precisam ser as
 * mesmas nos dois — se ficassem duplicadas, uma ia envelhecer sozinha.
 */

/** Uma linha que a importação deixou de fora. */
export type LinhaIgnorada = {
  nome: string
  cpf: string
  /** Em qual setor deste evento o CPF já estava. Vazio = repetido na própria planilha. */
  setor: string | null
  /**
   * Por que ficou de fora — ausente ou `'duplicado'` é o caso de sempre (CPF
   * repetido). Os outros dois só existem em evento com subeventos/cota
   * ligados (Vital, 30/09/2026).
   */
  motivo?: 'duplicado' | 'subevento_invalido' | 'cota_atingida'
}

export type ResultadoImportacao =
  | { ok: true; total: number; invalidos: number; duplicados: number; reaproveitados: number; ignorados: LinhaIgnorada[] }
  | { ok: false; error: string; status: number; ignorados?: LinhaIgnorada[] }

type PerfilImportador = { id: string; nome: string; role: Role; organizacao_id: string | null }

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
    return { ok: false, status: 404, error: 'Este fornecedor não existe mais. Recarregue a página e tente de novo.' }
  }

  const evento = fornecedor.eventos as unknown as {
    id: string; spreadsheet_id: string | null; nome: string; organizacao_id: string | null
  } | null

  // Isolamento por organização: só master ou admin da mesma org do evento
  if (!ehMaster(perfil.role) && evento?.organizacao_id !== perfil.organizacao_id) {
    return { ok: false, status: 403, error: 'Você não tem permissão para importar funcionários neste fornecedor.' }
  }
  const spreadsheetId = evento?.spreadsheet_id
  const eventoId = evento?.id ?? fornecedor.evento_id

  /*
   * SUBEVENTO — mesma régua do cadastro por link (`cadastrarFuncionarioPublico`
   * em lib/actions.ts), pedido do Vital (30/09/2026). Resolvido AQUI, antes de
   * preparar as linhas, porque com 0 escalas a importação inteira não tem
   * como continuar — não faz sentido gastar tempo lendo a planilha primeiro.
   */
  const funcionalidades = await obterFuncionalidadesOrganizacao(evento?.organizacao_id ?? null)
  let escalasDoFornecedor: { subevento_id: string; nome: string; cota: number | null }[] = []
  if (funcionalidades.subeventosHabilitado) {
    const { data: escalas } = await supabaseAdmin
      .from('fornecedor_subeventos')
      .select('subevento_id, cota, subeventos(nome)')
      .eq('fornecedor_id', fornecedorId)
    escalasDoFornecedor = (escalas ?? []).map(e => ({
      subevento_id: e.subevento_id as string,
      nome: ((e.subeventos as unknown as { nome?: string } | null)?.nome ?? '').trim(),
      cota: e.cota as number | null,
    }))
    if (escalasDoFornecedor.length === 0) {
      return { ok: false, status: 400, error: 'Este fornecedor ainda não foi escalado em nenhum subevento deste evento. Escale-o antes de importar.' }
    }
  }

  /*
   * NINGUÉM ENTRA INATIVO — nem acima do teto do setor.
   *
   * Existia aqui uma "trava de ativação": quem passasse de
   * `quantidade_estimada` entrava desativado, esperando alguém liberar no
   * painel. A intenção era não estourar o combinado com o cliente sem
   * aprovação. O efeito real foi outro.
   *
   * No Henrique e Juliano, uma planilha importada num setor que tinha teto
   * deixou 197 de 201 pessoas desativadas. O teto foi removido do setor
   * depois — mas remover o teto NÃO reativa ninguém, então as 197
   * continuaram sem poder bater ponto. Ninguém percebeu até a véspera do
   * show, porque o aviso da importação some quando se troca de tela: a
   * pessoa aparece na lista do setor, com nome e QR, e só é recusada no
   * portão, na frente de todo mundo.
   *
   * O teto continua existindo e continua sendo mostrado (a barra de
   * progresso do cartão do setor diz "12 de 10"). O que ele deixou de fazer
   * é impedir alguém de trabalhar — controle de contrato não pode virar
   * trava de catraca. Quem precisa tirar alguém da escala usa "desativar",
   * que é explícito e reversível.
   */
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
      subevento: f.subevento?.trim() ?? '',
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
  /*
   * QUAIS foram ignorados, não só quantos.
   *
   * A contagem sozinha ("10 CPFs já cadastrados foram ignorados") deixava
   * quem importou sem saída: pra descobrir quem eram os 10, só conferindo a
   * planilha de 200 linhas contra a tela, uma a uma. Com nome, CPF e o setor
   * onde a pessoa já está, a conferência é imediata — e é nessa lista que
   * aparece o caso real: a mesma pessoa mandada em dois setores.
   */
  const ignorados: LinhaIgnorada[] = []

  const vistos = new Set<string>()
  const semRepetidos = validos.filter(f => {
    if (vistos.has(f.cpf)) {
      ignorados.push({ nome: f.nome ?? '', cpf: f.cpf, setor: null })
      return false
    }
    vistos.add(f.cpf)
    return true
  })

  const jaCadastrados = new Map<string, { nome: string; setor: string | null }>()
  if (semRepetidos.length) {
    const { data: existentes } = await supabaseAdmin
      .from('funcionarios')
      .select('cpf, nome, fornecedores!inner(evento_id, nome)')
      .eq('fornecedores.evento_id', eventoId)
      .in('cpf', semRepetidos.map(f => f.cpf))
    for (const e of existentes ?? []) {
      jaCadastrados.set(e.cpf as string, {
        nome: e.nome as string,
        setor: (e.fornecedores as unknown as { nome: string } | null)?.nome ?? null,
      })
    }
  }
  for (const f of semRepetidos) {
    const existente = jaCadastrados.get(f.cpf)
    // O nome mostrado é o de QUEM JÁ ESTÁ no evento, não o da planilha: é
    // ele que quem confere vai encontrar na tela ao ir atrás do caso.
    if (existente) ignorados.push({ nome: existente.nome, cpf: f.cpf, setor: existente.setor })
  }
  const duplicados = ignorados.length

  const payload = semRepetidos
    .filter(f => !jaCadastrados.has(f.cpf))
    .map(f => ({ ...f, ativo: true }))

  if (payload.length === 0) {
    const motivo = duplicados
      ? `Todos os CPFs da planilha já estão cadastrados neste evento (${duplicados} duplicado${duplicados !== 1 ? 's' : ''}).`
      : invalidos
        ? `Nenhum CPF no formato certo (${invalidos} linha${invalidos !== 1 ? 's' : ''} com CPF que não tem 11 dígitos).`
        : 'Nenhum funcionário válido encontrado'
    return { ok: false, status: 400, error: motivo, ignorados }
  }

  /*
   * SUBEVENTO — cada linha entra no subevento certo. Com 1 escala só, é
   * automático (a planilha nem precisa da coluna); com 2+, a coluna
   * "Subevento" decide, e quem não bater com nenhuma escala fica de fora
   * (reportado, não descartado em silêncio).
   */
  let comSubevento = payload.map(f => ({ ...f, subevento_id: null as string | null }))
  if (funcionalidades.subeventosHabilitado) {
    if (escalasDoFornecedor.length === 1) {
      const unico = escalasDoFornecedor[0].subevento_id
      comSubevento = comSubevento.map(f => ({ ...f, subevento_id: unico }))
    } else {
      comSubevento = comSubevento.filter(f => {
        const achado = escalasDoFornecedor.find(e => e.nome.toLowerCase() === f.subevento.toLowerCase())
        if (!achado) {
          ignorados.push({ nome: f.nome ?? '', cpf: f.cpf, setor: null, motivo: 'subevento_invalido' })
          return false
        }
        f.subevento_id = achado.subevento_id
        return true
      })
    }
  }

  /*
   * TRAVA DE COTA — insere só até a cota RESTANTE, na ordem da planilha.
   * Nunca tudo-ou-nada: 3 linhas acima do limite numa planilha de 300 não
   * podem derrubar as outras 297.
   */
  let finalPayload = comSubevento
  if (funcionalidades.travaCotaHabilitada) {
    if (funcionalidades.subeventosHabilitado) {
      const restantePorSubevento = new Map<string, number | null>()
      for (const e of escalasDoFornecedor) {
        if (e.cota === null) { restantePorSubevento.set(e.subevento_id, null); continue }
        const { count } = await supabaseAdmin
          .from('funcionarios').select('id', { count: 'exact', head: true }).eq('subevento_id', e.subevento_id)
        restantePorSubevento.set(e.subevento_id, Math.max(0, e.cota - (count ?? 0)))
      }
      finalPayload = finalPayload.filter(f => {
        const restante = f.subevento_id ? restantePorSubevento.get(f.subevento_id) ?? null : null
        if (restante === null) return true
        if (restante <= 0) {
          ignorados.push({ nome: f.nome ?? '', cpf: f.cpf, setor: null, motivo: 'cota_atingida' })
          return false
        }
        restantePorSubevento.set(f.subevento_id as string, restante - 1)
        return true
      })
    } else {
      const { data: forn } = await supabaseAdmin
        .from('fornecedores').select('quantidade_estimada').eq('id', fornecedorId).maybeSingle()
      const cota = forn?.quantidade_estimada ?? null
      if (cota) {
        const { count } = await supabaseAdmin
          .from('funcionarios').select('id', { count: 'exact', head: true }).eq('fornecedor_id', fornecedorId)
        let restante = Math.max(0, cota - (count ?? 0))
        finalPayload = finalPayload.filter(f => {
          if (restante <= 0) {
            ignorados.push({ nome: f.nome ?? '', cpf: f.cpf, setor: null, motivo: 'cota_atingida' })
            return false
          }
          restante--
          return true
        })
      }
    }
  }

  if (finalPayload.length === 0) {
    return {
      ok: false, status: 400,
      error: 'Nenhuma linha pôde ser importada — confira os motivos na lista abaixo.',
      ignorados,
    }
  }

  // Base central do Credenciei: quem já foi credenciado antes — por este ou
  // por qualquer outro cliente — entra com telefone, cargo, PIX e cidade que
  // a planilha deixou em branco. É o que faz um cliente novo já "conhecer" a
  // equipe dele no primeiro evento.
  let reaproveitados = 0
  const { data: conhecidos } = await supabaseAdmin
    .from('funcionarios')
    .select('cpf, telefone, cargo, chave_pix, cidade')
    .in('cpf', finalPayload.map(f => f.cpf))
    .order('created_at', { ascending: false })

  const base = new Map<string, { telefone: string | null; cargo: string | null; chave_pix: string | null; cidade: string | null }>()
  for (const c of conhecidos ?? []) if (!base.has(c.cpf)) base.set(c.cpf, c)  // vem ordenado: o primeiro é o cadastro mais recente

  for (const f of finalPayload) {
    const anterior = base.get(f.cpf)
    if (!anterior) continue
    const antes = `${f.telefone}|${f.cargo}|${f.chave_pix}|${f.cidade}`
    if (!f.telefone) f.telefone = anterior.telefone ?? ''
    if (!f.cargo) f.cargo = anterior.cargo ?? ''
    if (!f.chave_pix) f.chave_pix = anterior.chave_pix
    if (!f.cidade) f.cidade = anterior.cidade
    if (`${f.telefone}|${f.cargo}|${f.chave_pix}|${f.cidade}` !== antes) reaproveitados++
  }

  // `subevento` (texto da planilha) e `subevento_id` ficam de FORA do insert
  // principal — coluna nova, à parte, mesmo cuidado de `exige_meio`: uma
  // migração pendente não pode derrubar a importação inteira por causa de
  // um recurso que a maioria dos eventos nem liga.
  const cpfParaSubevento = new Map(finalPayload.map(f => [f.cpf, f.subevento_id]))
  const { data: inseridos, error } = await supabaseAdmin
    .from('funcionarios')
    .insert(finalPayload.map(f => ({
      nome: f.nome, cpf: f.cpf, telefone: f.telefone, chave_pix: f.chave_pix, cargo: f.cargo,
      cidade: f.cidade, valor_receber: f.valor_receber, fornecedor_id: f.fornecedor_id, ativo: f.ativo,
    })))
    .select('id, nome, cpf, telefone, cargo, chave_pix, valor_receber, qr_token')

  if (error) {
    return { ok: false, status: 500, error: mensagemAmigavel(error) }
  }

  if (funcionalidades.subeventosHabilitado && inseridos?.length) {
    const idsPorSubevento = new Map<string, string[]>()
    for (const ins of inseridos) {
      const subeventoId = cpfParaSubevento.get(ins.cpf as string)
      if (!subeventoId) continue
      idsPorSubevento.set(subeventoId, [...(idsPorSubevento.get(subeventoId) ?? []), ins.id as string])
    }
    for (const [subeventoId, ids] of idsPorSubevento) {
      const { error: erroSub } = await supabaseAdmin.from('funcionarios').update({ subevento_id: subeventoId }).in('id', ids)
      if (erroSub) console.error('[importacao] subevento_id não gravado (migração pendente?)', erroSub.message)
    }
  }

  // Auditoria: "quem se cadastrou, que horas, por meio de que" (pedido do
  // Juan, 24/09/2026) também vale pra quem entrou pela planilha, não só
  // pelo link. Um lote só — nunca um insert de log por pessoa importada.
  if (evento?.id && inseridos?.length) {
    after(() => registrarCadastrosEmLote({
      eventoId: evento.id,
      organizacaoId: evento.organizacao_id,
      usuarioResponsavel: { id: perfil.id, nome: perfil.nome },
      itens: inseridos.map(f => ({ funcionarioId: f.id as string })),
    }))
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

  return { ok: true, total: inseridos?.length ?? 0, invalidos, duplicados, reaproveitados, ignorados }
}
