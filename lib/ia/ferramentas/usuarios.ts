import { supabaseAdmin } from '@/lib/supabase-server'
import { ehMaster, ROLE_LABELS, type Role } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { agendarCredenciaisSupervisor } from '@/lib/mensagens'
import { registrarAuditoriaIA } from '../auditoria'
import {
  ferramenta, resolverSetor, podeGerenciarUsuariosIA, urlBase,
  type ContextoIA, type PedirConfirmacao, type PerfilIA, type Resolucao,
} from './base'

/**
 * Ferramentas de acesso ao sistema: supervisores.
 *
 * Estes são os usuários que FAZEM LOGIN — não confundir com a equipe do evento,
 * que não tem conta. Criar um supervisor cria uma conta de verdade no Supabase
 * Auth, então cada ferramenta aqui checa duas coisas: se quem pede gerencia
 * usuários, e se o alvo é da mesma organização.
 */

/**
 * Senha inicial gerada pelo sistema, não pelo modelo.
 *
 * Se a IA escolhesse a senha, ela seria previsível (modelo de linguagem
 * escolhendo "Senha@123") e ficaria escrita no histórico da conversa, que mora
 * no localStorage do navegador. Gerada aqui, ela sai por WhatsApp e nunca
 * aparece no chat — a não ser quando não há telefone, único caso em que não
 * existe outro caminho até o supervisor.
 */
function senhaInicial(): string {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(14))
  return Array.from(bytes, b => alfabeto[b % alfabeto.length]).join('')
}

/** Admin só mexe em quem é da própria organização; master mexe em todos. */
async function exigirMesmaOrganizacao(perfil: PerfilIA, perfilAlvoId: string): Promise<
  Resolucao<{ alvo: { id: string; nome: string; email: string; role: string; fornecedor_id: string | null; organizacao_id: string | null } }>
> {
  const { data: alvo } = await supabaseAdmin
    .from('perfis')
    .select('id, nome, email, role, fornecedor_id, organizacao_id')
    .eq('id', perfilAlvoId)
    .single()
  if (!alvo) return { ok: false, erro: 'Usuário não encontrado.' }
  if (!ehMaster(perfil.role) && alvo.organizacao_id !== perfil.organizacao_id) {
    return { ok: false, erro: 'Este usuário é de outra organização. Você não tem acesso a ele.' }
  }
  return { ok: true, erro: null, alvo }
}

