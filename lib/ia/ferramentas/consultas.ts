import { supabaseAdmin } from '@/lib/supabase-server'
import { formatarBR } from '@/lib/tz'
import { formatCpf } from '@/lib/format'
import { diaBRT } from '@/lib/janelas'
import {
  ferramenta, eventosVisiveis, exigirEvento, resolverSetor, urlBase, brl,
  ORDEM_ETAPAS, ROTULO_ETAPA,
  type ContextoIA,
} from './base'

/**
 * Ferramentas de leitura. Nenhuma escreve nada — são o que a IA usa para
 * responder "como está o evento", "quem faltou", "quanto tenho para pagar".
 *
 * Todas passam pelo mesmo filtro de escopo das ferramentas de ação: supervisor
 * só enxerga o próprio setor, admin só a própria organização. Consulta vazando
 * dado de outra organização é tão grave quanto escrita, e é mais fácil de
 * passar despercebida.
 */
export function ferramentasDeConsulta(ctx: ContextoIA) {
  const { perfil } = ctx

  return [
    ferramenta({
      nome: 'listar_eventos',
      descricao:
        'Lista os eventos que este usuário pode ver, com datas, local, quantos setores e se está ativo. Use quando perguntarem sobre eventos, ou para descobrir o id de um evento citado pelo nome.',
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
        'Números completos de um evento: setores (com id, teto e quantas pessoas), total de pessoas, quantas registraram cada etapa, e as janelas de horário. ' +
        'Use para "como está o evento X", para conferir se as janelas estão preenchidas, e para pegar o id de um setor citado pelo nome.',
      parametros: {
        type: 'object',
        properties: { evento_id: { type: 'string' } },
        required: ['evento_id'],
      },
      executar: async ({ evento_id }) => {
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const [{ data: evento }, { data: setores }, { data: registros }] = await Promise.all([
          supabaseAdmin.from('eventos').select('*').eq('id', evento_id).single(),
          supabaseAdmin
            .from('fornecedores')
            .select('id, nome, quantidade_estimada, valor_combinado, funcionarios(count)')
            .eq('evento_id', evento_id),
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

        const listaSetores = (setores ?? []).map(s => ({
          id: s.id,
          nome: s.nome,
          pessoas: (s.funcionarios as unknown as { count: number }[])?.[0]?.count ?? 0,
          teto: s.quantidade_estimada,
          valor_por_pessoa: s.valor_combinado != null ? brl(s.valor_combinado) : null,
        }))

        return JSON.stringify({
          nome: evento.nome,
          situacao: evento.ativo ? 'ativo' : 'encerrado',
          local: evento.local,
          inicio: evento.data_inicio ? formatarBR(evento.data_inicio) : null,
          fim: evento.data_fim ? formatarBR(evento.data_fim) : null,
          setores: listaSetores,
          total_pessoas: listaSetores.reduce((a, s) => a + s.pessoas, 0),
          etapas: porEtapa,
          confirmacao_escala: evento.msg_pre_evento_envio
            ? `agendada para ${formatarBR(evento.msg_pre_evento_envio)}`
            : 'não configurada',
        })
      },
    }),

    ferramenta({
      nome: 'pendencias_de_presenca',
      descricao:
        'Quem NÃO registrou uma etapa. Responde "quem não bateu ponto", "quantos faltaram", "quem está ausente", "quem bateu só a entrada". Traz nome, CPF, telefone e setor de cada pendente.',
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
            funcionario_id: p.id,
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
        'Localiza uma pessoa da equipe por CPF ou parte do nome e mostra a ficha completa: setor, cargo, situação, pagamento e o que ela já registrou. ' +
        'Use SEMPRE antes de qualquer ação sobre uma pessoa, para confirmar que é ela e pegar o funcionario_id.',
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
          .select('id, nome, cpf, telefone, empresa, cargo, ativo, pago, valor_receber, chave_pix, qr_token, qr_expira_em, fornecedor_id, fornecedores!inner(id, nome, evento_id, eventos!inner(id, nome))')
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
            // Do ciclo de HOJE. Sem o recorte, num evento de varios dias a IA
            // responderia "ja bateu a entrada" mostrando a batida de ontem.
            const { data: regs } = await supabaseAdmin
              .from('registros')
              .select('tipo, created_at, registro_manual')
              .eq('funcionario_id', f.id)
              .eq('evento_id', forn.eventos.id)
              .eq('data_ref', diaBRT())
            const feitos = new Map((regs ?? []).map(r => [r.tipo, r]))
            const expirado = f.qr_expira_em ? new Date(f.qr_expira_em) < new Date() : false
            return {
              funcionario_id: f.id,
              nome: f.nome,
              cpf: formatCpf(f.cpf),
              telefone: f.telefone,
              empresa: f.empresa,
              cargo: f.cargo,
              ativo: f.ativo !== false,
              pagamento: {
                valor: brl(Number(f.valor_receber ?? 0)),
                pago: f.pago === true,
                chave_pix: f.chave_pix,
              },
              credencial: {
                link: `${urlBase()}/credential/${f.qr_token}`,
                qr: expirado ? 'EXPIRADO — precisa renovar' : 'válido',
              },
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
      nome: 'resumo_financeiro',
      descricao:
        'Quanto o evento tem a pagar para a equipe: total, quanto já foi pago, quanto falta, e quem está em cada situação. ' +
        'Responde "quanto tenho para pagar", "quem já recebeu", "quem falta pagar". Só conta quem está ATIVO — inativo não recebe.',
      parametros: {
        type: 'object',
        properties: {
          evento_id: { type: 'string' },
          fornecedor_id: { type: 'string', description: 'opcional, para um setor só' },
          situacao: { type: 'string', enum: ['todos', 'pagos', 'a_pagar'], description: 'quem listar (o total sempre vem completo)' },
        },
        required: ['evento_id'],
      },
      executar: async ({ evento_id, fornecedor_id, situacao }) => {
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro
        const setorAlvo = perfil.role === 'supervisor' ? perfil.fornecedor_id : fornecedor_id

        const q = supabaseAdmin
          .from('funcionarios')
          .select('id, nome, cpf, valor_receber, pago, pago_em, chave_pix, ativo, fornecedores!inner(id, nome, evento_id)')
          .eq('fornecedores.evento_id', evento_id)
          .eq('ativo', true)
        if (setorAlvo) q.eq('fornecedor_id', setorAlvo)
        const { data: pessoas } = await q

        if (!pessoas?.length) return 'Nenhuma pessoa ativa nesse alcance — não há nada a pagar.'

        const valor = (p: { valor_receber: number | null }) => Number(p.valor_receber ?? 0)
        const pagos = pessoas.filter(p => p.pago === true)
        const aPagar = pessoas.filter(p => p.pago !== true)
        const total = pessoas.reduce((a, p) => a + valor(p), 0)
        const totalPago = pagos.reduce((a, p) => a + valor(p), 0)

        const listar = (arr: typeof pessoas) => arr.map(p => ({
          funcionario_id: p.id,
          nome: p.nome,
          setor: (p.fornecedores as unknown as { nome: string }).nome,
          valor: brl(valor(p)),
          chave_pix: p.chave_pix,
          pago_em: p.pago_em ? formatarBR(p.pago_em, 'curto') : null,
        }))

        const quais = situacao ?? 'a_pagar'
        return JSON.stringify({
          pessoas_ativas: pessoas.length,
          total_do_evento: brl(total),
          ja_pago: brl(totalPago),
          falta_pagar: brl(total - totalPago),
          quantidade_paga: pagos.length,
          quantidade_a_pagar: aPagar.length,
          sem_valor_definido: pessoas.filter(p => valor(p) === 0).length,
          lista: quais === 'pagos' ? listar(pagos) : quais === 'todos' ? listar(pessoas) : listar(aPagar),
          lista_mostrando: quais,
        })
      },
    }),

    ferramenta({
      nome: 'comparar_setores',
      descricao:
        'Compara os setores de um evento lado a lado: quantas pessoas, quantas ativas, quanto do teto foi ocupado e quantas registraram cada etapa. ' +
        'Responde "qual setor tem menos gente", "qual setor está atrasado", "onde falta equipe".',
      parametros: {
        type: 'object',
        properties: { evento_id: { type: 'string' } },
        required: ['evento_id'],
      },
      executar: async ({ evento_id }) => {
        const erro = await exigirEvento(perfil, evento_id)
        if (erro) return erro

        const [{ data: setores }, { data: pessoas }, { data: registros }] = await Promise.all([
          supabaseAdmin.from('fornecedores')
            .select('id, nome, quantidade_estimada, valor_combinado').eq('evento_id', evento_id),
          supabaseAdmin.from('funcionarios')
            .select('id, fornecedor_id, ativo, fornecedores!inner(evento_id)')
            .eq('fornecedores.evento_id', evento_id),
          supabaseAdmin.from('registros')
            .select('funcionario_id, tipo').eq('evento_id', evento_id),
        ])
        if (!setores?.length) return 'Este evento ainda não tem setores.'

        const setorDe = new Map((pessoas ?? []).map(p => [p.id, p.fornecedor_id]))
        const registrosPorSetor = new Map<string, Record<string, Set<string>>>()
        for (const r of registros ?? []) {
          const sid = setorDe.get(r.funcionario_id)
          if (!sid) continue
          const linha = registrosPorSetor.get(sid) ?? { entrada: new Set(), meio: new Set(), fim: new Set() }
          linha[r.tipo]?.add(r.funcionario_id)
          registrosPorSetor.set(sid, linha)
        }

        const linhas = setores.map(s => {
          const daEquipe = (pessoas ?? []).filter(p => p.fornecedor_id === s.id)
          const ativas = daEquipe.filter(p => p.ativo !== false).length
          const regs = registrosPorSetor.get(s.id)
          return {
            fornecedor_id: s.id,
            setor: s.nome,
            pessoas: daEquipe.length,
            ativas,
            inativas: daEquipe.length - ativas,
            teto: s.quantidade_estimada,
            ocupacao_do_teto: s.quantidade_estimada
              ? `${Math.round((ativas / s.quantidade_estimada) * 100)}%`
              : 'sem teto',
            registraram: {
              entrada: regs?.entrada.size ?? 0,
              meio: regs?.meio.size ?? 0,
              saida: regs?.fim.size ?? 0,
            },
            valor_por_pessoa: s.valor_combinado != null ? brl(s.valor_combinado) : null,
          }
        })

        const menor = [...linhas].sort((a, b) => a.ativas - b.ativas)[0]
        return JSON.stringify({
          setores: linhas,
          setor_com_menos_gente: menor ? { setor: menor.setor, ativas: menor.ativas } : null,
        })
      },
    }),

    ferramenta({
      nome: 'detalhar_setor',
      descricao:
        'Ficha de um setor: teto, valor por pessoa, link de cadastro, supervisor vinculado e a equipe com a situação de cada um. Use para "como está o setor X".',
      parametros: {
        type: 'object',
        properties: { fornecedor_id: { type: 'string' } },
        required: ['fornecedor_id'],
      },
      executar: async ({ fornecedor_id }) => {
        const r = await resolverSetor(perfil, fornecedor_id)
        if (!r.ok) return r.erro

        const [{ data: equipe }, { data: supervisores }, { data: registros }] = await Promise.all([
          supabaseAdmin.from('funcionarios')
            .select('id, nome, cpf, telefone, cargo, ativo, pago, valor_receber')
            .eq('fornecedor_id', fornecedor_id),
          supabaseAdmin.from('perfis')
            .select('id, nome, email, telefone, ativo').eq('fornecedor_id', fornecedor_id),
          supabaseAdmin.from('registros')
            .select('funcionario_id, tipo').eq('evento_id', r.setor.evento_id),
        ])

        const idsDoSetor = new Set((equipe ?? []).map(f => f.id))
        const feitos = new Map<string, Set<string>>()
        for (const reg of registros ?? []) {
          if (!idsDoSetor.has(reg.funcionario_id)) continue
          const s = feitos.get(reg.funcionario_id) ?? new Set()
          s.add(reg.tipo)
          feitos.set(reg.funcionario_id, s)
        }

        return JSON.stringify({
          fornecedor_id: r.setor.id,
          setor: r.setor.nome,
          evento_id: r.setor.evento_id,
          teto: r.setor.quantidade_estimada,
          valor_por_pessoa: r.setor.valor_combinado != null ? brl(r.setor.valor_combinado) : null,
          link_de_cadastro: `${urlBase()}/form/${r.setor.token_formulario}`,
          supervisores: (supervisores ?? []).map(s => ({
            perfil_id: s.id, nome: s.nome, email: s.email, telefone: s.telefone, ativo: s.ativo !== false,
          })),
          equipe: (equipe ?? []).map(f => ({
            funcionario_id: f.id,
            nome: f.nome,
            cpf: formatCpf(f.cpf),
            telefone: f.telefone,
            cargo: f.cargo,
            ativo: f.ativo !== false,
            pago: f.pago === true,
            valor: brl(Number(f.valor_receber ?? 0)),
            registrou: ORDEM_ETAPAS.filter(t => feitos.get(f.id)?.has(t)).map(t => ROTULO_ETAPA[t]),
          })),
        })
      },
    }),
  ]
}
