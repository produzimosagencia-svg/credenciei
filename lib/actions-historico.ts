'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { getPerfil, supabaseAdmin, meusSetores, ehDaOrganizacaoDoPerfil } from './supabase-server'
import { ehMaster, podeGerenciarEventos } from './permissions'
import { motivoCadastroTravado, obterFuncionalidadesDoEvento, sincronizarFuncionarioNaPlanilha } from './internos-servidor'
import { eventoUsaEscalaPorDia, diasDaEscalaDoEvento, vagasAprovadasPorDia, gravarEscalaAprovada } from './escala'
import { listarDias, type DiaDaEscala } from './escala-regras'
import { agendarBoasVindasFuncionario, sincronizarAgendamentos } from './mensagens'
import { registrarAuditoria } from './auditoria'
import { fichaQueImpedeCadastro } from './ficha-no-evento'
import { mensagemAmigavel } from './erros'
import { emLotes } from './lotes'
import { historicoParaEquipe, fotosDoHistorico } from './historico-supervisor'
import { paraATela, ROTULO_SITUACAO, O_QUE_FAZER, type PessoaDoHistorico } from './historico-supervisor-regras'

/*
 * MONTE SUA EQUIPE (Juan, 18/10/2026) — o supervisor vê quem já trabalhou com ele em outros eventos e adiciona
 * várias pessoas de uma vez, sem recadastro. Cada pessoa passa pelas MESMAS conferências do cadastro de hoje
 * (um CPF por evento, cadastro travado, cota, dias da escala, CPF bloqueado, telefone), entra aprovada — igual ao
 * cadastro feito pelo supervisor e à planilha — e recebe a credencial no WhatsApp pela fila de sempre.
 *
 * As regras puras estão em lib/historico-supervisor-regras.ts; a leitura, em lib/historico-supervisor.ts.
 */

const MAX_POR_VEZ = 200

type Acesso = {
  perfil: NonNullable<Awaited<ReturnType<typeof getPerfil>>>
  fornecedor: { id: string; nome: string; evento_id: string; quantidade_estimada: number | null; subevento_id: string | null }
  evento: { id: string; nome: string; organizacao_id: string | null; ativo: boolean | null }
  /** De quem é o histórico: o supervisor logado, ou (para o admin) os supervisores desta equipe. */
  supervisorIds: string[]
  ehOSupervisor: boolean
}

/**
 * Quem pode montar esta equipe: o supervisor DELA (vínculo em `supervisor_setores`, qualquer que seja o papel
 * principal da conta) e quem gerencia o evento (admin da organização, master). A mesma régua do cadastro pela
 * equipe (`exigirAcessoFuncionarios`).
 */
async function acessoAEquipe(fornecedorId: string): Promise<Acesso | null> {
  const perfil = await getPerfil()
  if (!perfil || typeof fornecedorId !== 'string' || !fornecedorId) return null
  const { data: forn } = await supabaseAdmin.from('fornecedores')
    .select('id, nome, evento_id, quantidade_estimada, subevento_id, eventos!inner(id, nome, organizacao_id, ativo)')
    .eq('id', fornecedorId).maybeSingle()
  if (!forn) return null
  const evento = forn.eventos as unknown as Acesso['evento']
  const meus = await meusSetores(perfil)
  const ehOSupervisor = meus.some(s => s.id === fornecedorId)
  if (!ehOSupervisor) {
    if (perfil.role === 'supervisor' || !podeGerenciarEventos(perfil)) return null
    if (!ehMaster(perfil.role) && !ehDaOrganizacaoDoPerfil(perfil, evento.organizacao_id)) return null
  }
  let supervisorIds = [perfil.id as string]
  if (!ehOSupervisor) {
    const { data: sup } = await supabaseAdmin.from('supervisor_setores').select('perfil_id').eq('fornecedor_id', fornecedorId)
    supervisorIds = [...new Set((sup ?? []).map(s => s.perfil_id as string))]
  }
  return {
    perfil,
    fornecedor: {
      id: forn.id as string, nome: String(forn.nome ?? '').trim(), evento_id: forn.evento_id as string,
      quantidade_estimada: (forn.quantidade_estimada as number | null) ?? null,
      subevento_id: (forn as { subevento_id?: string | null }).subevento_id ?? null,
    },
    evento, supervisorIds, ehOSupervisor,
  }
}

/** Vagas que a cota da equipe ainda deixa (null = sem trava de cota). Mesma conta da importação. */
async function vagasNaCota(fornecedor: Acesso['fornecedor']): Promise<number | null> {
  const funcionalidades = await obterFuncionalidadesDoEvento(fornecedor.evento_id)
  if (!funcionalidades.travaCotaHabilitada || !fornecedor.quantidade_estimada) return null
  const { count } = await supabaseAdmin.from('funcionarios').select('id', { count: 'exact', head: true })
    .eq('fornecedor_id', fornecedor.id).or('origem.is.null,origem.neq.supervisor').is('descredenciado_em', null)
  return Math.max(0, fornecedor.quantidade_estimada - (count ?? 0))
}

