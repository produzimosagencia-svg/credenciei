import 'server-only'
import { getPerfil, supabaseAdmin, buscarTudo, ehDaOrganizacaoDoPerfil, eventosAindaVigentes } from './supabase-server'
import { ehMaster, podeGerenciarListaManual, podeConferirListaManual } from './permissions'
import { suporteTemEscopo } from './suporte'
import { mascararCpf, type PessoaDaLista } from './lista-manual-regras'

/*
 * LISTA MANUAL — entrada sem QR Code (Juan, 16/10/2026). A régua de acesso e as leituras, num módulo sem 'use server'
 * (servem à página e às actions de lib/actions-lista-manual.ts, sem virar endpoint).
 */

type Perfil = NonNullable<Awaited<ReturnType<typeof getPerfil>>>

export type AcessoListaManual = {
  perfil: Perfil
  evento: { id: string; nome: string; organizacao_id: string | null }
  /** Cadastra, corrige, tira da lista e desfaz entrada. */
  podeGerenciar: boolean
  /** Consulta e confirma a entrada na portaria. */
  podeConferir: boolean
}

/**
 * Quem pode abrir a lista DESTE evento, e para fazer o quê. O evento precisa ser da organização da pessoa (operador
 * de portão: de uma em que ele opera; suporte: do escopo dele) — uma lista nunca vale em outro evento. Operador de
 * portão, além disso, só em evento que ainda vale (a mesma régua do seletor de eventos, Juan 14/10/2026).
 */
export async function acessoAListaManual(eventoId: string): Promise<AcessoListaManual | { erro: string }> {
  const perfil = await getPerfil()
  if (!perfil) return { erro: 'Não autenticado.' }
  if (!eventoId) return { erro: 'Escolha o evento.' }

  const podeGerenciar = podeGerenciarListaManual(perfil)
  const podeConferir = podeGerenciar || podeConferirListaManual(perfil)
  if (!podeConferir) return { erro: 'Sem permissão para a lista manual.' }

  const { data: evento } = await supabaseAdmin.from('eventos').select('id, nome, organizacao_id').eq('id', eventoId).maybeSingle()
  if (!evento) return { erro: 'Evento não encontrado.' }
  const organizacaoId = (evento.organizacao_id as string | null) ?? null

  if (perfil.role === 'suporte') {
    if (!(await suporteTemEscopo(perfil.id, { eventoId, organizacaoId: organizacaoId ?? undefined }))) {
      return { erro: 'Este evento não está no seu escopo de atendimento.' }
    }
  } else if (!ehMaster(perfil.role) && !ehDaOrganizacaoDoPerfil(perfil, organizacaoId)) {
    return { erro: 'Sem permissão sobre este evento.' }
  }
  if (perfil.role === 'operador_portao' && !(await eventosAindaVigentes([eventoId])).has(eventoId)) {
    return { erro: 'Este evento já terminou.' }
  }

  return {
    perfil,
    evento: { id: evento.id as string, nome: evento.nome as string, organizacao_id: organizacaoId },
    podeGerenciar,
    podeConferir,
  }
}

/** Tabela ainda não existe — o SQL não rodou (Postgres 42P01/42703, PostgREST PGRST205/PGRST204). */
export function ehMigracaoPendente(error: { code?: string } | null | undefined): boolean {
  return !!error && ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(error.code ?? '')
}

export type LinhaDaLista = {
  id: string; nome: string; cpf: string | null; telefone: string | null; categoria: string
  presente_em: string | null; confirmado_por_nome: string | null; created_at: string; criado_por_nome: string | null
}

export const COLUNAS_DA_LISTA = 'id, nome, cpf, telefone, categoria, presente_em, confirmado_por_nome, created_at, criado_por_nome'

/** Uma linha do banco como a tela recebe: o CPF inteiro só para quem gerencia a lista. */
export function paraTela(l: LinhaDaLista, verCpfInteiro: boolean): PessoaDaLista {
  return {
    id: l.id,
    nome: l.nome,
    cpf: verCpfInteiro ? l.cpf : null,
    cpfMascarado: mascararCpf(l.cpf),
    telefone: l.telefone,
    categoria: l.categoria,
    presenteEm: l.presente_em,
    confirmadoPor: l.confirmado_por_nome,
    criadoEm: l.created_at,
    criadoPor: l.criado_por_nome,
  }
}

/** A lista do evento, em ordem alfabética (sem quem foi tirado). Sem o SQL rodado, vem vazia e avisa. */
export async function pessoasDaListaManual(eventoId: string, verCpfInteiro: boolean): Promise<{ pessoas: PessoaDaLista[]; migracaoPendente: boolean }> {
  const { error } = await supabaseAdmin.from('lista_manual').select('id', { head: true }).limit(1)
  if (ehMigracaoPendente(error)) return { pessoas: [], migracaoPendente: true }
  const linhas = await buscarTudo<LinhaDaLista>((de, ate) => supabaseAdmin.from('lista_manual')
    .select(COLUNAS_DA_LISTA).eq('evento_id', eventoId).is('removido_em', null)
    .order('nome').order('id').range(de, ate))
  return { pessoas: linhas.map(l => paraTela(l, verCpfInteiro)), migracaoPendente: false }
}

/** Quantas pessoas cada evento tem na lista — o número ao lado do evento, no seletor. Nunca lança. */
export async function contagensDaListaManual(eventoIds: string[]): Promise<Record<string, number>> {
  const contagens: Record<string, number> = {}
  if (!eventoIds.length) return contagens
  try {
    const linhas = await buscarTudo<{ evento_id: string }>((de, ate) => supabaseAdmin.from('lista_manual')
      .select('evento_id').in('evento_id', eventoIds.slice(0, 200)).is('removido_em', null).order('id').range(de, ate))
    for (const l of linhas) contagens[l.evento_id] = (contagens[l.evento_id] ?? 0) + 1
  } catch { /* sem a tabela: nenhum número */ }
  return contagens
}

/** Quantas pessoas a lista do evento tem — a tela do operador só mostra o botão quando há alguém. Nunca lança. */
export async function quantasNaListaManual(eventoId: string): Promise<number> {
  try {
    const { count, error } = await supabaseAdmin.from('lista_manual').select('id', { count: 'exact', head: true })
      .eq('evento_id', eventoId).is('removido_em', null)
    return error ? 0 : count ?? 0
  } catch {
    return 0
  }
}
