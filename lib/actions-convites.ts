'use server'
import { revalidatePath } from 'next/cache'
import { after } from 'next/server'
import { supabaseAdmin, buscarTudo } from './supabase-server'
import { motivoCadastroTravado } from './internos-servidor'
import { registrarAuditoria } from './auditoria'
import { emLotes } from './lotes'
import { acessoAEquipe } from './acesso-equipe'
import { estadosNaMeta, statusDaMensagem, type StatusDaCredencial } from './credencial-whatsapp'
import {
  modeloPronto, linkDeCadastro, enfileirarModelo, marcarCadastrados, ehTabelaAusente, MODELO_CONVITE,
} from './convites'
import { lerListaDeConvites, mesmoTelefone, telefoneMascarado, MAX_CONVITES_POR_VEZ, LEMBRETE_DEPOIS_MS } from './convites-regras'

/*
 * CONVIDAR POR WHATSAPP (Juan, 18/10/2026) — o supervisor cola os telefones; cada pessoa recebe o link de cadastro
 * da equipe e, se não se cadastrar em 24h, um lembrete (lib/convites.ts). O cadastro em si é o de sempre (o
 * formulário da equipe), então continua passando pela aprovação de sempre. Nunca lança: devolve `{ error }`.
 */

export type ConviteNaTela = {
  id: string
  nome: string | null
  telefone: string
  situacao: 'cadastrou' | 'aguardando' | 'lembrado' | 'cancelado'
  mensagem: StatusDaCredencial
  criadoEm: string
  lembreteEm: string | null
}

export type ConvitesDaEquipe = {
  /** O modelo de convite já está aprovado na Meta (ou o envio é pela Evolution). */
  pronto: boolean
  /** O link de cadastro da equipe está ligado (é ele que vai no convite). */
  linkAtivo: boolean
  convites: ConviteNaTela[]
}

export async function listarConvites(fornecedorId: string): Promise<ConvitesDaEquipe | { error: string; faltaSql?: true }> {
  try {
    const a = await acessoAEquipe(fornecedorId)
    if (!a) return { error: 'Sem permissão.' }
    const { data, error } = await supabaseAdmin.from('convites_equipe')
      .select('id, nome, telefone, criado_em, lembrado_em, cadastrado_em, cancelado_em, mensagem_id, lembrete_mensagem_id')
      .eq('fornecedor_id', fornecedorId).order('criado_em', { ascending: false }).limit(500)
    if (ehTabelaAusente(error)) return { error: 'Falta rodar o SQL supabase/upgrade-convites-equipe.sql no Supabase.', faltaSql: true }
    if (error) return { error: 'Não foi possível carregar os convites agora.' }
    const linhas = data ?? []

    // Quem se cadastrou desde a última olhada.
    const abertos = linhas.filter(c => !c.cadastrado_em && !c.cancelado_em)
    const marcados = abertos.length
      ? await marcarCadastrados(abertos.map(c => ({ id: c.id as string, fornecedor_id: fornecedorId, telefone: c.telefone as string })))
      : new Set<string>()

    const idsMensagens = linhas.flatMap(c => [c.mensagem_id, c.lembrete_mensagem_id]).filter((x): x is string => !!x)
    const fila = new Map<string, { status: string; wamid: string | null }>()
    for (const lote of emLotes(idsMensagens, 150)) {
      const { data: m } = await supabaseAdmin.from('mensagens_agendadas').select('id, status, evolution_message_id').in('id', lote)
      for (const x of m ?? []) fila.set(x.id as string, { status: x.status as string, wamid: (x.evolution_message_id as string | null) ?? null })
    }
    const estados = await estadosNaMeta([...fila.values()].map(f => f.wamid))
    const statusDe = (id: string | null) => {
      const f = id ? fila.get(id) : undefined
      return statusDaMensagem(f?.status ?? null, f?.wamid ? estados.get(f.wamid) : undefined)
    }

    return {
      pronto: await modeloPronto(MODELO_CONVITE),
      linkAtivo: a.fornecedor.link_ativo && !!a.fornecedor.token_formulario,
      convites: linhas.map(c => {
        const cadastrou = !!c.cadastrado_em || marcados.has(c.id as string)
        // O que vale mostrar é a ÚLTIMA mensagem (o lembrete, se já saiu).
        const ultima = (c.lembrete_mensagem_id as string | null) ?? (c.mensagem_id as string | null)
        return {
          id: c.id as string,
          nome: (c.nome as string | null) ?? null,
          telefone: telefoneMascarado(c.telefone as string),
          situacao: cadastrou ? 'cadastrou' : c.cancelado_em ? 'cancelado' : c.lembrado_em ? 'lembrado' : 'aguardando',
          mensagem: statusDe(ultima),
          criadoEm: c.criado_em as string,
          lembreteEm: c.lembrado_em ? (c.lembrado_em as string)
            : (!cadastrou && !c.cancelado_em ? new Date(new Date(c.criado_em as string).getTime() + LEMBRETE_DEPOIS_MS).toISOString() : null),
        }
      }),
    }
  } catch (e) {
    console.error('[listarConvites]', e)
    return { error: 'Não foi possível carregar os convites agora.' }
  }
}

