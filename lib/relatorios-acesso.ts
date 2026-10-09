import 'server-only'
import { getPerfil, supabaseAdmin, meusSetores } from './supabase-server'
import { podeGerenciarEventos, ehMaster } from './permissions'

/*
 * A régua de quem pode puxar relatório de um evento — num módulo só dela (sem 'use server') para servir a
 * lib/relatorios.ts, lib/relatorios-extras.ts e ao PDF de entrega de valor sem virar um endpoint próprio.
 */

/**
 * Confere se este perfil pode gerar relatório deste evento.
 *
 * Master: qualquer evento. Admin/gerente/cliente: só da própria organização.
 * Supervisor: só os setores dele mesmo (nunca o relatório completo do
 * evento) — a mesma régua de isolamento que o resto do sistema já aplica.
 */
export type EventoParaRelatorio = {
  id: string
  nome: string
  organizacao_id: string | null
  organizacoes: { nome: string } | null
}

export type AcessoRelatorio =
  | { erro: string }
  | { perfil: { role: string; organizacao_id: string | null }; evento: EventoParaRelatorio; setoresPermitidos: Set<string> | null }

export async function exigirAcessoAoEvento(eventoId: string): Promise<AcessoRelatorio> {
  const perfil = await getPerfil()
  if (!perfil) return { erro: 'Não autenticado.' }

  const { data } = await supabaseAdmin
    .from('eventos')
    .select('id, nome, organizacao_id, organizacoes(nome)')
    .eq('id', eventoId)
    .single()
  if (!data) return { erro: 'Evento não encontrado.' }
  const evento = data as unknown as EventoParaRelatorio

  /*
   * Vale pro papel 'supervisor' E pra quem tem outro papel principal mas
   * GANHOU um vínculo de supervisor neste evento (achado ao vivo,
   * 05/10/2026, caso da Mara Lúcia).
   */
  const meus = await meusSetores(perfil)
  const meusNesteEvento = meus.filter(s => s.evento_id === eventoId)
  if (meusNesteEvento.length) {
    return { perfil, evento, setoresPermitidos: new Set(meusNesteEvento.map(s => s.id)) }
  }
  if (perfil.role === 'supervisor') return { erro: 'Sem permissão sobre este evento.' }

  if (!podeGerenciarEventos(perfil)) return { erro: 'Sem permissão para gerar relatórios.' }
  if (!ehMaster(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
    return { erro: 'Sem permissão sobre este evento.' }
  }
  return { perfil, evento, setoresPermitidos: null }
}