export type PessoaNaTela = PessoaDoHistorico & { fotoUrl: string | null }

export type HistoricoDaEquipe = {
  pessoas: PessoaNaTela[]
  ocultasSemAceite: number
  /** "você" (o supervisor logado) ou os nomes dos supervisores desta equipe (admin). */
  deQuem: string
  usaEscala: boolean
  dias: DiaDaEscala[]
  vagas: number | null
}

/** A lista do "Monte sua equipe". Nunca lança: devolve `{ error }` (o Next esconde a mensagem de exceção). */
export async function obterHistoricoDaEquipe(fornecedorId: string): Promise<HistoricoDaEquipe | { error: string }> {
  try {
    const a = await acessoAEquipe(fornecedorId)
    if (!a) return { error: 'Sem permissão para montar esta equipe.' }
    const [historico, usaEscala, dias, vagas] = await Promise.all([
      historicoParaEquipe({ eventoId: a.evento.id, fornecedorId, organizacaoId: a.evento.organizacao_id, supervisorIds: a.supervisorIds }),
      eventoUsaEscalaPorDia(a.evento.id),
      diasDaEscalaDoEvento(a.evento.id),
      vagasNaCota(a.fornecedor),
    ])
    const fotos = await fotosDoHistorico(historico.pessoas)
    let deQuem = 'você'
    if (!a.ehOSupervisor) {
      const { data: nomes } = a.supervisorIds.length
        ? await supabaseAdmin.from('perfis').select('nome').in('id', a.supervisorIds)
        : { data: [] as { nome: string }[] }
      deQuem = (nomes ?? []).map(n => String(n.nome ?? '').split(' ')[0]).filter(Boolean).join(', ') || 'o supervisor desta equipe'
    }
    return {
      pessoas: historico.pessoas.map(p => ({ ...paraATela(p), fotoUrl: p.fotoPath ? fotos.get(p.fotoPath) ?? null : null })),
      ocultasSemAceite: historico.ocultasSemAceite,
      deQuem, usaEscala, dias, vagas,
    }
  } catch (e) {
    console.error('[obterHistoricoDaEquipe]', e)
    return { error: 'Não foi possível carregar o histórico agora. Tente de novo em instantes.' }
  }
}

export type ResultadoDoLote = {
  adicionadas: { nome: string }[]
  recusadas: { nome: string; motivo: string; oQueFazer: string | null }[]
  /** Entraram, mas os dias não gravaram: ficaram aguardando aprovação. */
  semDias: string[]
}

/**
 * Adiciona as pessoas escolhidas do histórico à equipe. `chaves` são as da lista (a ficha mais recente de cada
 * pessoa); `dias`, os dias de trabalho (obrigatório no evento com escala por dia).
 *
 * O histórico é recalculado AQUI — a lista que veio da tela não vale como prova: só entra quem de fato trabalhou com
 * este supervisor e está livre agora. Uma recusa não derruba o lote; repetir a mesma ação não duplica ninguém.
 */
