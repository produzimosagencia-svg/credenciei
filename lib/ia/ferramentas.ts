import { supabaseAdmin } from '@/lib/supabase-server'
import { ehMaster, ROLE_LABELS, type Role } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { formatCpf, validarCpf } from '@/lib/format'
import { registrarAuditoriaIA } from './auditoria'
import { importarFuncionarios } from '@/lib/importacao'
import { resumirPlanilha, type LinhaPlanilha } from '@/lib/planilha'

export type PerfilIA = {
  id: string
  nome: string
  email: string
  role: Role
  organizacao_id: string | null
  fornecedor_id: string | null
}

/**
 * Contexto de uma conversa. `confirmacoes` são as operações destrutivas que o
 * USUÁRIO liberou clicando em confirmar na interface — chegam no corpo da
 * requisição, fora do alcance do modelo.
 *
 * É isso que impede a IA de se auto-confirmar: ela pode pedir a exclusão à
 * vontade, mas quem coloca o id na lista é o clique da pessoa, não o texto que
 * o modelo gera.
 */
export type PedidoConfirmacao = {
  operacao: string
  resumo: string
  impacto: Record<string, unknown>
  /** Só define a cara do cartão na interface. A trava é igual nos dois. */
  tipo: 'excluir' | 'criar'
}

export type ContextoIA = {
  perfil: PerfilIA
  confirmacoes: Set<string>
  /**
   * Chamado quando uma exclusão para à espera do aval humano. A interface
   * desenha o botão a partir DISSO, não do texto do modelo — assim o botão de
   * confirmar nunca aparece por causa de algo que a IA escreveu.
   */
  aoPedirConfirmacao?: (pedido: PedidoConfirmacao) => void
  /**
   * Linhas da planilha que o usuário anexou ao chat, já lidas pelo navegador.
   *
   * Elas NÃO entram na conversa com o modelo — a IA recebe só um resumo
   * (quantas linhas, quais cargos) e o nome da ferramenta que as usa. Assim
   * nenhum CPF passa pelo modelo pra ser transcrito de volta com um dígito
   * trocado, e os dados das pessoas não viram texto de prompt.
   */
  planilha?: LinhaPlanilha[]
}

// ─── Escopo: o que este usuário pode enxergar ────────────────────────────────

/** Ids dos eventos visíveis pra este perfil. Base de quase toda consulta. */
async function eventosVisiveis(perfil: PerfilIA): Promise<string[]> {
  if (perfil.role === 'supervisor') {
    if (!perfil.fornecedor_id) return []
    const { data } = await supabaseAdmin
      .from('fornecedores')
      .select('evento_id')
      .eq('id', perfil.fornecedor_id)
      .single()
    return data?.evento_id ? [data.evento_id] : []
  }
  const q = supabaseAdmin.from('eventos').select('id')
  if (!ehMaster(perfil.role)) q.eq('organizacao_id', perfil.organizacao_id)
  const { data } = await q
  return (data ?? []).map(e => e.id)
}

/** Confere que o evento está no escopo antes de qualquer leitura ou ação. */
async function exigirEvento(perfil: PerfilIA, eventoId: string): Promise<string | null> {
  const ids = await eventosVisiveis(perfil)
  if (!ids.includes(eventoId)) {
    return 'Este evento não existe ou está fora do seu acesso.'
  }
  return null
}

/** Supervisor só mexe no próprio setor. */
function exigirSetor(perfil: PerfilIA, fornecedorId: string): string | null {
  if (perfil.role === 'supervisor' && perfil.fornecedor_id !== fornecedorId) {
    return 'Este setor é de outro supervisor. Você só acessa o seu.'
  }
  return null
}

const ORDEM_ETAPAS = ['entrada', 'meio', 'fim'] as const
const ROTULO_ETAPA: Record<string, string> = { entrada: 'Entrada', meio: 'Meio do evento', fim: 'Saída' }

/**
 * Uma ferramenta, sem amarra com provedor de IA nenhum: nome, descrição, schema
 * JSON dos parâmetros e a função que executa. Quem traduz isso pro formato do
 * Gemini é o agente — se um dia trocar de provedor de novo, este arquivo (que é
 * onde vivem as regras de permissão e a trava de confirmação) não muda.
 */
