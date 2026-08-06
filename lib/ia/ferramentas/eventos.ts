import { supabaseAdmin } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { inputParaISO, formatarBR } from '@/lib/tz'
import { criarPlanilhaEvento } from '@/lib/google-sheets'
import { sincronizarAgendamentos } from '@/lib/mensagens'
import { registrarAuditoriaIA } from '../auditoria'
import {
  ferramenta, exigirEvento, exigirGestor, urlBase,
  ORDEM_ETAPAS, ROTULO_ETAPA,
  type ContextoIA, type PedirConfirmacao,
} from './base'

/**
 * Ferramentas de evento: criar, editar, configurar as janelas de horário,
 * encerrar/reabrir, excluir, e cuidar dos QR Codes da equipe.
 *
 * As regras de negócio são as mesmas das telas (limite de licenças da
 * organização, reagendamento dos lembretes ao mexer em janela). Elas estão
 * reescritas aqui em vez de reaproveitadas de `lib/actions.ts` porque aquelas
 * são Server Actions: recebem FormData, chamam `revalidatePath` e terminam em
 * `redirect`, que num fluxo de chat abortaria a resposta no meio.
 */

/** "18:00" ou "2026-08-05T18:00" → ISO com fuso de Brasília. */
function horarioParaISO(valor: string | undefined | null, diaBase: string | null): string | null {
  const s = (valor ?? '').trim()
  if (!s) return null
  // Só a hora: encaixa no dia de referência do evento.
  if (/^\d{1,2}:\d{2}$/.test(s)) {
    if (!diaBase) return null
    const [h, m] = s.split(':')
    const dia = diaBase.slice(0, 10)
    return inputParaISO(`${dia}T${h.padStart(2, '0')}:${m}`)
  }
  return inputParaISO(s)
}