export async function adicionarDoHistorico(
  fornecedorId: string, chaves: string[], dias: string[] = [],
): Promise<ResultadoDoLote | { error: string }> {
  try {
    const a = await acessoAEquipe(fornecedorId)
    if (!a) return { error: 'Sem permissão para adicionar nesta equipe.' }
    if (a.evento.ativo === false) return { error: 'Este evento já foi encerrado.' }
    const pedidas = [...new Set((Array.isArray(chaves) ? chaves : []).filter(c => typeof c === 'string'))]
    if (!pedidas.length) return { error: 'Escolha pelo menos uma pessoa.' }
    if (pedidas.length > MAX_POR_VEZ) return { error: `Adicione no máximo ${MAX_POR_VEZ} pessoas por vez.` }

    const travado = await motivoCadastroTravado(a.evento.id, { fornecedorId, subeventoId: a.fornecedor.subevento_id })
    if (travado) return { error: travado }

    const [historico, usaEscala, diasDoEvento, vagasIniciais] = await Promise.all([
      historicoParaEquipe({ eventoId: a.evento.id, fornecedorId, organizacaoId: a.evento.organizacao_id, supervisorIds: a.supervisorIds }),
      eventoUsaEscalaPorDia(a.evento.id),
      diasDaEscalaDoEvento(a.evento.id),
      vagasNaCota(a.fornecedor),
    ])
    const validos = new Set(diasDoEvento.map(d => d.data))
    const diasEscolhidos = [...new Set((Array.isArray(dias) ? dias : []).filter(d => typeof d === 'string' && validos.has(d)))].sort()
    if (usaEscala && !diasEscolhidos.length) return { error: 'Escolha pelo menos um dia de trabalho.' }
    const vagasPorDia = usaEscala ? await vagasAprovadasPorDia(fornecedorId) : new Map<string, number>()
    let vagas = vagasIniciais

    const porChave = new Map(historico.pessoas.map(p => [p.chave, p]))
    const resultado: ResultadoDoLote = { adicionadas: [], recusadas: [], semDias: [] }
    const novas: { id: string; telefone: string; nome: string; origem: string }[] = []

    for (const chave of pedidas) {
      const p = porChave.get(chave)
      if (!p) { resultado.recusadas.push({ nome: 'Pessoa', motivo: 'Não está no histórico desta equipe.', oQueFazer: null }); continue }
      if (p.situacao !== 'disponivel') {
        resultado.recusadas.push({
          nome: p.nome,
          motivo: p.situacao === 'em_outra_equipe' && p.detalhe ? `Já está neste evento, na equipe ${p.detalhe}.` : `${ROTULO_SITUACAO[p.situacao][0].toUpperCase()}${ROTULO_SITUACAO[p.situacao].slice(1)}.`,
          oQueFazer: O_QUE_FAZER[p.situacao],
        })
        continue
      }
      if (vagas !== null && vagas <= 0) {
        resultado.recusadas.push({ nome: p.nome, motivo: `Não coube: a equipe chegou ao limite de ${a.fornecedor.quantidade_estimada} pessoas.`, oQueFazer: 'Peça mais vagas em "Solicitar mais colaboradores".' })
        continue
      }
      const cheios = diasEscolhidos.filter(d => vagasPorDia.has(d) && (vagasPorDia.get(d) ?? 0) <= 0)
      if (cheios.length) {
        resultado.recusadas.push({ nome: p.nome, motivo: `Dia lotado: ${listarDias(cheios)}.`, oQueFazer: 'Escolha outros dias ou peça mais vagas para esse dia.' })
        continue
      }
      // Conferência de última hora (dois cliques, ou alguém cadastrou a pessoa agora há pouco).
      const { data: noEvento } = await supabaseAdmin.from('funcionarios')
        .select('fornecedor_id, descredenciado_em, fornecedores!inner(nome, evento_id)')
        .eq('cpf', p.cpf).eq('fornecedores.evento_id', a.evento.id).limit(20)
      if (fichaQueImpedeCadastro(noEvento, fornecedorId)) {
        resultado.recusadas.push({ nome: p.nome, motivo: 'Acabou de entrar neste evento.', oQueFazer: O_QUE_FAZER.na_equipe })
        continue
      }

      const { data: nova, error } = await supabaseAdmin.from('funcionarios').insert([{
        fornecedor_id: fornecedorId, nome: p.nome, cpf: p.cpf, telefone: p.telefone ?? '', cargo: p.cargo ?? '',
        cidade: p.cidade, chave_pix: p.chavePix, ativo: true, origem: 'historico',
      }]).select('id').single()
      if (error || !nova) {
        resultado.recusadas.push({ nome: p.nome, motivo: `Não foi possível gravar (${mensagemAmigavel(error)}).`, oQueFazer: 'Tente de novo em instantes.' })
        continue
      }
      // Subgrupo do fornecedor (coluna tolerante, como no cadastro pela equipe).
      if (a.fornecedor.subevento_id) {
        await supabaseAdmin.from('funcionarios').update({ subevento_id: a.fornecedor.subevento_id }).eq('id', nova.id)
      }
      if (diasEscolhidos.length) {
        const g = await gravarEscalaAprovada({ funcionarioId: nova.id as string, eventoId: a.evento.id, aprovados: diasEscolhidos, perfilId: a.perfil.id as string })
        if (!g.ok && usaEscala) {
          // Sem dia gravado o QR valeria todo dia: fica aguardando aprovação (mesma regra da planilha).
          await supabaseAdmin.from('funcionarios').update({ status_credenciamento: 'pendente' }).eq('id', nova.id)
          resultado.semDias.push(p.nome)
        }
      }
      if (vagas !== null) vagas--
      for (const d of diasEscolhidos) if (vagasPorDia.has(d)) vagasPorDia.set(d, (vagasPorDia.get(d) ?? 0) - 1)
      resultado.adicionadas.push({ nome: p.nome })
      novas.push({
        id: nova.id as string, telefone: p.telefone ?? '', nome: p.nome,
        origem: p.participacoes.slice(0, 3).map(x => `${x.evento} (${x.equipe})`).join(', '),
      })
    }

    if (novas.length) {
      const perfil = { id: a.perfil.id as string, nome: a.perfil.nome as string }
      // Credencial no WhatsApp pela fila (uma por pessoa; a fila espaça os envios), auditoria e planilha — depois da resposta.
      after(async () => {
        for (const n of novas) {
          try { await agendarBoasVindasFuncionario({ eventoId: a.evento.id, funcionarioId: n.id, telefone: n.telefone }) } catch (e) { console.error('[monte-sua-equipe] boas-vindas', e) }
          await registrarAuditoria({
            perfil, acao: 'COLABORADOR_DO_HISTORICO', campoAlterado: 'Adicionado do histórico', eventoId: a.evento.id,
            organizacaoId: a.evento.organizacao_id ?? undefined, funcionarioId: n.id,
            valorNovo: `${n.nome} entrou em ${a.fornecedor.nome}. Já tinha trabalhado em: ${n.origem}.`.slice(0, 480),
          })
          await sincronizarFuncionarioNaPlanilha(n.id).catch(() => {})
        }
        await sincronizarAgendamentos(a.evento.id).catch(console.error)
      })
      revalidatePath(`/admin/eventos/${a.evento.id}/fornecedor/${fornecedorId}`)
    }
    return resultado
  } catch (e) {
    console.error('[adicionarDoHistorico]', e)
    return { error: 'Não foi possível adicionar agora. Ninguém foi duplicado: tente de novo em instantes.' }
  }
}

