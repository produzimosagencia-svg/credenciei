import 'server-only'
import { supabaseAdmin } from './supabase-server'
import { inicioDoBloco } from './janelas'

/**
 * O meio por BLOCO de trabalho (Juan, 12/10/2026: quem sai e volta no mesmo dia pra trabalhar de novo precisa bater o
 * meio de novo). As pausas de cada pessoa no dia — de onde sai o início do bloco atual (`inicioDoBloco`, lib/janelas.ts).
 *
 * Tolerante: sem a tabela `pausas_turno` (migração antiga pendente), vem vazio — e o meio conta da entrada, como sempre.
 */
export type PausaDoDia = { saiuEm: string; voltouEm: string }

/** As pausas de um evento num dia, por pessoa. Sem `.in` dos ids: o evento inteiro cabe (pausa é coisa rara). */
export async function pausasDoDia(eventoId: string, dataRef: string): Promise<Map<string, PausaDoDia[]>> {
  const porPessoa = new Map<string, PausaDoDia[]>()
  try {
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabaseAdmin.from('pausas_turno')
        .select('funcionario_id, saiu_em, voltou_em')
        .eq('evento_id', eventoId).eq('data_ref', dataRef)
        .order('id').range(de, de + 999)
      if (error || !data?.length) break
      for (const p of data) {
        const lista = porPessoa.get(p.funcionario_id as string) ?? []
        lista.push({ saiuEm: p.saiu_em as string, voltouEm: p.voltou_em as string })
        porPessoa.set(p.funcionario_id as string, lista)
      }
      if (data.length < 1000) break
    }
  } catch { /* sem a tabela: sem pausas */ }
  return porPessoa
}

/** O início do bloco atual de UMA pessoa naquele dia (a entrada, ou a volta da última pausa longa). */
export async function inicioDoBlocoDe(
  funcionarioId: string, eventoId: string, dataRef: string, entradaEm: string | null,
): Promise<string | null> {
  if (!entradaEm) return null
  try {
    const { data, error } = await supabaseAdmin.from('pausas_turno')
      .select('saiu_em, voltou_em')
      .eq('funcionario_id', funcionarioId).eq('evento_id', eventoId).eq('data_ref', dataRef)
    if (error) return entradaEm
    return inicioDoBloco(entradaEm, (data ?? []).map(p => ({ saiuEm: p.saiu_em as string, voltouEm: p.voltou_em as string })))
  } catch {
    return entradaEm
  }
}
