'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { supabaseAdmin } from './supabase-server'
import { motivoCadastroTravado, sincronizarFuncionarioNaPlanilha } from './internos-servidor'
import { acessoAEquipe, vagasNaCota } from './acesso-equipe'
import { eventoUsaEscalaPorDia, diasDaEscalaDoEvento, vagasAprovadasPorDia, gravarEscalaAprovada } from './escala'
import { listarDias, type DiaDaEscala } from './escala-regras'
import { agendarBoasVindasFuncionario, sincronizarAgendamentos } from './mensagens'
import { registrarAuditoria } from './auditoria'
import { fichaQueImpedeCadastro } from './ficha-no-evento'
import { mensagemAmigavel } from './erros'
import { statusDasCredenciais, type StatusDaCredencial } from './credencial-whatsapp'
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

/**
 * A credencial de quem entrou pelo "Monte sua equipe" chegou? Ver lib/credencial-whatsapp.ts.
 */
export async function credenciaisDoHistorico(
  fornecedorId: string,
): Promise<{ pessoas: { nome: string; status: StatusDaCredencial }[] } | { error: string }> {
  try {
    const a = await acessoAEquipe(fornecedorId)
    if (!a) return { error: 'Sem permissão.' }
    const { data: fichas } = await supabaseAdmin.from('funcionarios').select('id, nome')
      .eq('fornecedor_id', fornecedorId).eq('origem', 'historico').is('descredenciado_em', null)
      .order('created_at', { ascending: false }).limit(500)
    if (!fichas?.length) return { pessoas: [] }
    const status = await statusDasCredenciais(fichas.map(f => f.id as string))
    return { pessoas: fichas.map(f => ({ nome: String(f.nome ?? ''), status: status.get(f.id as string) ?? 'sem_mensagem' })) }
  } catch (e) {
    console.error('[credenciaisDoHistorico]', e)
    return { error: 'Não foi possível conferir as credenciais agora.' }
  }
}