export type StatusDaCredencial = 'na_fila' | 'enviada' | 'entregue' | 'lida' | 'falhou' | 'sem_mensagem'

/**
 * A credencial de quem entrou pelo "Monte sua equipe" chegou? Lê a fila (`mensagens_agendadas`) e os status que a
 * Meta devolve pelo webhook (`whatsapp_eventos`: sent / delivered / read / failed) — o fim do "chegou o link?".
 */
export async function credenciaisDoHistorico(
  fornecedorId: string,
): Promise<{ pessoas: { nome: string; status: StatusDaCredencial; quando: string | null }[] } | { error: string }> {
  try {
    const a = await acessoAEquipe(fornecedorId)
    if (!a) return { error: 'Sem permissão.' }
    const { data: fichas } = await supabaseAdmin.from('funcionarios').select('id, nome, created_at')
      .eq('fornecedor_id', fornecedorId).eq('origem', 'historico').is('descredenciado_em', null)
      .order('created_at', { ascending: false }).limit(500)
    if (!fichas?.length) return { pessoas: [] }
    const ids = fichas.map(f => f.id as string)
    const mensagens: { funcionario_id: string; status: string; evolution_message_id: string | null; enviado_em: string | null; created_at: string }[] = []
    for (const lote of emLotes(ids, 150)) {
      const { data } = await supabaseAdmin.from('mensagens_agendadas')
        .select('funcionario_id, status, evolution_message_id, enviado_em, created_at')
        .in('funcionario_id', lote).eq('tipo', 'boas_vindas_funcionario')
      mensagens.push(...((data ?? []) as typeof mensagens))
    }
    const ultima = new Map<string, (typeof mensagens)[number]>()
    for (const m of mensagens) {
      const atual = ultima.get(m.funcionario_id)
      if (!atual || m.created_at > atual.created_at) ultima.set(m.funcionario_id, m)
    }
    const wamids = [...ultima.values()].map(m => m.evolution_message_id).filter((w): w is string => !!w)
    const estados = new Map<string, Set<string>>()
    for (const lote of emLotes(wamids, 100)) {
      const { data } = await supabaseAdmin.from('whatsapp_eventos').select('wa_message_id, tipo').eq('direcao', 'status').in('wa_message_id', lote)
      for (const e of data ?? []) {
        const k = e.wa_message_id as string
        if (!estados.has(k)) estados.set(k, new Set())
        estados.get(k)!.add(String(e.tipo))
      }
    }
    return {
      pessoas: fichas.map(f => {
        const m = ultima.get(f.id as string)
        const s = m?.evolution_message_id ? estados.get(m.evolution_message_id) : undefined
        const status: StatusDaCredencial = !m ? 'sem_mensagem'
          : m.status === 'falhou' || s?.has('failed') ? 'falhou'
          : s?.has('read') ? 'lida'
          : s?.has('delivered') ? 'entregue'
          : m.status === 'enviado' ? 'enviada'
          : m.status === 'cancelado' ? 'sem_mensagem'
          : 'na_fila'
        return { nome: String(f.nome ?? ''), status, quando: m?.enviado_em ?? null }
      }),
    }
  } catch (e) {
    console.error('[credenciaisDoHistorico]', e)
    return { error: 'Não foi possível conferir as credenciais agora.' }
  }
}
