import { supabaseAdmin } from '@/lib/supabase-server'
import { formatCpf, validarCpf } from '@/lib/format'
import { sincronizarAgendamentos, agendarBoasVindasFuncionario } from '@/lib/mensagens'
import { importarFuncionarios } from '@/lib/importacao'
import { resumirPlanilha } from '@/lib/planilha'
import { registrarAuditoriaIA } from '../auditoria'
import {
  ferramenta, exigirGestor, resolverSetor, resolverFuncionario,
  urlBase, valorNumerico, brl,
  type ContextoIA, type PedirConfirmacao,
} from './base'

/**
 * Ferramentas de equipe: cadastrar, editar, mover de setor, ativar, pagar e
 * excluir pessoas.
 *
 * O TETO do setor (`quantidade_estimada`) NÃO desativa mais ninguém.
 *
 * Ele desativava: quem entrasse além do teto ficava inativo, e inativo não
 * bate ponto nem recebe lembrete. A intenção era não estourar o combinado
 * com o cliente sem aprovação; o efeito foi 197 pessoas de um setor sem
 * conseguir entrar no evento, descobertas na véspera do show — ver o
 * comentário longo em lib/importacao.ts.
 *
 * O teto continua existindo como REFERÊNCIA (a barra do cartão do setor
 * mostra "12 de 10"), e nenhuma tela deixou de mostrá-lo. O que ele não faz
 * mais é criar gente que não trabalha. Para tirar alguém da escala existe
 * "desativar", que é explícito, visível e reversível.
 */

/** O mesmo CPF não pode estar em dois setores do mesmo evento. */
async function cpfJaNoEvento(cpf: string, eventoId: string, ignorarId?: string) {
  const q = supabaseAdmin
    .from('funcionarios')
    .select('id, nome, fornecedores!inner(nome, evento_id)')
    .eq('cpf', cpf)
    .eq('fornecedores.evento_id', eventoId)
    .limit(1)
  if (ignorarId) q.neq('id', ignorarId)
  const { data } = await q
  if (!data?.length) return null
  return (data[0].fornecedores as unknown as { nome: string }).nome
}