export function ferramentasDeEvento(ctx: ContextoIA, pedirConfirmacao: PedirConfirmacao) {
  const { perfil, confirmacoes } = ctx

  return [
    ferramenta({
      nome: 'criar_evento',
      descricao:
        'Cria um evento novo. Precisa de nome e das datas de início e fim. As janelas de horário podem vir junto ou ser definidas depois com configurar_janelas. ' +
        'Datas em "AAAA-MM-DDTHH:mm" no horário de Brasília. Se o usuário disser algo relativo ("sábado", "semana que vem"), converta você mesmo usando a data de hoje que está no seu contexto. ' +
        'Precisa de confirmação do usuário.',
      parametros: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          data_inicio: { type: 'string', description: 'AAAA-MM-DDTHH:mm' },
          data_fim: { type: 'string', description: 'AAAA-MM-DDTHH:mm' },
          local: { type: 'string' },
          descricao: { type: 'string' },
        },
        required: ['nome', 'data_inicio', 'data_fim'],
      },
      executar: async ({ nome, data_inicio, data_fim, local, descricao }) => {
        const barrado = exigirGestor(perfil, 'cria eventos')
        if (barrado) return barrado

        const inicio = inputParaISO(data_inicio)
        const fim = inputParaISO(data_fim)
        if (!inicio || !fim) return 'Datas inválidas. Use o formato AAAA-MM-DDTHH:mm.'
        if (new Date(fim) < new Date(inicio)) return 'A data de fim é anterior à de início. Confira com o usuário.'

        // Licença: admin respeita o teto contratado e o status da organização.
        // O master não tem teto (é o dono da plataforma).
        let driveFolder: string | null = null
        if (!ehMaster(perfil.role) && perfil.organizacao_id) {
          const [{ count }, { data: org }] = await Promise.all([
            supabaseAdmin.from('eventos').select('id', { count: 'exact', head: true }).eq('organizacao_id', perfil.organizacao_id),
            supabaseAdmin.from('organizacoes').select('limite_eventos, ativo, drive_folder_id').eq('id', perfil.organizacao_id).single(),
          ])
          if (org && !org.ativo) return 'A organização está suspensa. Fale com o administrador da plataforma.'
          if (org && (count ?? 0) >= org.limite_eventos) {
            return `Limite de eventos atingido (${org.limite_eventos} contratado(s), ${count} usado(s)). Só o administrador da plataforma libera mais.`
          }
          driveFolder = org?.drive_folder_id ?? null
        }

        const operacao = `criar_evento:${nome}:${inicio}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Criar o evento "${nome}"`,
            {
              inicio: formatarBR(inicio),
              fim: formatarBR(fim),
              local: local || 'não informado',
              consome_licenca: !ehMaster(perfil.role),
            },
            'que o evento será criado, com as datas e o local',
            'criar'
          ))
        }

        const { data: novo, error } = await supabaseAdmin.from('eventos').insert([{
          nome: String(nome).trim(),
          descricao: descricao ? String(descricao).trim() : null,
          data_inicio: inicio,
          data_fim: fim,
          local: local ? String(local).trim() : null,
          cliente_id: perfil.id,
          organizacao_id: perfil.organizacao_id,
        }]).select('id, nome').single()
        if (error || !novo) return 'Não foi possível criar o evento. Confira os dados e tente pela tela.'

        // Planilha do Google: se falhar, o evento continua válido — a planilha é
        // espelho, não fonte. Derrubar a criação por causa dela seria pior.
        try {
          const spreadsheetId = await criarPlanilhaEvento(novo.nome, driveFolder)
          await supabaseAdmin.from('eventos').update({ spreadsheet_id: spreadsheetId }).eq('id', novo.id)
        } catch (e) {
          console.error('Erro ao criar planilha do evento:', e)
        }

        await registrarAuditoriaIA(perfil, 'criar_evento', { evento_id: novo.id, nome: novo.nome })
        return JSON.stringify({
          ok: true,
          evento_id: novo.id,
          nome: novo.nome,
          tela: `/admin/eventos/${novo.id}`,
          proximo_passo:
            'O evento ainda não tem setores nem janelas de horário. Sem janela, nenhuma etapa aceita registro — ofereça configurar agora.',
        })
      },
    }),

    ferramenta({
      nome: 'editar_evento',
      descricao:
        'Altera os dados de um evento: nome, descrição, datas, local. Mande SÓ os campos que mudam — o que não vier fica como está. Para horários de presença use configurar_janelas.',
      parametros: {
        type: 'object',
        properties: {
          evento_id: { type: 'string' },
          nome: { type: 'string' },
          descricao: { type: 'string' },
          data_inicio: { type: 'string', description: 'AAAA-MM-DDTHH:mm' },
          data_fim: { type: 'string', description: 'AAAA-MM-DDTHH:mm' },
          local: { type: 'string' },
        },
        required: ['evento_id'],
      },
      executar: async ({ evento_id, nome, descricao, data_inicio, data_fim, local }) => {
        const barrado = exigirGestor(perfil, 'edita eventos')
        if (barrado) return barrado
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const mudancas: Record<string, unknown> = {}
        if (nome != null) mudancas.nome = String(nome).trim()
        if (descricao != null) mudancas.descricao = String(descricao).trim() || null
        if (local != null) mudancas.local = String(local).trim() || null
        if (data_inicio != null) mudancas.data_inicio = inputParaISO(data_inicio)
        if (data_fim != null) mudancas.data_fim = inputParaISO(data_fim)
        if (!Object.keys(mudancas).length) return 'Nenhum campo para alterar foi informado.'

        await supabaseAdmin.from('eventos').update(mudancas).eq('id', evento_id)
        await registrarAuditoriaIA(perfil, 'editar_evento', { evento_id, mudancas })

        // Data do evento mexe no calendário dos lembretes.
        if (mudancas.data_inicio || mudancas.data_fim) {
          await sincronizarAgendamentos(evento_id).catch(console.error)
        }
        return JSON.stringify({ ok: true, alterado: Object.keys(mudancas) })
      },
    }),

    ferramenta({
      nome: 'configurar_janelas',
      descricao:
        'Define os horários em que cada etapa aceita registro (entrada, meio, saída). É isto que responde a "a entrada começa às 18h e fecha às 20h". ' +
        'Aceita só a hora ("18:00" — encaixa no dia do evento) ou data e hora completas ("2026-08-08T18:00"). Mande apenas as etapas citadas. ' +
        'ATENÇÃO: mudar janela reagenda os lembretes de WhatsApp de toda a equipe, inclusive de quem já foi avisado — avise o usuário disso depois.',
      parametros: {
        type: 'object',
        properties: {
          evento_id: { type: 'string' },
          entrada_inicio: { type: 'string' },
          entrada_fim: { type: 'string' },
          meio_inicio: { type: 'string' },
          meio_fim: { type: 'string' },
          saida_inicio: { type: 'string' },
          saida_fim: { type: 'string' },
        },
        required: ['evento_id'],
      },
      executar: async (args) => {
        const { evento_id } = args
        const barrado = exigirGestor(perfil, 'configura horários do evento')
        if (barrado) return barrado
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const { data: evento } = await supabaseAdmin
          .from('eventos')
          .select('nome, data_inicio, data_fim')
          .eq('id', evento_id)
          .single()
        if (!evento) return 'Evento não encontrado.'

        // Hora solta ("18:00") precisa de um dia. Entrada e meio caem no dia de
        // início; a saída costuma virar a madrugada, então usa o dia de fim.
        const dia = evento.data_inicio
        const diaFim = evento.data_fim ?? evento.data_inicio
        const mapa: Record<string, [string, string | null]> = {
          janela_entrada_inicio: ['entrada_inicio', dia],
          janela_entrada_fim: ['entrada_fim', dia],
          janela_meio_inicio: ['meio_inicio', dia],
          janela_meio_fim: ['meio_fim', dia],
          janela_fim_inicio: ['saida_inicio', diaFim],
          janela_fim_fim: ['saida_fim', diaFim],
        }

        const mudancas: Record<string, unknown> = {}
        for (const [coluna, [chave, base]] of Object.entries(mapa)) {
          const bruto = (args as Record<string, string | undefined>)[chave]
          if (bruto == null) continue
          const iso = horarioParaISO(bruto, base ? String(base) : null)
          if (!iso) return `Horário inválido em "${chave}": use "18:00" ou "2026-08-08T18:00".`
          mudancas[coluna] = iso
        }
        if (!Object.keys(mudancas).length) return 'Nenhum horário foi informado.'

        await supabaseAdmin.from('eventos').update(mudancas).eq('id', evento_id)
        // Reagenda os lembretes: é a razão de existir da janela, e sem isto o
        // WhatsApp continuaria saindo no horário velho.
        await sincronizarAgendamentos(evento_id).catch(console.error)
        await registrarAuditoriaIA(perfil, 'configurar_janelas', { evento_id, mudancas })

        const { data: atual } = await supabaseAdmin
          .from('eventos')
          .select('janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim')
          .eq('id', evento_id)
          .single()

        return JSON.stringify({
          ok: true,
          janelas_agora: ORDEM_ETAPAS.map(t => {
            const ini = atual?.[`janela_${t}_inicio`]
            const fim = atual?.[`janela_${t}_fim`]
            return {
              etapa: ROTULO_ETAPA[t],
              de: ini ? formatarBR(ini) : null,
              ate: fim ? formatarBR(fim) : null,
              situacao: ini && fim ? 'liberada' : 'BLOQUEADA (janela incompleta)',
            }
          }),
          lembretes: 'Os lembretes de WhatsApp da equipe foram reagendados para os novos horários.',
        })
      },
    }),

    ferramenta({
      nome: 'alternar_ativacao_evento',
      descricao:
        'Encerra (desativa) ou reabre (ativa) um evento. Evento encerrado para de aceitar novas presenças, mas nada é apagado — é reversível. ' +
        'Use isto quando pedirem para "desativar", "encerrar" ou "fechar" um evento; excluir é outra coisa e apaga tudo.',
      parametros: {
        type: 'object',
        properties: {
          evento_id: { type: 'string' },
          ativo: { type: 'boolean', description: 'true reabre, false encerra' },
        },
        required: ['evento_id', 'ativo'],
      },
      executar: async ({ evento_id, ativo }) => {
        const barrado = exigirGestor(perfil, 'encerra ou reabre eventos')
        if (barrado) return barrado
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const { data: evento } = await supabaseAdmin.from('eventos').select('nome, ativo').eq('id', evento_id).single()
        if (!evento) return 'Evento não encontrado.'
        if ((evento.ativo !== false) === ativo) {
          return `O evento ${evento.nome} já está ${ativo ? 'ativo' : 'encerrado'}. Nada a fazer.`
        }

        await supabaseAdmin.from('eventos').update({ ativo }).eq('id', evento_id)
        await registrarAuditoriaIA(perfil, 'alternar_ativacao_evento', { evento_id, nome: evento.nome, ativo })
        return `Evento ${evento.nome} ${ativo ? 'reaberto — volta a aceitar presenças' : 'encerrado — não aceita mais presenças. Dá pra reabrir a qualquer momento'}.`
      },
    }),

    ferramenta({
      nome: 'renovar_qrs_do_evento',
      descricao:
        'Estende por mais 24h a validade dos QR Codes de TODA a equipe do evento. O link e o QR impresso continuam os mesmos — só a data de expiração muda. ' +
        'Use quando a equipe reclamar de "QR expirado".',
      parametros: {
        type: 'object',
        properties: { evento_id: { type: 'string' } },
        required: ['evento_id'],
      },
      executar: async ({ evento_id }) => {
        const barrado = exigirGestor(perfil, 'renova QR Codes do evento inteiro')
        if (barrado) return barrado
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const { data: setores } = await supabaseAdmin.from('fornecedores').select('id').eq('evento_id', evento_id)
        const ids = (setores ?? []).map(s => s.id)
        if (!ids.length) return 'Este evento ainda não tem setores, então não há QR Code para renovar.'

        const novaValidade = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        const { data } = await supabaseAdmin
          .from('funcionarios')
          .update({ qr_expira_em: novaValidade })
          .in('fornecedor_id', ids)
          .select('id')

        await registrarAuditoriaIA(perfil, 'renovar_qrs_do_evento', { evento_id, renovados: data?.length ?? 0 })
        return `${data?.length ?? 0} QR Code(s) renovados. Válidos até ${formatarBR(novaValidade)}.`
      },
    }),

    ferramenta({
      nome: 'regenerar_qr_funcionario',
      descricao:
        'Gera um QR Code NOVO para uma pessoa, invalidando o anterior. Use quando o crachá vazou, foi perdido ou alguém está usando o QR de outra pessoa. ' +
        'O link antigo para de funcionar na hora — a pessoa precisa receber o novo. Precisa de confirmação.',
      parametros: {
        type: 'object',
        properties: { funcionario_id: { type: 'string' } },
        required: ['funcionario_id'],
      },
      executar: async ({ funcionario_id }) => {
        const { data: func } = await supabaseAdmin
          .from('funcionarios')
          .select('id, nome, fornecedor_id, fornecedores!inner(evento_id)')
          .eq('id', funcionario_id)
          .single()
        if (!func) return 'Funcionário não encontrado.'
        const erro = await exigirEvento(perfil, (func.fornecedores as unknown as { evento_id: string }).evento_id)
        if (erro) return erro

        const operacao = `regenerar_qr:${funcionario_id}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Gerar um QR Code novo para ${func.nome}`,
            { o_qr_atual: 'para de funcionar imediatamente', acao: 'a pessoa precisa receber o link novo' },
            'que o QR atual será invalidado e a pessoa precisará do link novo'
          ))
        }

        // Token aleatório no mesmo formato do default da coluna (32 hex).
        const novo = Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map(b => b.toString(16).padStart(2, '0')).join('')
        await supabaseAdmin.from('funcionarios').update({
          qr_token: novo,
          qr_expira_em: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }).eq('id', funcionario_id)

        await registrarAuditoriaIA(perfil, 'regenerar_qr_funcionario', { funcionario_id, nome: func.nome })
        return JSON.stringify({
          ok: true,
          nome: func.nome,
          novo_link: `${urlBase()}/credential/${novo}`,
          observacao: 'O QR anterior foi invalidado. Mande este link para a pessoa.',
        })
      },
    }),

    ferramenta({
      nome: 'invalidar_qr_funcionario',
      descricao:
        'Derruba o QR Code de uma pessoa agora, sem gerar outro: a credencial dela para de ser aceita. Use em caso de perda ou desligamento no meio do evento. ' +
        'Reversível com renovar_qrs_do_evento ou regenerar_qr_funcionario.',
      parametros: {
        type: 'object',
        properties: { funcionario_id: { type: 'string' } },
        required: ['funcionario_id'],
      },
      executar: async ({ funcionario_id }) => {
        const { data: func } = await supabaseAdmin
          .from('funcionarios')
          .select('id, nome, fornecedor_id, fornecedores!inner(evento_id)')
          .eq('id', funcionario_id)
          .single()
        if (!func) return 'Funcionário não encontrado.'
        const erro = await exigirEvento(perfil, (func.fornecedores as unknown as { evento_id: string }).evento_id)
        if (erro) return erro

        await supabaseAdmin.from('funcionarios')
          .update({ qr_expira_em: new Date(Date.now() - 60_000).toISOString() })
          .eq('id', funcionario_id)
        await registrarAuditoriaIA(perfil, 'invalidar_qr_funcionario', { funcionario_id, nome: func.nome })
        return `O QR Code de ${func.nome} foi invalidado e não é mais aceito no scanner.`
      },
    }),

    ferramenta({
      nome: 'excluir_evento',
      descricao:
        'Remove um evento inteiro: setores, equipe e presenças. Só o master pode. Não tem desfazer. Sempre chame primeiro sem confirmação para mostrar o impacto.',
      parametros: {
        type: 'object',
        properties: { evento_id: { type: 'string' } },
        required: ['evento_id'],
      },
      executar: async ({ evento_id }) => {
        if (!ehMaster(perfil.role)) {
          return 'Só o master exclui eventos. Se o evento acabou, o caminho certo é encerrá-lo com alternar_ativacao_evento (reversível), não excluir.'
        }
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const [{ data: evento }, { data: setores }, { count: registros }] = await Promise.all([
          supabaseAdmin.from('eventos').select('nome, data_inicio').eq('id', evento_id).single(),
          supabaseAdmin.from('fornecedores').select('id, funcionarios(count)').eq('evento_id', evento_id),
          supabaseAdmin.from('registros').select('id', { count: 'exact', head: true }).eq('evento_id', evento_id),
        ])
        if (!evento) return 'Evento não encontrado.'
        const pessoas = (setores ?? []).reduce(
          (a, s) => a + ((s.funcionarios as unknown as { count: number }[])?.[0]?.count ?? 0), 0)

        const operacao = `excluir_evento:${evento_id}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Excluir o evento ${evento.nome} (${evento.data_inicio ? formatarBR(evento.data_inicio, 'curto') : 'sem data'})`,
            {
              setores_apagados: setores?.length ?? 0,
              pessoas_apagadas: pessoas,
              registros_de_presenca_apagados: registros ?? 0,
              alternativa_reversivel: 'encerrar o evento em vez de excluir',
            }
          ))
        }

        await supabaseAdmin.from('eventos').delete().eq('id', evento_id)
        await registrarAuditoriaIA(perfil, 'excluir_evento', {
          evento_id, nome: evento.nome, setores: setores?.length ?? 0, pessoas, registros: registros ?? 0,
        })
        return `Evento ${evento.nome} excluído, com ${setores?.length ?? 0} setor(es), ${pessoas} pessoa(s) e ${registros ?? 0} registro(s).`
      },
    }),
  ]
}
