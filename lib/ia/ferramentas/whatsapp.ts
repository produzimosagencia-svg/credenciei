import { supabaseAdmin } from '@/lib/supabase-server'
import { estadoDaInstancia } from '@/lib/whatsapp'
import { formatarBR, inputParaISO } from '@/lib/tz'
import { sincronizarAgendamentos } from '@/lib/mensagens'
import { registrarAuditoriaIA } from '../auditoria'
import {
  ferramenta, exigirEvento, exigirGestor, resolverSetor, resolverFuncionario,
  ROTULO_ETAPA,
  type ContextoIA, type PedirConfirmacao, type PerfilIA, type Resolucao,
} from './base'

/**
 * Ferramentas de WhatsApp.
 *
 * LIMITE QUE NÃO É DO CÓDIGO: mensagem iniciada pelo sistema só pode ser
 * TEMPLATE aprovado pela Meta — texto livre é recusado pela Cloud API. Então a
 * IA não "escreve uma mensagem e manda": ela reenvia, cancela ou reagenda os
 * tipos que já existem. Isso está nas descrições porque o modelo precisa saber
 * a diferença antes de prometer ao usuário algo que a Meta não deixa fazer.
 */

const TIPOS_VALIDOS = [
  'boas_vindas_funcionario', 'confirmacao_escala', 'aviso_dia_evento',
  'lembrete_entrada', 'lembrete_meio', 'lembrete_fim',
  'reforco_entrada', 'reforco_meio', 'reforco_fim',
] as const

/**
 * Estado do canal — sem isto a IA diz "reenviado" quando nada vai sair.
 *
 * Na Evolution a conexão cai sozinha (celular desligado, sessão derrubada,
 * número banido) e o envio falha em silêncio. Perguntar o estado da instância
 * é a diferença entre "não recebeu porque a instância está desconectada" e um
 * genérico "erro no envio".
 */
async function estadoDoCanal() {
  const configurada = !!(
    process.env.EVOLUTION_URL && process.env.EVOLUTION_INSTANCIA && process.env.EVOLUTION_APIKEY
  )
  const instancia = configurada ? await estadoDaInstancia() : { conectada: false, estado: 'não configurada' }
  return {
    envio_pausado: process.env.WHATSAPP_PAUSADO === 'true',
    credenciais_configuradas: configurada,
    instancia_conectada: instancia.conectada,
    estado_da_instancia: instancia.estado,
  }
}

/**
 * Ids dos funcionários que o alvo pedido alcança, já dentro do escopo do
 * usuário. Devolve `null` quando o alvo é inválido (a ferramenta responde).
 */
async function alvoParaFuncionarios(
  perfil: PerfilIA,
  eventoId: string,
  fornecedorId?: string,
  somenteSemRegistro?: 'entrada' | 'meio' | 'fim'
): Promise<Resolucao<{ ids: string[]; total: number }>> {
  const erro = await exigirEvento(perfil, eventoId)
  if (erro) return { ok: false, erro }

  // Supervisor nunca alcança além do próprio setor, mesmo pedindo "todos".
  const setorAlvo = perfil.role === 'supervisor' ? perfil.fornecedor_id ?? undefined : fornecedorId

  const q = supabaseAdmin
    .from('funcionarios')
    .select('id, fornecedores!inner(evento_id)')
    .eq('fornecedores.evento_id', eventoId)
    .eq('ativo', true)
  if (setorAlvo) q.eq('fornecedor_id', setorAlvo)
  const { data: pessoas } = await q
  let ids = (pessoas ?? []).map(p => p.id)

  if (somenteSemRegistro) {
    const { data: registros } = await supabaseAdmin
      .from('registros')
      .select('funcionario_id')
      .eq('evento_id', eventoId)
      .eq('tipo', somenteSemRegistro)
    const registrou = new Set((registros ?? []).map(r => r.funcionario_id))
    ids = ids.filter(id => !registrou.has(id))
  }

  return { ok: true, erro: null, ids, total: pessoas?.length ?? 0 }
}