export function ferramentasDeFuncionario(ctx: ContextoIA, pedirConfirmacao: PedirConfirmacao) {
  const { perfil, confirmacoes } = ctx

  return [
    ferramenta({
      nome: 'cadastrar_funcionario',
      descricao:
        'Cadastra uma pessoa na equipe de um setor. Ela entra sempre ATIVA, mesmo acima do teto do setor (o teto é referência, não trava). ' +
        'Com telefone preenchido, a pessoa recebe as boas-vindas com o link da credencial no WhatsApp. ' +
        'PEÇA OS MESMOS DADOS DO FORMULÁRIO PÚBLICO antes de chamar: nome, CPF, telefone, empresa, cargo e CIDADE onde a pessoa mora (obrigatórios), e chave PIX e valor a receber quando o usuário souber. ' +
        'A cidade não é detalhe: é por ela que a pessoa é encontrada depois na busca por região. Se o usuário não informar, pergunte — não invente e não deixe em branco.',
      parametros: {
        type: 'object',
        properties: {
          fornecedor_id: { type: 'string' },
          nome: { type: 'string' },
          cpf: { type: 'string' },
          telefone: { type: 'string' },
          empresa: { type: 'string' },
          cargo: { type: 'string', description: 'a função da pessoa no evento' },
          cidade: { type: 'string', description: 'cidade onde a PESSOA mora (não onde é o evento)' },
          chave_pix: { type: 'string' },
          valor_receber: { type: 'number', description: 'quanto esta pessoa deve receber, em reais' },
        },
        required: ['fornecedor_id', 'nome', 'cpf', 'telefone', 'cargo', 'cidade'],
      },
      executar: async ({ fornecedor_id, nome, cpf, telefone, empresa, cargo, cidade, chave_pix, valor_receber }) => {
        const r = await resolverSetor(perfil, fornecedor_id)
        if (!r.ok) return r.erro

        const digitos = String(cpf).replace(/\D/g, '')
        if (!validarCpf(digitos)) return 'O CPF precisa ter 11 dígitos — confira com o usuário.'

        const outroSetor = await cpfJaNoEvento(digitos, r.setor.evento_id)
        if (outroSetor) {
          return `Este CPF já está cadastrado neste evento, no setor "${outroSetor}". Uma pessoa não pode estar em dois setores do mesmo evento — se ela mudou de setor, use mover_funcionario_de_setor.`
        }

        // Ninguém entra inativo — ver o comentário no topo do arquivo.
        const ativo = true
        const fone = String(telefone ?? '').replace(/\D/g, '')

        const { data: novo, error } = await supabaseAdmin.from('funcionarios').insert([{
          fornecedor_id,
          nome: String(nome).trim(),
          cpf: digitos,
          telefone: fone,
          empresa: String(empresa ?? r.setor.nome).trim(),
          cargo: String(cargo ?? '').trim(),
          cidade: String(cidade ?? '').trim() || null,
          chave_pix: chave_pix ? String(chave_pix).trim() : null,
          valor_receber: valorNumerico(valor_receber) ?? 0,
          ativo,
        }]).select('id, nome, qr_token').single()
        if (error || !novo) return 'Não foi possível cadastrar. Tente pela tela do setor.'

        // Lembretes e boas-vindas fora do caminho crítico: se o WhatsApp
        // estiver fora do ar, o cadastro não pode falhar por causa disso.
        sincronizarAgendamentos(r.setor.evento_id).catch(console.error)
        if (fone) {
          agendarBoasVindasFuncionario({
            eventoId: r.setor.evento_id, funcionarioId: novo.id, telefone: fone,
          }).catch(console.error)
        }

        await registrarAuditoriaIA(perfil, 'cadastrar_funcionario', {
          funcionario_id: novo.id, nome: novo.nome, fornecedor_id,
        })
        return JSON.stringify({
          ok: true,
          funcionario_id: novo.id,
          nome: novo.nome,
          setor: r.setor.nome,
          ativo,
          link_da_credencial: `${urlBase()}/credential/${novo.qr_token}`,
          observacao: !fone
            ? 'Sem telefone cadastrado: ela não vai receber nada no WhatsApp, nem o link da credencial.'
            : null,
        })
      },
    }),

    ferramenta({
      nome: 'editar_funcionario',
      descricao:
        'Altera os dados de uma pessoa da equipe: nome, telefone, CPF, empresa, cargo/função, cidade, chave PIX e valor a receber. Mande só os campos que mudam. ' +
        'Confirme com buscar_funcionario que é a pessoa certa antes de chamar.',
      parametros: {
        type: 'object',
        properties: {
          funcionario_id: { type: 'string' },
          nome: { type: 'string' },
          telefone: { type: 'string' },
          cpf: { type: 'string' },
          empresa: { type: 'string' },
          cargo: { type: 'string' },
          cidade: { type: 'string', description: 'cidade onde a pessoa mora' },
          chave_pix: { type: 'string' },
          valor_receber: { type: 'number' },
        },
        required: ['funcionario_id'],
      },
      executar: async ({ funcionario_id, nome, telefone, cpf, empresa, cargo, cidade, chave_pix, valor_receber }) => {
        const r = await resolverFuncionario(perfil, funcionario_id)
        if (!r.ok) return r.erro

        const mudancas: Record<string, unknown> = {}
        if (nome != null) mudancas.nome = String(nome).trim()
        if (telefone != null) mudancas.telefone = String(telefone).replace(/\D/g, '')
        if (empresa != null) mudancas.empresa = String(empresa).trim()
        if (cargo != null) mudancas.cargo = String(cargo).trim()
        if (cidade != null) mudancas.cidade = String(cidade).trim() || null
        if (chave_pix != null) mudancas.chave_pix = String(chave_pix).trim() || null

        if (valor_receber != null) {
          const v = valorNumerico(valor_receber)
          if (v == null || v < 0) return 'Valor a receber inválido.'
          mudancas.valor_receber = v
        }

        // CPF é a identidade da pessoa no sistema (base central e trava de um
        // CPF por evento). Muda, mas só validado e sem colidir com ninguém.
        if (cpf != null) {
          const digitos = String(cpf).replace(/\D/g, '')
          if (!validarCpf(digitos)) return 'O CPF precisa ter 11 dígitos.'
          const outroSetor = await cpfJaNoEvento(digitos, r.func.evento_id, funcionario_id)
          if (outroSetor) return `Já existe outra pessoa com este CPF neste evento, no setor "${outroSetor}".`
          mudancas.cpf = digitos
        }

        if (!Object.keys(mudancas).length) return 'Nenhum campo para alterar foi informado.'

        await supabaseAdmin.from('funcionarios').update(mudancas).eq('id', funcionario_id)
        await registrarAuditoriaIA(perfil, 'editar_funcionario', {
          funcionario_id, nome: r.func.nome, mudancas,
        })

        // Telefone novo muda para onde vão os lembretes já agendados.
        if (mudancas.telefone != null) {
          await supabaseAdmin.from('mensagens_agendadas')
            .update({ telefone: mudancas.telefone })
            .eq('funcionario_id', funcionario_id)
            .in('status', ['pendente', 'falhou'])
        }

        return JSON.stringify({
          ok: true,
          pessoa: r.func.nome,
          alterado: Object.keys(mudancas),
          observacao: mudancas.telefone != null
            ? 'As mensagens de WhatsApp ainda não enviadas foram redirecionadas para o telefone novo.'
            : null,
        })
      },
    }),

    ferramenta({
      nome: 'mover_funcionario_de_setor',
      descricao:
        'Move uma pessoa para outro setor. É isto que responde a "coloca o João no Bar" quando ele já está cadastrado em outro setor. ' +
        'Os dois setores precisam ser do MESMO evento. Os registros de presença que ela já tem são mantidos.',
      parametros: {
        type: 'object',
        properties: {
          funcionario_id: { type: 'string' },
          fornecedor_id_destino: { type: 'string' },
        },
        required: ['funcionario_id', 'fornecedor_id_destino'],
      },
      executar: async ({ funcionario_id, fornecedor_id_destino }) => {
        const barrado = exigirGestor(perfil, 'move pessoas entre setores')
        if (barrado) return barrado

        const r = await resolverFuncionario(perfil, funcionario_id)
        if (!r.ok) return r.erro
        const destino = await resolverSetor(perfil, fornecedor_id_destino)
        if (!destino.ok) return destino.erro

        if (destino.setor.id === r.func.fornecedor_id) {
          return `${r.func.nome} já está no setor ${destino.setor.nome}. Nada a fazer.`
        }
        if (destino.setor.evento_id !== r.func.evento_id) {
          return 'Os dois setores são de eventos diferentes. Só dá pra mover dentro do mesmo evento — para o outro evento, cadastre a pessoa lá.'
        }

        // Mover de setor não desativa: o teto do destino é referência, não trava.
        const continuaAtivo = r.func.ativo

        await supabaseAdmin.from('funcionarios').update({
          fornecedor_id: fornecedor_id_destino,
          ativo: continuaAtivo,
        }).eq('id', funcionario_id)

        await registrarAuditoriaIA(perfil, 'mover_funcionario_de_setor', {
          funcionario_id, nome: r.func.nome, de: r.func.setorNome, para: destino.setor.nome,
        })
        return JSON.stringify({
          ok: true,
          pessoa: r.func.nome,
          de: r.func.setorNome,
          para: destino.setor.nome,
          observacao: null,
        })
      },
    }),

    ferramenta({
      nome: 'alternar_ativacao_funcionario',
      descricao:
        'Ativa ou desativa uma pessoa. Inativa, ela não registra presença nem recebe lembrete de WhatsApp. É reversível — prefira isto a excluir. ' +
        'A ativação respeita o teto do setor: se já estiver cheio, alguém precisa ser desativado antes.',
      parametros: {
        type: 'object',
        properties: {
          funcionario_id: { type: 'string' },
          ativo: { type: 'boolean', description: 'true para ativar, false para desativar' },
        },
        required: ['funcionario_id', 'ativo'],
      },
      executar: async ({ funcionario_id, ativo }) => {
        const r = await resolverFuncionario(perfil, funcionario_id)
        if (!r.ok) return r.erro
        if (r.func.ativo === ativo) return `${r.func.nome} já está ${ativo ? 'ativa' : 'inativa'}. Nada a fazer.`

        await supabaseAdmin.from('funcionarios').update({ ativo }).eq('id', funcionario_id)
        // Ativar alguém cria os lembretes dela; desativar não precisa mexer
        // (a fila já ignora quem está inativo no momento do envio).
        if (ativo) await sincronizarAgendamentos(r.func.evento_id).catch(console.error)

        await registrarAuditoriaIA(perfil, 'alternar_ativacao_funcionario', {
          funcionario_id, nome: r.func.nome, ativo,
        })
        return `${r.func.nome} agora está ${ativo ? 'ativa e já pode registrar presença' : 'inativa e não registra mais presença'}.`
      },
    }),

    ferramenta({
      nome: 'registrar_pagamento',
      descricao:
        'Dá baixa (ou desfaz a baixa) no pagamento de uma pessoa. Só funciona para quem está ativa. Responde a "marca o João como pago".',
      parametros: {
        type: 'object',
        properties: {
          funcionario_id: { type: 'string' },
          pago: { type: 'boolean' },
        },
        required: ['funcionario_id', 'pago'],
      },
      executar: async ({ funcionario_id, pago }) => {
        const r = await resolverFuncionario(perfil, funcionario_id)
        if (!r.ok) return r.erro
        if (pago && !r.func.ativo) {
          return `${r.func.nome} não está ativada. Ative-a antes de marcar o pagamento — pagamento é só para quem foi selecionada dentro do teto do setor.`
        }

        await supabaseAdmin.from('funcionarios').update({
          pago,
          pago_em: pago ? new Date().toISOString() : null,
        }).eq('id', funcionario_id)

        await registrarAuditoriaIA(perfil, 'registrar_pagamento', {
          funcionario_id, nome: r.func.nome, pago,
        })
        return `${r.func.nome} marcada como ${pago ? 'PAGA' : 'não paga'}.`
      },
    }),

    ferramenta({
      nome: 'importar_planilha',
      descricao:
        'Cadastra de uma vez toda a equipe da planilha que o usuário anexou nesta conversa. Use SEMPRE que houver planilha anexada — nunca cadastre as pessoas uma a uma. ' +
        'Você não vê o conteúdo do arquivo, e não precisa: o sistema lê as linhas direto e valida os CPFs. ' +
        'Antes de chamar, descubra em qual setor a equipe entra: se o evento tiver mais de um setor e o usuário não disse qual, PERGUNTE. Precisa de confirmação.',
      parametros: {
        type: 'object',
        properties: {
          fornecedor_id: { type: 'string', description: 'setor que vai receber a equipe' },
        },
        required: ['fornecedor_id'],
      },
      executar: async ({ fornecedor_id }) => {
        const linhas = ctx.planilha
        if (!linhas?.length) {
          return 'Não há planilha anexada nesta conversa. Peça para a pessoa anexar o arquivo no clipe ao lado do campo de mensagem e mandar de novo.'
        }
        const barrado = exigirGestor(perfil, 'importa planilha')
        if (barrado) return barrado
        const r = await resolverSetor(perfil, fornecedor_id)
        if (!r.ok) return r.erro

        const { data: evento } = await supabaseAdmin
          .from('eventos').select('nome').eq('id', r.setor.evento_id).single()
        const resumo = resumirPlanilha(linhas)

        // A operação carrega a contagem: se a pessoa trocar o arquivo depois de
        // confirmar, a confirmação antiga não vale pro anexo novo.
        const operacao = `importar_planilha:${fornecedor_id}:${linhas.length}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Cadastrar ${linhas.length} pessoa${linhas.length !== 1 ? 's' : ''} da planilha no setor "${r.setor.nome}"${evento?.nome ? ` do evento ${evento.nome}` : ''}`,
            { ...resumo, setor: r.setor.nome, evento: evento?.nome ?? '' },
            'quantas pessoas vão entrar e em qual setor, avisando sobre linhas incompletas se houver',
            'criar'
          ))
        }

        const res = await importarFuncionarios(
          { role: perfil.role, organizacao_id: perfil.organizacao_id },
          fornecedor_id,
          linhas
        )
        if (!res.ok) return res.error

        await registrarAuditoriaIA(perfil, 'importar_planilha', {
          fornecedor_id, setor: r.setor.nome, evento_id: r.setor.evento_id, ...res,
        })
        return JSON.stringify({
          ...res,
          setor: r.setor.nome,
          observacao: [
            res.duplicados ? `${res.duplicados} já estavam neste evento e foram ignorados, sem duplicar ninguém.` : null,
            res.invalidos ? `${res.invalidos} linha(s) tinham CPF fora do formato (11 dígitos) e ficaram de fora — precisam ser corrigidas na planilha.` : null,
            res.reaproveitados ? `${res.reaproveitados} já estavam na base do Credenciei: telefone, cargo e PIX que faltavam foram preenchidos sozinhos.` : null,
          ].filter(Boolean).join(' ') || null,
        })
      },
    }),

    ferramenta({
      nome: 'excluir_funcionario',
      descricao:
        'Remove uma pessoa da equipe, junto com os registros de presença dela. Não tem desfazer — se a ideia é só tirar ela de circulação, desativar é melhor. ' +
        'Sempre chame primeiro sem confirmação para mostrar o impacto.',
      parametros: {
        type: 'object',
        properties: { funcionario_id: { type: 'string' } },
        required: ['funcionario_id'],
      },
      executar: async ({ funcionario_id }) => {
        const r = await resolverFuncionario(perfil, funcionario_id)
        if (!r.ok) return r.erro

        const [{ count: registros }, { data: pago }] = await Promise.all([
          supabaseAdmin.from('registros').select('id', { count: 'exact', head: true }).eq('funcionario_id', funcionario_id),
          supabaseAdmin.from('funcionarios').select('pago, valor_receber').eq('id', funcionario_id).single(),
        ])

        const operacao = `excluir_funcionario:${funcionario_id}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Excluir ${r.func.nome} (${formatCpf(r.func.cpf)}) do setor ${r.func.setorNome}`,
            {
              registros_de_presenca_apagados: registros ?? 0,
              pagamento: pago?.pago ? `JÁ FOI PAGA (${brl(Number(pago.valor_receber ?? 0))}) — o registro do pagamento some junto` : 'não paga',
              alternativa_reversivel: 'desativar a pessoa em vez de excluir',
            }
          ))
        }

        await supabaseAdmin.from('funcionarios').delete().eq('id', funcionario_id)
        await registrarAuditoriaIA(perfil, 'excluir_funcionario', {
          funcionario_id, nome: r.func.nome, cpf: r.func.cpf, registros_apagados: registros ?? 0,
        })
        return `${r.func.nome} foi excluída da equipe, junto com ${registros ?? 0} registro(s) de presença.`
      },
    }),
  ]
}