export type ResultadoDoConvite = {
  enviados: { nome: string | null; telefone: string }[]
  ignorados: { linha: string; motivo: string }[]
}

export async function convidarParaEquipe(fornecedorId: string, texto: string): Promise<ResultadoDoConvite | { error: string }> {
  try {
    const a = await acessoAEquipe(fornecedorId)
    if (!a) return { error: 'Sem permissão para convidar nesta equipe.' }
    if (a.evento.ativo === false) return { error: 'Este evento já foi encerrado.' }
    const link = a.fornecedor.link_ativo ? linkDeCadastro(a.fornecedor.token_formulario) : null
    if (!link) return { error: 'O link de cadastro desta equipe está desligado. Ligue o link para poder convidar.' }
    const travado = await motivoCadastroTravado(a.evento.id, { fornecedorId, subeventoId: a.fornecedor.subevento_id })
    if (travado) return { error: travado }
    if (!(await modeloPronto(MODELO_CONVITE))) {
      return { error: 'O convite por WhatsApp começa a funcionar quando a Meta aprovar o modelo "convite_cadastro_equipe". Enquanto isso, use o botão "Link cadastro".' }
    }

    const lidas = lerListaDeConvites(texto)
    const resultado: ResultadoDoConvite = { enviados: [], ignorados: [] }
    for (const l of lidas) if (l.erro) resultado.ignorados.push({ linha: l.linha, motivo: l.erro })
    const validas = lidas.filter(l => l.telefone && !l.erro)
    if (validas.length > MAX_CONVITES_POR_VEZ) return { error: `Convide no máximo ${MAX_CONVITES_POR_VEZ} pessoas por vez.` }
    if (!validas.length) return resultado

    // Quem já está no evento (qualquer equipe) não recebe convite: o telefone já tem ficha.
    const fichasDoEvento = await buscarTudo<{ telefone: string | null; fornecedor_id: string; descredenciado_em: string | null; fornecedores: unknown }>((de, ate) =>
      supabaseAdmin.from('funcionarios').select('telefone, fornecedor_id, descredenciado_em, fornecedores!inner(nome, evento_id)')
        .eq('fornecedores.evento_id', a.evento.id).is('descredenciado_em', null).order('id').range(de, ate) as never)
    const { data: jaConvidados, error: erroConvites } = await supabaseAdmin.from('convites_equipe')
      .select('telefone, criado_em, cancelado_em').eq('fornecedor_id', fornecedorId)
    if (ehTabelaAusente(erroConvites)) return { error: 'Falta rodar o SQL supabase/upgrade-convites-equipe.sql no Supabase.' }

    const supervisor = String(a.perfil.nome ?? '').split(' ')[0] || 'O supervisor'
    for (const l of validas) {
      const telefone = l.telefone as string
      const ficha = fichasDoEvento.find(f => mesmoTelefone(f.telefone, telefone))
      if (ficha) {
        const onde = ficha.fornecedor_id === fornecedorId ? 'já está nesta equipe' : `já está no evento, na equipe ${String((ficha.fornecedores as { nome?: string } | null)?.nome ?? '').trim()}`
        resultado.ignorados.push({ linha: l.linha, motivo: `Este telefone ${onde}.` })
        continue
      }
      if ((jaConvidados ?? []).some(c => mesmoTelefone(c.telefone as string, telefone) && !c.cancelado_em)) {
        resultado.ignorados.push({ linha: l.linha, motivo: 'Já foi convidado para esta equipe.' })
        continue
      }
      const { data: convite, error } = await supabaseAdmin.from('convites_equipe').upsert({
        fornecedor_id: fornecedorId, evento_id: a.evento.id, telefone, nome: l.nome, convidado_por: a.perfil.id,
        criado_em: new Date().toISOString(), cancelado_em: null, lembrado_em: null, cadastrado_em: null, lembrete_mensagem_id: null,
      }, { onConflict: 'fornecedor_id,telefone' }).select('id').single()
      if (error || !convite) { resultado.ignorados.push({ linha: l.linha, motivo: 'Não foi possível registrar o convite. Tente de novo.' }); continue }
      const mensagemId = await enfileirarModelo({
        eventoId: a.evento.id, telefone, modelo: MODELO_CONVITE,
        parametros: [supervisor, a.fornecedor.nome, a.evento.nome, link], campanha: `convite-${convite.id}`,
      })
      if (!mensagemId) {
        await supabaseAdmin.from('convites_equipe').update({ cancelado_em: new Date().toISOString() }).eq('id', convite.id)
        resultado.ignorados.push({ linha: l.linha, motivo: 'A mensagem não entrou na fila. Tente de novo.' })
        continue
      }
      await supabaseAdmin.from('convites_equipe').update({ mensagem_id: mensagemId }).eq('id', convite.id)
      resultado.enviados.push({ nome: l.nome, telefone: telefoneMascarado(telefone) })
    }

    if (resultado.enviados.length) {
      const perfil = { id: a.perfil.id as string, nome: a.perfil.nome as string }
      after(() => registrarAuditoria({
        perfil, acao: 'CONVITE_EQUIPE', campoAlterado: 'Convite por WhatsApp', eventoId: a.evento.id,
        organizacaoId: a.evento.organizacao_id ?? undefined,
        valorNovo: `${resultado.enviados.length} convite(s) para ${a.fornecedor.nome}`,
      }))
      revalidatePath(`/admin/eventos/${a.evento.id}/fornecedor/${fornecedorId}`)
    }
    return resultado
  } catch (e) {
    console.error('[convidarParaEquipe]', e)
    return { error: 'Não foi possível enviar os convites agora. Tente de novo em instantes.' }
  }
}