export function ferramentasDeUsuario(ctx: ContextoIA, pedirConfirmacao: PedirConfirmacao) {
  const { perfil, confirmacoes } = ctx
  const gerencia = podeGerenciarUsuariosIA(perfil)

  return [
    ferramenta({
      nome: 'listar_usuarios',
      descricao:
        'Usuários com acesso ao sistema na organização (admins e supervisores), com papel, setor vinculado e situação. Não confunda com a equipe do evento — para a equipe use buscar_funcionario.',
      parametros: { type: 'object', properties: {} },
      executar: async () => {
        if (!gerencia) return 'Seu papel não tem acesso à lista de usuários do sistema.'
        const q = supabaseAdmin
          .from('perfis')
          .select('id, nome, email, telefone, role, ativo, fornecedor_id, fornecedores(nome, evento_id)')
        if (!ehMaster(perfil.role)) q.eq('organizacao_id', perfil.organizacao_id)
        const { data } = await q
        return JSON.stringify(
          (data ?? []).map(u => {
            const forn = u.fornecedores as unknown as { nome: string; evento_id: string } | null
            return {
              perfil_id: u.id,
              nome: u.nome,
              email: u.email,
              telefone: u.telefone,
              papel: ROLE_LABELS[u.role as Role] ?? u.role,
              setor: forn?.nome ?? null,
              fornecedor_id: u.fornecedor_id,
              ativo: u.ativo !== false,
            }
          })
        )
      },
    }),

    ferramenta({
      nome: 'criar_supervisor',
      descricao:
        'Cria um supervisor com acesso ao sistema, preso a UM setor. A senha é gerada pelo sistema e enviada por WhatsApp junto com o login — você não escolhe a senha e não deve inventar uma. ' +
        'Precisa de confirmação, porque cria uma conta de acesso de verdade.',
      parametros: {
        type: 'object',
        properties: {
          fornecedor_id: { type: 'string', description: 'setor que ele vai supervisionar' },
          nome: { type: 'string' },
          email: { type: 'string', description: 'e-mail de login' },
          telefone: { type: 'string', description: 'WhatsApp — é por onde ele recebe login e senha' },
        },
        required: ['fornecedor_id', 'nome', 'email'],
      },
      executar: async ({ fornecedor_id, nome, email, telefone }) => {
        if (!gerencia) return 'Seu papel não cria usuários. Isso é do administrador da organização.'
        const r = await resolverSetor(perfil, fornecedor_id)
        if (!r.ok) return r.erro

        const emailLimpo = String(email).trim().toLowerCase()
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailLimpo)) return 'E-mail inválido. Confira o endereço.'
        const fone = String(telefone ?? '').replace(/\D/g, '')

        const { data: jaExiste } = await supabaseAdmin
          .from('perfis').select('id, nome').eq('email', emailLimpo).limit(1)
        if (jaExiste?.length) return `Este e-mail já é usado por ${jaExiste[0].nome}. Use outro.`

        const operacao = `criar_supervisor:${emailLimpo}:${fornecedor_id}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Criar acesso de supervisor para ${nome} no setor ${r.setor.nome}`,
            {
              email: emailLimpo,
              setor: r.setor.nome,
              acesso: 'ele passa a enxergar apenas a equipe deste setor',
              senha: fone
                ? 'gerada pelo sistema e enviada por WhatsApp'
                : 'SEM TELEFONE — a senha vai aparecer aqui no chat uma única vez',
            },
            'que uma conta de acesso será criada e como ele recebe a senha',
            'criar'
          ))
        }

        const senha = senhaInicial()
        const { data: user, error } = await supabaseAdmin.auth.admin.createUser({
          email: emailLimpo,
          password: senha,
          email_confirm: true,
        })
        if (error || !user?.user) {
          return error?.message?.toLowerCase().includes('already')
            ? 'Este e-mail já tem conta no sistema. Use outro endereço.'
            : 'Não foi possível criar o acesso. Confira o e-mail e tente pela tela de Usuários.'
        }

        const { data: evento } = await supabaseAdmin
          .from('eventos').select('nome, data_inicio').eq('id', r.setor.evento_id).single()

        await supabaseAdmin.from('perfis').insert([{
          id: user.user.id,
          nome: String(nome).trim(),
          email: emailLimpo,
          telefone: fone,
          ativo: true,
          role: 'supervisor',
          organizacao_id: perfil.organizacao_id,
          fornecedor_id,
        }])

        if (fone) {
          agendarCredenciaisSupervisor({
            eventoId: r.setor.evento_id,
            perfilId: user.user.id,
            telefone: fone,
            nome: String(nome).trim(),
            setorNome: r.setor.nome,
            eventoNome: evento?.nome ?? '',
            dataEvento: formatarBR(evento?.data_inicio, 'data'),
            email: emailLimpo,
            senha,
            linkFormulario: `${urlBase()}/form/${r.setor.token_formulario}`,
          }).catch(console.error)
        }

        // A senha nunca é auditada — o log guarda que a conta foi criada, não
        // como entrar nela.
        await registrarAuditoriaIA(perfil, 'criar_supervisor', {
          perfil_id: user.user.id, nome, email: emailLimpo, fornecedor_id, setor: r.setor.nome,
        })

        return JSON.stringify({
          ok: true,
          perfil_id: user.user.id,
          nome,
          email: emailLimpo,
          setor: r.setor.nome,
          senha_enviada_por_whatsapp: !!fone,
          senha: fone ? null : senha,
          observacao: fone
            ? 'Login e senha saíram no WhatsApp dele. Não repita a senha no chat — você não a tem.'
            : 'Ele não tem telefone cadastrado, então a senha não pôde ser enviada. Passe esta senha para ele agora, por um canal seguro: ela não fica guardada em lugar nenhum.',
        })
      },
    }),

    ferramenta({
      nome: 'editar_supervisor',
      descricao:
        'Altera nome, e-mail, telefone ou situação (ativo/inativo) de um usuário. Também redefine a senha, quando `redefinir_senha` vier true — a nova vai por WhatsApp. ' +
        'Desativar é o jeito reversível de tirar o acesso de alguém.',
      parametros: {
        type: 'object',
        properties: {
          perfil_id: { type: 'string' },
          nome: { type: 'string' },
          email: { type: 'string' },
          telefone: { type: 'string' },
          ativo: { type: 'boolean' },
          redefinir_senha: { type: 'boolean', description: 'true gera senha nova' },
        },
        required: ['perfil_id'],
      },
      executar: async ({ perfil_id, nome, email, telefone, ativo, redefinir_senha }) => {
        if (!gerencia) return 'Seu papel não edita usuários. Isso é do administrador da organização.'
        const r = await exigirMesmaOrganizacao(perfil, perfil_id)
        if (!r.ok) return r.erro

        const mudancas: Record<string, unknown> = {}
        if (nome != null) mudancas.nome = String(nome).trim()
        if (telefone != null) mudancas.telefone = String(telefone).replace(/\D/g, '')
        if (ativo != null) mudancas.ativo = ativo
        if (email != null) {
          const e = String(email).trim().toLowerCase()
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return 'E-mail inválido.'
          mudancas.email = e
        }

        let senhaNova: string | null = null
        if (redefinir_senha) senhaNova = senhaInicial()

        if (mudancas.email || senhaNova) {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(perfil_id, {
            ...(mudancas.email ? { email: mudancas.email as string } : {}),
            ...(senhaNova ? { password: senhaNova } : {}),
          })
          if (error) return 'Não foi possível atualizar o acesso. O e-mail pode já estar em uso.'
        }

        if (Object.keys(mudancas).length) {
          await supabaseAdmin.from('perfis').update(mudancas).eq('id', perfil_id)
        } else if (!senhaNova) {
          return 'Nenhum campo para alterar foi informado.'
        }

        await registrarAuditoriaIA(perfil, 'editar_supervisor', {
          perfil_id, nome: r.alvo.nome, alterado: Object.keys(mudancas), senha_redefinida: !!senhaNova,
        })

        return JSON.stringify({
          ok: true,
          usuario: r.alvo.nome,
          alterado: Object.keys(mudancas),
          senha: senhaNova,
          observacao: senhaNova
            ? 'Senha redefinida. Ela não fica guardada em lugar nenhum — passe para a pessoa agora, por um canal seguro.'
            : ativo === false
              ? 'O acesso foi bloqueado, mas o histórico dela continua intacto. Dá pra reativar quando quiser.'
              : null,
        })
      },
    }),

    ferramenta({
      nome: 'vincular_supervisor_ao_setor',
      descricao:
        'Move um supervisor para outro setor. Ele passa a enxergar só a equipe do setor novo e perde o acesso ao anterior na hora.',
      parametros: {
        type: 'object',
        properties: {
          perfil_id: { type: 'string' },
          fornecedor_id: { type: 'string', description: 'setor de destino' },
        },
        required: ['perfil_id', 'fornecedor_id'],
      },
      executar: async ({ perfil_id, fornecedor_id }) => {
        if (!gerencia) return 'Seu papel não muda o setor de um supervisor.'
        const r = await exigirMesmaOrganizacao(perfil, perfil_id)
        if (!r.ok) return r.erro
        if (r.alvo.role !== 'supervisor') {
          return `${r.alvo.nome} é ${ROLE_LABELS[r.alvo.role as Role] ?? r.alvo.role}, não supervisor. Só supervisor fica preso a um setor.`
        }
        const destino = await resolverSetor(perfil, fornecedor_id)
        if (!destino.ok) return destino.erro
        if (r.alvo.fornecedor_id === fornecedor_id) {
          return `${r.alvo.nome} já supervisiona o setor ${destino.setor.nome}. Nada a fazer.`
        }

        await supabaseAdmin.from('perfis').update({ fornecedor_id }).eq('id', perfil_id)
        await registrarAuditoriaIA(perfil, 'vincular_supervisor_ao_setor', {
          perfil_id, nome: r.alvo.nome, fornecedor_id, setor: destino.setor.nome,
        })
        return `${r.alvo.nome} agora supervisiona o setor ${destino.setor.nome}. O acesso ao setor anterior foi encerrado.`
      },
    }),

    ferramenta({
      nome: 'excluir_usuario',
      descricao:
        'Apaga a conta de acesso de um usuário. Não tem desfazer, e não dá para excluir a si mesmo. ' +
        'Se a intenção é só bloquear o acesso, desativar com editar_supervisor é reversível e melhor. Sempre chame primeiro sem confirmação.',
      parametros: {
        type: 'object',
        properties: { perfil_id: { type: 'string' } },
        required: ['perfil_id'],
      },
      executar: async ({ perfil_id }) => {
        if (!gerencia) return 'Seu papel não exclui usuários.'
        if (perfil_id === perfil.id) return 'Você não pode excluir o seu próprio acesso.'
        const r = await exigirMesmaOrganizacao(perfil, perfil_id)
        if (!r.ok) return r.erro

        const operacao = `excluir_usuario:${perfil_id}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Excluir o acesso de ${r.alvo.nome} (${r.alvo.email})`,
            {
              papel: ROLE_LABELS[r.alvo.role as Role] ?? r.alvo.role,
              conta_de_login: 'apagada — a pessoa não entra mais no sistema',
              equipe_do_evento: 'não é afetada; isto é só o acesso ao sistema',
              alternativa_reversivel: 'desativar o usuário em vez de excluir',
            }
          ))
        }

        await supabaseAdmin.auth.admin.deleteUser(perfil_id).catch(console.error)
        await supabaseAdmin.from('perfis').delete().eq('id', perfil_id)
        await registrarAuditoriaIA(perfil, 'excluir_usuario', {
          perfil_id, nome: r.alvo.nome, email: r.alvo.email,
        })
        return `Acesso de ${r.alvo.nome} excluído. A equipe do evento não foi afetada.`
      },
    }),
  ]
}