export type Ferramenta = {
  nome: string
  descricao: string
  parametros: Record<string, unknown>
  executar: (args: Record<string, never>) => Promise<string>
}

/** Só dá forma ao objeto — existe pra manter a inferência dos argumentos. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ferramenta<T extends Record<string, any>>(f: {
  nome: string
  descricao: string
  parametros: Record<string, unknown>
  executar: (args: T) => Promise<string>
}): Ferramenta {
  return f as unknown as Ferramenta
}

// ─── Ferramentas ─────────────────────────────────────────────────────────────

export function ferramentasPara(ctx: ContextoIA) {
  const { perfil, confirmacoes } = ctx

  /** Resposta padronizada quando falta o aval humano — e avisa a interface. */
  const pedirConfirmacao = (
    operacao: string,
    resumo: string,
    impacto: Record<string, unknown>,
    oQueVaiAcontecer = 'exatamente o que será apagado',
    tipo: 'excluir' | 'criar' = 'excluir'
  ) => {
    ctx.aoPedirConfirmacao?.({ operacao, resumo, impacto, tipo })
    return {
      precisa_confirmar: true,
      operacao,
      resumo,
      impacto,
      instrucao_para_a_ia:
        `NÃO execute e NÃO chame esta ferramenta de novo. Explique ao usuário ${oQueVaiAcontecer}, com os números do impacto, e encerre sua vez. A interface mostrará o botão de confirmação.`,
    }
  }

  const podeExcluirEvento = ehMaster(perfil.role)
  const podeGerenciarUsuarios = perfil.role === 'master' || perfil.role === 'admin' || perfil.role === 'gerente'

  const consultar = [
    ferramenta({
      nome: 'listar_eventos',
      descricao:
        'Lista os eventos que este usuário pode ver, com datas, local, quantos setores e se está ativo. Use quando perguntarem sobre eventos, ou quando precisar descobrir o id de um evento citado pelo nome.',
      parametros: {
        type: 'object',
        properties: {
          apenas_ativos: { type: 'boolean', description: 'true para trazer só os eventos em andamento' },
        },
      },
      executar: async ({ apenas_ativos }) => {
        const ids = await eventosVisiveis(perfil)
        if (!ids.length) return 'Nenhum evento visível para este usuário.'
        const q = supabaseAdmin
          .from('eventos')
          .select('id, nome, ativo, data_inicio, data_fim, local, fornecedores(count)')
          .in('id', ids)
          .order('data_inicio', { ascending: false })
        if (apenas_ativos) q.eq('ativo', true)
        const { data } = await q
        return JSON.stringify(
          (data ?? []).map(e => ({
            id: e.id,
            nome: e.nome,
            situacao: e.ativo ? 'ativo' : 'encerrado',
            inicio: e.data_inicio ? formatarBR(e.data_inicio, 'curto') : null,
            fim: e.data_fim ? formatarBR(e.data_fim, 'curto') : null,
            local: e.local,
            setores: (e.fornecedores as unknown as { count: number }[])?.[0]?.count ?? 0,
          }))
        )
      },
    }),

    ferramenta({
      nome: 'detalhar_evento',
      descricao:
        'Números completos de um evento: setores, total de pessoas, quantas registraram cada etapa, e as janelas de horário configuradas. Use para "como está o evento X" ou para conferir se as janelas estão preenchidas.',
      parametros: {
        type: 'object',
        properties: { evento_id: { type: 'string', description: 'id do evento' } },
        required: ['evento_id'],
      },
      executar: async ({ evento_id }) => {
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const [{ data: evento }, { data: setores }, { data: registros }] = await Promise.all([
          supabaseAdmin.from('eventos').select('*').eq('id', evento_id).single(),
          supabaseAdmin.from('fornecedores').select('id, nome, quantidade_estimada, funcionarios(count)').eq('evento_id', evento_id),
          supabaseAdmin.from('registros').select('tipo').eq('evento_id', evento_id),
        ])
        if (!evento) return 'Evento não encontrado.'

        const porEtapa = ORDEM_ETAPAS.map(t => ({
          etapa: ROTULO_ETAPA[t],
          registros: (registros ?? []).filter(r => r.tipo === t).length,
          janela: evento[`janela_${t}_inicio`] && evento[`janela_${t}_fim`]
            ? `${formatarBR(evento[`janela_${t}_inicio`], 'curto')} até ${formatarBR(evento[`janela_${t}_fim`], 'curto')}`
            : 'NÃO DEFINIDA (etapa bloqueada)',
        }))

        return JSON.stringify({
          nome: evento.nome,
          situacao: evento.ativo ? 'ativo' : 'encerrado',
          local: evento.local,
          setores: (setores ?? []).map(s => ({
            id: s.id,
            nome: s.nome,
            pessoas: (s.funcionarios as unknown as { count: number }[])?.[0]?.count ?? 0,
            teto: s.quantidade_estimada,
          })),
          total_pessoas: (setores ?? []).reduce(
            (a, s) => a + ((s.funcionarios as unknown as { count: number }[])?.[0]?.count ?? 0), 0),
          etapas: porEtapa,
        })
      },
    }),

    ferramenta({
      nome: 'pendencias_de_presenca',
      descricao:
        'Quem NÃO registrou uma etapa. Responde perguntas como "quem não bateu ponto", "quantos faltaram hoje", "quem está pendente na entrada". Traz nome, CPF, telefone e setor de cada pendente.',
      parametros: {
        type: 'object',
        properties: {
          evento_id: { type: 'string' },
          etapa: { type: 'string', enum: ['entrada', 'meio', 'fim'] },
          fornecedor_id: { type: 'string', description: 'opcional, para filtrar um setor' },
        },
        required: ['evento_id', 'etapa'],
      },
      executar: async ({ evento_id, etapa, fornecedor_id }) => {
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro
        const setorAlvo = perfil.role === 'supervisor' ? perfil.fornecedor_id : fornecedor_id

        const q = supabaseAdmin
          .from('funcionarios')
          .select('id, nome, cpf, telefone, ativo, fornecedores!inner(id, nome, evento_id)')
          .eq('fornecedores.evento_id', evento_id)
        if (setorAlvo) q.eq('fornecedor_id', setorAlvo)
        const { data: pessoas } = await q

        const { data: registros } = await supabaseAdmin
          .from('registros')
          .select('funcionario_id')
          .eq('evento_id', evento_id)
          .eq('tipo', etapa)
        const registrou = new Set((registros ?? []).map(r => r.funcionario_id))

        const pendentes = (pessoas ?? []).filter(p => !registrou.has(p.id))
        return JSON.stringify({
          etapa: ROTULO_ETAPA[etapa],
          total_na_equipe: pessoas?.length ?? 0,
          registraram: (pessoas?.length ?? 0) - pendentes.length,
          pendentes: pendentes.map(p => ({
            nome: p.nome,
            cpf: formatCpf(p.cpf),
            telefone: p.telefone,
            setor: (p.fornecedores as unknown as { nome: string })?.nome,
            ativo: p.ativo !== false,
          })),
        })
      },
    }),

    ferramenta({
      nome: 'buscar_funcionario',
      descricao:
        'Localiza uma pessoa da equipe por CPF ou parte do nome e mostra a ficha completa: setor, cargo, situação e o que ela já registrou. Use antes de qualquer ação sobre uma pessoa, para confirmar que é ela.',
      parametros: {
        type: 'object',
        properties: {
          busca: { type: 'string', description: 'CPF (com ou sem pontuação) ou parte do nome' },
        },
        required: ['busca'],
      },
      executar: async ({ busca }) => {
        const ids = await eventosVisiveis(perfil)
        if (!ids.length) return 'Nenhum evento visível para este usuário.'
        const digitos = busca.replace(/\D/g, '')

        const q = supabaseAdmin
          .from('funcionarios')
          .select('id, nome, cpf, telefone, empresa, cargo, ativo, fornecedor_id, fornecedores!inner(id, nome, evento_id, eventos!inner(id, nome))')
          .in('fornecedores.evento_id', ids)
          .limit(10)
        if (digitos.length >= 11) q.eq('cpf', digitos)
        else q.ilike('nome', `%${busca}%`)
        if (perfil.role === 'supervisor' && perfil.fornecedor_id) q.eq('fornecedor_id', perfil.fornecedor_id)

        const { data: achados } = await q
        if (!achados?.length) return 'Nenhuma pessoa encontrada com esse CPF ou nome, dentro do seu acesso.'

        const fichas = await Promise.all(
          achados.map(async f => {
            const forn = f.fornecedores as unknown as { id: string; nome: string; eventos: { id: string; nome: string } }
            const { data: regs } = await supabaseAdmin
              .from('registros')
              .select('tipo, created_at, registro_manual')
              .eq('funcionario_id', f.id)
              .eq('evento_id', forn.eventos.id)
            const feitos = new Map((regs ?? []).map(r => [r.tipo, r]))
            return {
              funcionario_id: f.id,
              nome: f.nome,
              cpf: formatCpf(f.cpf),
              telefone: f.telefone,
              empresa: f.empresa,
              cargo: f.cargo,
              ativo: f.ativo !== false,
              setor: { id: forn.id, nome: forn.nome },
              evento: { id: forn.eventos.id, nome: forn.eventos.nome },
              etapas: ORDEM_ETAPAS.map(t => ({
                etapa: ROTULO_ETAPA[t],
                registrado: feitos.has(t),
                em: feitos.get(t) ? formatarBR(feitos.get(t)!.created_at, 'curto') : null,
                pelo_supervisor: feitos.get(t)?.registro_manual === true,
              })),
              proxima_pendente: ORDEM_ETAPAS.find(t => !feitos.has(t)) ?? null,
            }
          })
        )
        return JSON.stringify(fichas)
      },
    }),

    ferramenta({
      nome: 'diagnosticar_whatsapp',
      descricao:
        'Investiga por que uma pessoa não recebeu mensagem no WhatsApp: mostra o que foi agendado pra ela, o status de cada envio e o erro quando falhou. Use para "fulano não recebeu o WhatsApp".',
      parametros: {
        type: 'object',
        properties: { funcionario_id: { type: 'string' } },
        required: ['funcionario_id'],
      },
      executar: async ({ funcionario_id }) => {
        const { data: func } = await supabaseAdmin
          .from('funcionarios')
          .select('nome, telefone, fornecedor_id, fornecedores!inner(evento_id)')
          .eq('id', funcionario_id)
          .single()
        if (!func) return 'Funcionário não encontrado.'
        const eventoId = (func.fornecedores as unknown as { evento_id: string }).evento_id
        const erro = await exigirEvento(perfil, eventoId)
        if (erro) return erro

        const { data: msgs } = await supabaseAdmin
          .from('mensagens_agendadas')
          .select('id, tipo, status, agendado_para, tentativas, erro, enviado_em, telefone')
          .eq('funcionario_id', funcionario_id)
          .order('agendado_para', { ascending: false })

        const pausado = process.env.WHATSAPP_PAUSADO === 'true'
        const semCredencial = !process.env.WHATSAPP_CLOUD_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID

        return JSON.stringify({
          pessoa: func.nome,
          telefone_cadastrado: func.telefone || 'SEM TELEFONE — nenhuma mensagem pode ser enviada',
          envio_pausado_no_sistema: pausado,
          credenciais_da_meta_configuradas: !semCredencial,
          mensagens: (msgs ?? []).map(m => ({
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
      nome: 'listar_usuarios',
      descricao:
        'Usuários com acesso ao sistema na organização (admins e supervisores), com papel, setor vinculado e situação. Não confunda com a equipe do evento.',
      parametros: { type: 'object', properties: {} },
      executar: async () => {
        if (!podeGerenciarUsuarios) return 'Seu papel não tem acesso à lista de usuários do sistema.'
        const q = supabaseAdmin.from('perfis').select('id, nome, email, role, ativo, fornecedores(nome)')
        if (!ehMaster(perfil.role)) q.eq('organizacao_id', perfil.organizacao_id)
        const { data } = await q
        return JSON.stringify(
          (data ?? []).map(u => ({
            id: u.id,
            nome: u.nome,
            email: u.email,
            papel: ROLE_LABELS[u.role as Role] ?? u.role,
            setor: (u.fornecedores as unknown as { nome: string } | null)?.nome ?? null,
            ativo: u.ativo !== false,
          }))
        )
      },
    }),
  ]

  const acoes = [
    ferramenta({
      nome: 'cadastrar_funcionario',
      descricao:
        'Cadastra uma pessoa na equipe de um setor. Confirme os dados com o usuário antes de chamar. Se o setor já bateu o teto, a pessoa entra inativa e precisa ser ativada depois.',
      parametros: {
        type: 'object',
        properties: {
          fornecedor_id: { type: 'string' },
          nome: { type: 'string' },
          cpf: { type: 'string' },
          telefone: { type: 'string' },
          empresa: { type: 'string' },
          cargo: { type: 'string' },
        },
        required: ['fornecedor_id', 'nome', 'cpf'],
      },
      executar: async ({ fornecedor_id, nome, cpf, telefone, empresa, cargo }) => {
        const barrado = exigirSetor(perfil, fornecedor_id)
        if (barrado) return barrado
        const digitos = String(cpf).replace(/\D/g, '')
        if (!validarCpf(digitos)) return 'CPF inválido — confira os números com o usuário.'

        const { data: setor } = await supabaseAdmin
          .from('fornecedores')
          .select('id, nome, evento_id')
          .eq('id', fornecedor_id)
          .single()
        if (!setor) return 'Setor não encontrado.'
        const erro = await exigirEvento(perfil, setor.evento_id)
        if (erro) return erro

        const { data: jaExiste } = await supabaseAdmin
          .from('funcionarios')
          .select('nome, fornecedores!inner(nome, evento_id)')
          .eq('cpf', digitos)
          .eq('fornecedores.evento_id', setor.evento_id)
          .limit(1)
        if (jaExiste?.length) {
          const outro = (jaExiste[0].fornecedores as unknown as { nome: string }).nome
          return `Este CPF já está cadastrado neste evento, no setor "${outro}". Uma pessoa não pode estar em dois setores do mesmo evento.`
        }

        const { data: novo, error } = await supabaseAdmin.from('funcionarios').insert([{
          fornecedor_id,
          nome: String(nome).trim(),
          cpf: digitos,
          telefone: String(telefone ?? '').replace(/\D/g, ''),
          empresa: String(empresa ?? setor.nome).trim(),
          cargo: String(cargo ?? '').trim(),
        }]).select('id, nome, ativo').single()
        if (error || !novo) return 'Não foi possível cadastrar. Tente pela tela do setor.'

        await registrarAuditoriaIA(perfil, 'cadastrar_funcionario', {
          funcionario_id: novo.id, nome: novo.nome, fornecedor_id,
        })
        return JSON.stringify({
          ok: true,
          funcionario_id: novo.id,
          nome: novo.nome,
          ativo: novo.ativo,
          observacao: novo.ativo === false
            ? 'Entrou INATIVA porque o setor passou do teto. Precisa ser ativada no painel do setor para registrar presença.'
            : null,
        })
      },
    }),

    ferramenta({
      nome: 'importar_planilha',
      descricao:
        'Cadastra de uma vez toda a equipe da planilha que o usuário anexou nesta conversa. Use SEMPRE que houver planilha anexada — nunca cadastre as pessoas uma a uma com cadastrar_funcionario. ' +
        'Você não vê o conteúdo do arquivo, e não precisa: o sistema lê as linhas direto e valida os CPFs. ' +
        'Antes de chamar, descubra em qual setor a equipe entra: se o evento tiver mais de um setor e o usuário não disse qual, PERGUNTE — não escolha por conta própria e não crie setor novo sem ele pedir. Precisa de confirmação do usuário.',
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
        const barrado = exigirSetor(perfil, fornecedor_id)
        if (barrado) return barrado
        if (perfil.role === 'supervisor') return 'Supervisor não importa planilha. Fale com o administrador da organização.'

        const { data: setor } = await supabaseAdmin
          .from('fornecedores')
          .select('id, nome, evento_id, eventos(nome)')
          .eq('id', fornecedor_id)
          .single()
        if (!setor) return 'Setor não encontrado.'
        const erro = await exigirEvento(perfil, setor.evento_id)
        if (erro) return erro

        const resumo = resumirPlanilha(linhas)
        const nomeEvento = (setor.eventos as unknown as { nome: string } | null)?.nome ?? ''

        // A operação carrega a contagem: se a pessoa trocar o arquivo depois de
        // confirmar, a confirmação antiga não vale pro anexo novo.
        const operacao = `importar_planilha:${fornecedor_id}:${linhas.length}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Cadastrar ${linhas.length} pessoa${linhas.length !== 1 ? 's' : ''} da planilha no setor "${setor.nome}"${nomeEvento ? ` do evento ${nomeEvento}` : ''}`,
            { ...resumo, setor: setor.nome, evento: nomeEvento },
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
          fornecedor_id, setor: setor.nome, evento_id: setor.evento_id, ...res,
        })
        return JSON.stringify({
          ...res,
          setor: setor.nome,
          observacao: [
            res.duplicados ? `${res.duplicados} já estavam neste evento e foram ignorados, sem duplicar ninguém.` : null,
            res.invalidos ? `${res.invalidos} linha(s) tinham CPF inválido e ficaram de fora — precisam ser corrigidas na planilha.` : null,
            res.reaproveitados ? `${res.reaproveitados} já estavam na base do Credenciei: telefone, cargo e PIX que faltavam foram preenchidos sozinhos.` : null,
          ].filter(Boolean).join(' ') || null,
        })
      },
    }),

    ferramenta({
      nome: 'alternar_ativacao_funcionario',
      descricao:
        'Ativa ou desativa uma pessoa da equipe. Desativada, ela não consegue registrar presença. É reversível.',
      parametros: {
        type: 'object',
        properties: {
          funcionario_id: { type: 'string' },
          ativo: { type: 'boolean', description: 'true para ativar, false para desativar' },
        },
        required: ['funcionario_id', 'ativo'],
      },
      executar: async ({ funcionario_id, ativo }) => {
        const { data: func } = await supabaseAdmin
          .from('funcionarios')
          .select('id, nome, fornecedor_id, fornecedores!inner(evento_id)')
          .eq('id', funcionario_id)
          .single()
        if (!func) return 'Funcionário não encontrado.'
        const barrado = exigirSetor(perfil, func.fornecedor_id)
        if (barrado) return barrado
        const erro = await exigirEvento(perfil, (func.fornecedores as unknown as { evento_id: string }).evento_id)
        if (erro) return erro

        await supabaseAdmin.from('funcionarios').update({ ativo }).eq('id', funcionario_id)
        await registrarAuditoriaIA(perfil, 'alternar_ativacao_funcionario', { funcionario_id, nome: func.nome, ativo })
        return `${func.nome} agora está ${ativo ? 'ativa' : 'inativa'}.`
      },
    }),

    ferramenta({
      nome: 'criar_setor',
      descricao: 'Cria um setor (fornecedor) dentro de um evento. Gera o link de cadastro da equipe.',
      parametros: {
        type: 'object',
        properties: {
          evento_id: { type: 'string' },
          nome: { type: 'string' },
          quantidade_estimada: { type: 'number', description: 'teto de pessoas do setor (opcional)' },
        },
        required: ['evento_id', 'nome'],
      },
      executar: async ({ evento_id, nome, quantidade_estimada }) => {
        if (perfil.role === 'supervisor') return 'Supervisor não cria setores. Fale com o administrador da organização.'
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const { data: novo, error } = await supabaseAdmin.from('fornecedores').insert([{
          evento_id,
          nome: String(nome).trim(),
          quantidade_estimada: quantidade_estimada ?? null,
        }]).select('id, nome, token_formulario').single()
        if (error || !novo) return 'Não foi possível criar o setor.'

        await registrarAuditoriaIA(perfil, 'criar_setor', { fornecedor_id: novo.id, nome: novo.nome, evento_id })
        return JSON.stringify({
          ok: true,
          fornecedor_id: novo.id,
          nome: novo.nome,
          link_de_cadastro: `/form/${novo.token_formulario}`,
        })
      },
    }),

    ferramenta({
      nome: 'reenviar_mensagem_whatsapp',
      descricao:
        'Reagenda uma mensagem de WhatsApp que falhou, para sair de novo agora. Use depois de diagnosticar e corrigir a causa (telefone errado, por exemplo).',
      parametros: {
        type: 'object',
        properties: { mensagem_id: { type: 'string', description: 'id da mensagem em mensagens_agendadas' } },
        required: ['mensagem_id'],
      },
      executar: async ({ mensagem_id }) => {
        const { data: msg } = await supabaseAdmin
          .from('mensagens_agendadas')
          .select('id, evento_id, tipo, status, telefone')
          .eq('id', mensagem_id)
          .single()
        if (!msg) return 'Mensagem não encontrada.'
        const erro = await exigirEvento(perfil, msg.evento_id)
        if (erro) return erro

        await supabaseAdmin.from('mensagens_agendadas').update({
          status: 'pendente',
          tentativas: 0,
          proxima_tentativa: null,
          erro: null,
          agendado_para: new Date().toISOString(),
        }).eq('id', mensagem_id)

        await registrarAuditoriaIA(perfil, 'reenviar_mensagem_whatsapp', { mensagem_id, tipo: msg.tipo })
        const pausado = process.env.WHATSAPP_PAUSADO === 'true'
        return pausado
          ? 'Reagendada, mas o envio está PAUSADO no sistema (WHATSAPP_PAUSADO=true) — ela só sai quando o envio for reativado.'
          : 'Reagendada. Deve sair no próximo ciclo de envio (poucos minutos).'
      },
    }),
  ]

  // ─── Destrutivas: só rodam com o id da operação liberado pelo usuário ───────

  const destrutivas = [
    ferramenta({
      nome: 'excluir_funcionario',
      descricao:
        'Remove uma pessoa da equipe, junto com os registros de presença dela. Não tem desfazer. Sempre chame primeiro sem confirmação para mostrar o impacto ao usuário.',
      parametros: {
        type: 'object',
        properties: { funcionario_id: { type: 'string' } },
        required: ['funcionario_id'],
      },
      executar: async ({ funcionario_id }) => {
        const { data: func } = await supabaseAdmin
          .from('funcionarios')
          .select('id, nome, cpf, fornecedor_id, fornecedores!inner(nome, evento_id)')
          .eq('id', funcionario_id)
          .single()
        if (!func) return 'Funcionário não encontrado.'
        const barrado = exigirSetor(perfil, func.fornecedor_id)
        if (barrado) return barrado
        const forn = func.fornecedores as unknown as { nome: string; evento_id: string }
        const erro = await exigirEvento(perfil, forn.evento_id)
        if (erro) return erro

        const { count } = await supabaseAdmin
          .from('registros')
          .select('id', { count: 'exact', head: true })
          .eq('funcionario_id', funcionario_id)

        const operacao = `excluir_funcionario:${funcionario_id}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Excluir ${func.nome} (${formatCpf(func.cpf)}) do setor ${forn.nome}`,
            { registros_de_presenca_apagados: count ?? 0 }
          ))
        }

        await supabaseAdmin.from('funcionarios').delete().eq('id', funcionario_id)
        await registrarAuditoriaIA(perfil, 'excluir_funcionario', {
          funcionario_id, nome: func.nome, cpf: func.cpf, registros_apagados: count ?? 0,
        })
        return `${func.nome} foi excluída da equipe, junto com ${count ?? 0} registro(s) de presença.`
      },
    }),

    ferramenta({
      nome: 'excluir_setor',
      descricao:
        'Remove um setor e TODA a equipe dele. Não tem desfazer. Sempre chame primeiro sem confirmação para mostrar o impacto.',
      parametros: {
        type: 'object',
        properties: { fornecedor_id: { type: 'string' } },
        required: ['fornecedor_id'],
      },
      executar: async ({ fornecedor_id }) => {
        if (perfil.role === 'supervisor') return 'Supervisor não exclui setores.'
        const { data: setor } = await supabaseAdmin
          .from('fornecedores')
          .select('id, nome, evento_id, funcionarios(count)')
          .eq('id', fornecedor_id)
          .single()
        if (!setor) return 'Setor não encontrado.'
        const erro = await exigirEvento(perfil, setor.evento_id)
        if (erro) return erro
        const pessoas = (setor.funcionarios as unknown as { count: number }[])?.[0]?.count ?? 0

        const operacao = `excluir_setor:${fornecedor_id}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Excluir o setor ${setor.nome}`,
            { pessoas_da_equipe_apagadas: pessoas, presencas_apagadas: 'todas as do setor' }
          ))
        }

        await supabaseAdmin.from('fornecedores').delete().eq('id', fornecedor_id)
        await registrarAuditoriaIA(perfil, 'excluir_setor', { fornecedor_id, nome: setor.nome, pessoas })
        return `Setor ${setor.nome} excluído, junto com ${pessoas} pessoa(s) da equipe.`
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
        if (!podeExcluirEvento) {
          return 'Só o master exclui eventos. Se o evento acabou, o caminho certo é encerrá-lo (reversível), não excluir.'
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

  return [...consultar, ...acoes, ...destrutivas]
}