/** "Não lembrar": o convite fica no histórico, mas o lembrete de 24h não sai. */
export async function cancelarConvite(fornecedorId: string, conviteId: string): Promise<{ ok: true } | { error: string }> {
  try {
    const a = await acessoAEquipe(fornecedorId)
    if (!a) return { error: 'Sem permissão.' }
    const { data: cancelado, error } = await supabaseAdmin.from('convites_equipe').update({ cancelado_em: new Date().toISOString() })
      .eq('id', conviteId).eq('fornecedor_id', fornecedorId).is('cancelado_em', null).select('nome').maybeSingle()
    if (error) return { error: 'Não foi possível cancelar agora.' }
    if (cancelado) {
      const perfil = { id: a.perfil.id as string, nome: a.perfil.nome as string }
      after(() => registrarAuditoria({
        perfil, acao: 'CONVITE_EQUIPE', campoAlterado: 'Lembrete do convite cancelado', eventoId: a.evento.id,
        organizacaoId: a.evento.organizacao_id ?? undefined,
        valorNovo: `Sem lembrete para ${(cancelado.nome as string | null) ?? 'um convidado'} (${a.fornecedor.nome})`,
      }))
    }
    return { ok: true }
  } catch {
    return { error: 'Não foi possível cancelar agora.' }
  }
}
