import 'server-only'
import { supabaseAdmin } from './supabase-server'
import { emLotes } from './lotes'

/*
 * A CREDENCIAL CHEGOU? (Juan, 18/10/2026: o fim do "chegou o link?") — para cada ficha, a última mensagem de
 * credencial (`boas_vindas_funcionario`) na fila e o que a Meta devolveu pelo webhook (`whatsapp_eventos`: sent,
 * delivered, read, failed), ligados pelo id da mensagem (`mensagens_agendadas.evolution_message_id` = wamid).
 */

export type StatusDaCredencial = 'na_fila' | 'enviada' | 'entregue' | 'lida' | 'falhou' | 'sem_mensagem'

export async function statusDasCredenciais(funcionarioIds: string[]): Promise<Map<string, StatusDaCredencial>> {
  const resultado = new Map<string, StatusDaCredencial>()
  const ids = [...new Set(funcionarioIds.filter(Boolean))]
  if (!ids.length) return resultado
  try {
    type Linha = { funcionario_id: string; status: string; evolution_message_id: string | null; created_at: string }
    const mensagens: Linha[] = []
    for (const lote of emLotes(ids, 150)) {
      const { data, error } = await supabaseAdmin.from('mensagens_agendadas')
        .select('funcionario_id, status, evolution_message_id, created_at')
        .in('funcionario_id', lote).eq('tipo', 'boas_vindas_funcionario')
      if (error) return resultado
      mensagens.push(...((data ?? []) as Linha[]))
    }
    const ultima = new Map<string, Linha>()
    for (const m of mensagens) {
      const atual = ultima.get(m.funcionario_id)
      if (!atual || m.created_at > atual.created_at) ultima.set(m.funcionario_id, m)
    }
    const estados = await estadosNaMeta([...ultima.values()].map(m => m.evolution_message_id))
    for (const id of ids) {
      const m = ultima.get(id)
      resultado.set(id, statusDaMensagem(m?.status ?? null, m?.evolution_message_id ? estados.get(m.evolution_message_id) : undefined))
    }
  } catch (e) {
    console.error('[statusDasCredenciais]', e)
  }
  return resultado
}

/** O status de UMA mensagem da fila (qualquer tipo), juntando o que a Meta devolveu. */
export function statusDaMensagem(statusNaFila: string | null, naMeta?: Set<string>): StatusDaCredencial {
  if (!statusNaFila) return 'sem_mensagem'
  if (statusNaFila === 'falhou' || naMeta?.has('failed')) return 'falhou'
  if (naMeta?.has('read')) return 'lida'
  if (naMeta?.has('delivered')) return 'entregue'
  if (statusNaFila === 'enviado') return 'enviada'
  if (statusNaFila === 'cancelado') return 'sem_mensagem'
  return 'na_fila'
}

/** Os status que o webhook da Meta gravou para estes ids de mensagem. */
export async function estadosNaMeta(wamids: (string | null | undefined)[]): Promise<Map<string, Set<string>>> {
  const estados = new Map<string, Set<string>>()
  const lista = [...new Set(wamids.filter((w): w is string => !!w))]
  for (const lote of emLotes(lista, 100)) {
    const { data } = await supabaseAdmin.from('whatsapp_eventos').select('wa_message_id, tipo').eq('direcao', 'status').in('wa_message_id', lote)
    for (const e of data ?? []) {
      const k = e.wa_message_id as string
      if (!estados.has(k)) estados.set(k, new Set())
      estados.get(k)!.add(String(e.tipo))
    }
  }
  return estados
}