export function ferramentasDeWhatsapp(ctx: ContextoIA, pedirConfirmacao: PedirConfirmacao) {
  const { perfil, confirmacoes } = ctx

  return [
    ferramenta({
      nome: 'diagnosticar_whatsapp',
      descricao:
        'Investiga por que uma pessoa não recebeu mensagem: mostra o que foi agendado pra ela, o status de cada envio e o erro quando falhou. Use para "fulano não recebeu o WhatsApp".',
      parametros: {
        type: 'object',
        properties: { funcionario_id: { type: 'string' } },
        required: ['funcionario_id'],
      },
      executar: async ({ funcionario_id }) => {
        const r = await resolverFuncionario(perfil, funcionario_id)
        if (!r.ok) return r.erro

        const { data: msgs } = await supabaseAdmin
          .from('mensagens_agendadas')
          .select('id, tipo, status, agendado_para, tentativas, erro, enviado_em')
          .eq('funcionario_id', funcionario_id)
          .order('agendado_para', { ascending: false })

        return JSON.stringify({
          pessoa: r.func.nome,
          telefone_cadastrado: r.func.telefone || 'SEM TELEFONE — nenhuma mensagem pode ser enviada',
          ativa: r.func.ativo || 'INATIVA — inativo não recebe lembrete nenhum',
          ...await estadoDoCanal(),
          mensagens: (msgs ?? []).map(m => ({
            mensagem_id: m.id,
            tipo: m.tipo,
            status: m.status,
            agendado_para: formatarBR(m.agendado_para, 'curto'),
            enviado_em: m.enviado_em ? formatarBR(m.enviado_em, 'curto') : null,
            tentativas: m.tentativas,
            erro: m.erro,
          })),
        })
      },
    }),

    ferramenta({
      nome: 'reenviar_whatsapp',
      descricao:
        'Reenvia mensagens de WhatsApp que já existem na fila, para sair de novo agora. Responde a "reenvie o convite para o João", "manda de novo pra todos", "reenvia só pra quem não bateu entrada". ' +
        'Escolha o alcance: uma pessoa (funcionario_id), um setor (fornecedor_id) ou o evento inteiro (só evento_id). ' +
        'IMPORTANTE: só dá para reenviar os tipos que o sistema já agenda — não existe mandar mensagem escrita por você, porque a Meta só aceita template aprovado. ' +
        'Reenvio para mais de uma pessoa precisa de confirmação.',
      parametros: {
        type: 'object',
        properties: {
          evento_id: { type: 'string' },
          funcionario_id: { type: 'string', description: 'para uma pessoa só' },
          fornecedor_id: { type: 'string', description: 'para um setor inteiro' },
          tipo: {
            type: 'string',
            enum: [...TIPOS_VALIDOS],
            description: 'qual mensagem reenviar. Omita para reenviar todas as que falharam.',
          },
          apenas_sem_registro: {
            type: 'string',
            enum: ['entrada', 'meio', 'fim'],
            description: 'restringe a quem ainda NÃO registrou esta etapa (é o "quem não fez check-in")',
          },
        },
        required: ['evento_id'],
      },
      executar: async ({ evento_id, funcionario_id, fornecedor_id, tipo, apenas_sem_registro }) => {
        let ids: string[]
        let escopo: string

        if (funcionario_id) {
          const r = await resolverFuncionario(perfil, funcionario_id)
          if (!r.ok) return r.erro
          if (!r.func.telefone) return `${r.func.nome} não tem telefone cadastrado. Sem número, nada pode ser enviado — cadastre o telefone com editar_funcionario primeiro.`
          ids = [funcionario_id]
          escopo = r.func.nome
        } else {
          if (fornecedor_id) {
            const s = await resolverSetor(perfil, fornecedor_id)
            if (!s.ok) return s.erro
            escopo = `setor ${s.setor.nome}`
          } else {
            escopo = 'evento inteiro'
          }
          const alvo = await alvoParaFuncionarios(perfil, evento_id, fornecedor_id, apenas_sem_registro)
          if (!alvo.ok) return alvo.erro
          ids = alvo.ids
          if (!ids.length) {
            return apenas_sem_registro
              ? `Ninguém está pendente na etapa ${ROTULO_ETAPA[apenas_sem_registro]} — todo mundo já registrou. Nada a reenviar.`
              : 'Nenhuma pessoa ativa encontrada nesse alcance.'
          }
        }

        // O que existe na fila para essas pessoas. Sem `tipo`, só o que falhou:
        // reenviar tudo que já foi entregue seria spam no telefone da equipe.
        const q = supabaseAdmin
          .from('mensagens_agendadas')
          .select('id, tipo, status, funcionario_id')
          .eq('evento_id', evento_id)
          .in('funcionario_id', ids)
        if (tipo) q.eq('tipo', tipo)
        else q.eq('status', 'falhou')
        const { data: msgs } = await q

        if (!msgs?.length) {
          return tipo
            ? `Não existe mensagem do tipo "${tipo}" agendada para esse alcance. Ela só é criada quando a janela de horário correspondente está preenchida — confira com detalhar_evento.`
            : 'Nenhuma mensagem falhada para reenviar nesse alcance. Se quer reenviar algo que já foi entregue, diga qual tipo.'
        }

        const operacao = `reenviar_whatsapp:${evento_id}:${tipo ?? 'falhadas'}:${msgs.length}`
        if (msgs.length > 1 && !confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Reenviar ${msgs.length} mensagem(ns) de WhatsApp — ${escopo}`,
            {
              pessoas_alcancadas: new Set(msgs.map(m => m.funcionario_id)).size,
              tipo: tipo ?? 'todas as que falharam',
              filtro: apenas_sem_registro ? `só quem não registrou ${ROTULO_ETAPA[apenas_sem_registro]}` : 'sem filtro',
              ...await estadoDoCanal(),
            },
            'quantas pessoas vão receber e qual mensagem',
            'criar'
          ))
        }

        await supabaseAdmin.from('mensagens_agendadas').update({
          status: 'pendente',
          tentativas: 0,
          proxima_tentativa: null,
          erro: null,
          agendado_para: new Date().toISOString(),
        }).in('id', msgs.map(m => m.id))

        await registrarAuditoriaIA(perfil, 'reenviar_whatsapp', {
          evento_id, escopo, tipo: tipo ?? 'falhadas', quantidade: msgs.length,
        })

        const canal = await estadoDoCanal()
        return JSON.stringify({
          ok: true,
          reenviadas: msgs.length,
          pessoas: new Set(msgs.map(m => m.funcionario_id)).size,
          escopo,
          observacao: canal.envio_pausado
            ? 'ATENÇÃO: o envio está PAUSADO no sistema. As mensagens foram reagendadas, mas nada sai até o envio ser reativado.'
            : !canal.credenciais_configuradas
              ? 'ATENÇÃO: as credenciais do WhatsApp não estão configuradas neste ambiente — nada será entregue.'
              : 'Devem sair no próximo ciclo de envio, em poucos minutos.',
        })
      },
    }),

    ferramenta({
      nome: 'cancelar_mensagens_agendadas',
      descricao:
        'Cancela mensagens que ainda NÃO foram enviadas. Use quando o evento mudou e os lembretes velhos não fazem mais sentido, ou para parar um envio antes que saia. ' +
        'Não desfaz o que já foi entregue. Precisa de confirmação.',
      parametros: {
        type: 'object',
        properties: {
          evento_id: { type: 'string' },
          fornecedor_id: { type: 'string', description: 'restringe a um setor' },
          funcionario_id: { type: 'string', description: 'restringe a uma pessoa' },
          tipo: { type: 'string', enum: [...TIPOS_VALIDOS] },
        },
        required: ['evento_id'],
      },
      executar: async ({ evento_id, fornecedor_id, funcionario_id, tipo }) => {
        const barrado = exigirGestor(perfil, 'cancela envios do evento')
        if (barrado) return barrado
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const q = supabaseAdmin
          .from('mensagens_agendadas')
          .select('id, tipo, funcionario_id')
          .eq('evento_id', evento_id)
          .in('status', ['pendente', 'falhou'])
        if (tipo) q.eq('tipo', tipo)

        if (funcionario_id) {
          const r = await resolverFuncionario(perfil, funcionario_id)
          if (!r.ok) return r.erro
          q.eq('funcionario_id', funcionario_id)
        } else if (fornecedor_id) {
          const s = await resolverSetor(perfil, fornecedor_id)
          if (!s.ok) return s.erro
          const alvo = await alvoParaFuncionarios(perfil, evento_id, fornecedor_id)
          if (!alvo.ok) return alvo.erro
          if (!alvo.ids.length) return 'Nenhuma pessoa ativa nesse setor.'
          q.in('funcionario_id', alvo.ids)
        }

        const { data: msgs } = await q
        if (!msgs?.length) return 'Não há mensagem pendente para cancelar nesse alcance.'

        const operacao = `cancelar_mensagens:${evento_id}:${tipo ?? 'todas'}:${msgs.length}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Cancelar ${msgs.length} mensagem(ns) ainda não enviada(s)`,
            {
              tipo: tipo ?? 'todos os tipos pendentes',
              pessoas_afetadas: new Set(msgs.map(m => m.funcionario_id)).size,
              atencao: 'a equipe deixa de receber estes lembretes; cancelamento não é revertido por si só',
            }
          ))
        }

        await supabaseAdmin.from('mensagens_agendadas')
          .update({ status: 'cancelado' })
          .in('id', msgs.map(m => m.id))

        await registrarAuditoriaIA(perfil, 'cancelar_mensagens_agendadas', {
          evento_id, tipo: tipo ?? 'todas', quantidade: msgs.length,
        })
        return `${msgs.length} mensagem(ns) cancelada(s). Elas não serão mais enviadas. Se quiser recriar os lembretes padrão depois, é só salvar as janelas de horário de novo com configurar_janelas.`
      },
    }),

    ferramenta({
      nome: 'listar_mensagens_agendadas',
      descricao:
        'Panorama da fila de WhatsApp de um evento: quantas estão pendentes, enviadas, falhadas e canceladas, por tipo. Use antes de reenviar em lote, para saber o que existe.',
      parametros: {
        type: 'object',
        properties: {
          evento_id: { type: 'string' },
          apenas_problemas: { type: 'boolean', description: 'true lista só as que falharam' },
        },
        required: ['evento_id'],
      },
      executar: async ({ evento_id, apenas_problemas }) => {
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const { data: msgs } = await supabaseAdmin
          .from('mensagens_agendadas')
          .select('tipo, status, erro, agendado_para, funcionarios(nome)')
          .eq('evento_id', evento_id)
          .order('agendado_para', { ascending: true })

        const porTipo = new Map<string, Record<string, number>>()
        for (const m of msgs ?? []) {
          const linha = porTipo.get(m.tipo) ?? {}
          linha[m.status] = (linha[m.status] ?? 0) + 1
          porTipo.set(m.tipo, linha)
        }

        const falhadas = (msgs ?? [])
          .filter(m => m.status === 'falhou')
          .slice(0, 20)
          .map(m => ({
            pessoa: (m.funcionarios as unknown as { nome: string } | null)?.nome ?? '—',
            tipo: m.tipo,
            erro: m.erro,
          }))

        return JSON.stringify({
          ...await estadoDoCanal(),
          resumo_por_tipo: apenas_problemas ? undefined : Object.fromEntries(porTipo),
          total: msgs?.length ?? 0,
          falhadas_amostra: falhadas,
          nota: 'Mensagem só existe na fila quando a janela de horário correspondente está preenchida no evento.',
        })
      },
    }),

    ferramenta({
      nome: 'configurar_mensagem_pre_evento',
      descricao:
        'Agenda a confirmação de escala: a mensagem que a equipe recebe ANTES do evento, com função, setor, data, local e instruções livres. ' +
        'É a única mensagem cujo horário e texto de instruções o organizador escolhe — as outras seguem as janelas de horário. ' +
        'Passe `quando` como "AAAA-MM-DDTHH:mm"; string vazia desliga o envio.',
      parametros: {
        type: 'object',
        properties: {
          evento_id: { type: 'string' },
          quando: { type: 'string', description: 'AAAA-MM-DDTHH:mm, ou "" para desligar' },
          instrucoes: { type: 'string', description: 'texto livre que entra na mensagem (uniforme, ponto de encontro...)' },
        },
        required: ['evento_id'],
      },
      executar: async ({ evento_id, quando, instrucoes }) => {
        const barrado = exigirGestor(perfil, 'configura a mensagem pré-evento')
        if (barrado) return barrado
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const mudancas: Record<string, unknown> = {}
        if (quando != null) {
          const iso = String(quando).trim() ? inputParaISO(quando) : null
          if (String(quando).trim() && !iso) return 'Data inválida. Use AAAA-MM-DDTHH:mm.'
          if (iso && new Date(iso).getTime() < Date.now()) {
            return 'Esse horário já passou. A confirmação de escala só é agendada para o futuro — escolha outro momento.'
          }
          mudancas.msg_pre_evento_envio = iso
        }
        if (instrucoes != null) {
          mudancas.msg_pre_evento_instrucoes = String(instrucoes).trim() || null
        }
        if (!Object.keys(mudancas).length) return 'Informe o horário de envio e/ou as instruções.'

        await supabaseAdmin.from('eventos').update(mudancas).eq('id', evento_id)
        await sincronizarAgendamentos(evento_id).catch(console.error)
        await registrarAuditoriaIA(perfil, 'configurar_mensagem_pre_evento', { evento_id, mudancas })

        const desligou = 'msg_pre_evento_envio' in mudancas && mudancas.msg_pre_evento_envio == null
        return desligou
          ? 'Confirmação de escala desligada — a equipe não vai receber a mensagem pré-evento.'
          : `Confirmação de escala agendada para ${formatarBR(mudancas.msg_pre_evento_envio as string)}. Toda a equipe ativa recebe nesse horário.`
      },
    }),
  ]
}
