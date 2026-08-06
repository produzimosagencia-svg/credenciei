import { supabaseAdmin } from '@/lib/supabase-server'
import { garantirAbaFornecedor } from '@/lib/google-sheets'
import { registrarAuditoriaIA } from '../auditoria'
import {
  ferramenta, exigirEvento, exigirGestor, resolverSetor, urlBase, valorNumerico, brl,
  type ContextoIA, type PedirConfirmacao,
} from './base'

/**
 * Ferramentas de setor (tabela `fornecedores`): criar, editar, excluir e cuidar
 * do link público de cadastro da equipe.
 *
 * "Setor" e "fornecedor" são a mesma coisa no sistema — o nome mudou na
 * interface e ficou nos dois lugares no banco. As ferramentas falam "setor",
 * que é como o usuário fala.
 */

/** Um CPF por linha, só dígitos, sem repetidos. Lista vazia desliga a trava. */
function normalizarCpfs(bruto: string | undefined | null): string | null {
  const cpfs = (bruto ?? '')
    .split(/[\n,;]+/)
    .map(c => c.replace(/\D/g, ''))
    .filter(c => c.length === 11)
  return cpfs.length ? [...new Set(cpfs)].join('\n') : null
}

export function ferramentasDeSetor(ctx: ContextoIA, pedirConfirmacao: PedirConfirmacao) {
  const { perfil, confirmacoes } = ctx

  return [
    ferramenta({
      nome: 'criar_setor',
      descricao:
        'Cria um setor dentro de um evento e devolve o link público de cadastro da equipe. ' +
        'O teto (quantidade prevista) é o que faz quem se cadastra além dele entrar inativo.',
      parametros: {
        type: 'object',
        properties: {
          evento_id: { type: 'string' },
          nome: { type: 'string' },
          quantidade_estimada: { type: 'number', description: 'teto de pessoas ativas do setor' },
          valor_combinado: { type: 'number', description: 'valor por funcionário, em reais' },
        },
        required: ['evento_id', 'nome'],
      },
      executar: async ({ evento_id, nome, quantidade_estimada, valor_combinado }) => {
        const barrado = exigirGestor(perfil, 'cria setores')
        if (barrado) return barrado
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const { data: novo, error } = await supabaseAdmin.from('fornecedores').insert([{
          evento_id,
          nome: String(nome).trim(),
          quantidade_estimada: quantidade_estimada ?? null,
          valor_combinado: valorNumerico(valor_combinado),
        }]).select('id, nome, token_formulario').single()
        if (error || !novo) return 'Não foi possível criar o setor.'

        // Aba na planilha do Google: espelho, não fonte — se falhar, o setor
        // continua criado.
        try {
          const { data: evento } = await supabaseAdmin.from('eventos').select('spreadsheet_id').eq('id', evento_id).single()
          if (evento?.spreadsheet_id) await garantirAbaFornecedor(evento.spreadsheet_id, novo.nome)
        } catch (e) {
          console.error('Erro ao criar aba do setor:', e)
        }

        await registrarAuditoriaIA(perfil, 'criar_setor', { fornecedor_id: novo.id, nome: novo.nome, evento_id })
        return JSON.stringify({
          ok: true,
          fornecedor_id: novo.id,
          nome: novo.nome,
          link_de_cadastro: `${urlBase()}/form/${novo.token_formulario}`,
          observacao: 'Mande este link no grupo do setor — a equipe se cadastra sozinha por ele.',
        })
      },
    }),

    ferramenta({
      nome: 'editar_setor',
      descricao:
        'Altera um setor: nome, quantidade prevista (teto), valor por funcionário e a lista de CPFs pré-autorizados. Mande só o que muda. ' +
        'Baixar o teto NÃO desativa quem já está ativo — só afeta quem se cadastrar daqui pra frente.',
      parametros: {
        type: 'object',
        properties: {
          fornecedor_id: { type: 'string' },
          nome: { type: 'string' },
          quantidade_estimada: { type: 'number' },
          valor_combinado: { type: 'number', description: 'valor por funcionário, em reais' },
          cpfs_autorizados: {
            type: 'string',
            description: 'CPFs separados por vírgula ou quebra de linha. String vazia remove a trava.',
          },
        },
        required: ['fornecedor_id'],
      },
      executar: async ({ fornecedor_id, nome, quantidade_estimada, valor_combinado, cpfs_autorizados }) => {
        const barrado = exigirGestor(perfil, 'edita setores')
        if (barrado) return barrado
        const r = await resolverSetor(perfil, fornecedor_id)
        if (!r.ok) return r.erro

        const mudancas: Record<string, unknown> = {}
        if (nome != null) mudancas.nome = String(nome).trim()
        if (quantidade_estimada != null) mudancas.quantidade_estimada = quantidade_estimada || null
        if (valor_combinado != null) mudancas.valor_combinado = valorNumerico(valor_combinado)
        if (cpfs_autorizados != null) mudancas.cpfs_autorizados = normalizarCpfs(cpfs_autorizados)
        if (!Object.keys(mudancas).length) return 'Nenhum campo para alterar foi informado.'

        await supabaseAdmin.from('fornecedores').update(mudancas).eq('id', fornecedor_id)
        await registrarAuditoriaIA(perfil, 'editar_setor', { fornecedor_id, mudancas })

        // Teto novo pode deixar o setor com mais gente ativa do que cabe. Não
        // desativo ninguém por conta própria — mas aviso, senão o usuário
        // acha que o teto está valendo e ele não está.
        let alerta: string | null = null
        if (mudancas.quantidade_estimada) {
          const { count } = await supabaseAdmin
            .from('funcionarios')
            .select('id', { count: 'exact', head: true })
            .eq('fornecedor_id', fornecedor_id)
            .eq('ativo', true)
          const teto = Number(mudancas.quantidade_estimada)
          if ((count ?? 0) > teto) {
            alerta = `O setor já tem ${count} pessoas ativas, acima do teto novo (${teto}). Ninguém foi desativado — o teto só vale para quem se cadastrar daqui pra frente.`
          }
        }
        return JSON.stringify({ ok: true, alterado: Object.keys(mudancas), alerta })
      },
    }),

    ferramenta({
      nome: 'link_de_cadastro_do_setor',
      descricao:
        'Devolve o link público de cadastro da equipe de um setor, pra mandar no grupo. Use quando pedirem "copiar o link", "gerar o formulário" ou "mandar o link do setor".',
      parametros: {
        type: 'object',
        properties: { fornecedor_id: { type: 'string' } },
        required: ['fornecedor_id'],
      },
      executar: async ({ fornecedor_id }) => {
        const r = await resolverSetor(perfil, fornecedor_id)
        if (!r.ok) return r.erro
        const { count } = await supabaseAdmin
          .from('funcionarios')
          .select('id', { count: 'exact', head: true })
          .eq('fornecedor_id', fornecedor_id)
        return JSON.stringify({
          setor: r.setor.nome,
          link: `${urlBase()}/form/${r.setor.token_formulario}`,
          ja_cadastrados: count ?? 0,
          teto: r.setor.quantidade_estimada,
          valor_por_pessoa: r.setor.valor_combinado != null ? brl(r.setor.valor_combinado) : null,
        })
      },
    }),

    ferramenta({
      nome: 'regenerar_link_do_setor',
      descricao:
        'Troca o link de cadastro do setor por um novo, derrubando o antigo. Use quando o link vazou para fora da equipe e gente de fora está se cadastrando. ' +
        'Quem já se cadastrou continua no setor — só o link para de funcionar. Precisa de confirmação.',
      parametros: {
        type: 'object',
        properties: { fornecedor_id: { type: 'string' } },
        required: ['fornecedor_id'],
      },
      executar: async ({ fornecedor_id }) => {
        const barrado = exigirGestor(perfil, 'troca o link de cadastro')
        if (barrado) return barrado
        const r = await resolverSetor(perfil, fornecedor_id)
        if (!r.ok) return r.erro

        const operacao = `regenerar_link_setor:${fornecedor_id}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Trocar o link de cadastro do setor ${r.setor.nome}`,
            {
              link_atual: 'para de funcionar imediatamente',
              quem_ja_se_cadastrou: 'continua no setor, nada é perdido',
              atencao: 'quem tiver o link antigo (inclusive a própria equipe) precisa receber o novo',
            },
            'que o link atual morre na hora e a equipe precisa receber o novo'
          ))
        }

        const novo = Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map(b => b.toString(16).padStart(2, '0')).join('')
        await supabaseAdmin.from('fornecedores').update({ token_formulario: novo }).eq('id', fornecedor_id)
        await registrarAuditoriaIA(perfil, 'regenerar_link_do_setor', { fornecedor_id, setor: r.setor.nome })
        return JSON.stringify({
          ok: true,
          setor: r.setor.nome,
          novo_link: `${urlBase()}/form/${novo}`,
          observacao: 'O link antigo foi derrubado. Mande este no grupo do setor.',
        })
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
        const barrado = exigirGestor(perfil, 'exclui setores')
        if (barrado) return barrado
        const r = await resolverSetor(perfil, fornecedor_id)
        if (!r.ok) return r.erro

        // Mesma trava da tela: supervisor vinculado precisa sair antes, senão o
        // perfil dele ficaria apontando pra um setor que não existe mais.
        const { data: supervisores } = await supabaseAdmin
          .from('perfis').select('id, nome').eq('fornecedor_id', fornecedor_id)
        if (supervisores?.length) {
          return `Este setor tem supervisor vinculado (${supervisores.map(s => s.nome).join(', ')}). Remova ou realoque o supervisor antes de excluir o setor.`
        }

        const [{ count: pessoas }, { count: registros }] = await Promise.all([
          supabaseAdmin.from('funcionarios').select('id', { count: 'exact', head: true }).eq('fornecedor_id', fornecedor_id),
          supabaseAdmin.from('registros').select('id, funcionarios!inner(fornecedor_id)', { count: 'exact', head: true })
            .eq('funcionarios.fornecedor_id', fornecedor_id),
        ])

        const operacao = `excluir_setor:${fornecedor_id}`
        if (!confirmacoes.has(operacao)) {
          return JSON.stringify(pedirConfirmacao(
            operacao,
            `Excluir o setor ${r.setor.nome}`,
            {
              pessoas_da_equipe_apagadas: pessoas ?? 0,
              registros_de_presenca_apagados: registros ?? 0,
              link_de_cadastro: 'para de funcionar',
            }
          ))
        }

        await supabaseAdmin.from('fornecedores').delete().eq('id', fornecedor_id)
        await registrarAuditoriaIA(perfil, 'excluir_setor', {
          fornecedor_id, nome: r.setor.nome, pessoas: pessoas ?? 0,
        })
        return `Setor ${r.setor.nome} excluído, junto com ${pessoas ?? 0} pessoa(s) da equipe.`
      },
    }),
  ]
}
