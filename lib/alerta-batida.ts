/*
 * A MARCA NA BATIDA — o portão não recusa mais por escala nem por limite do dia (Juan, 18/10/2026: "esses ajustes que
 * a gente fez no VITAL não podem prejudicar o sistema… o sistema é simples, não pode estar acontecendo esses
 * entraves"). A batida entra e fica marcada em `registros.alerta` (supabase/upgrade-alerta-e-offline.sql), para o
 * supervisor e o fechamento conferirem depois. Sem a coluna, a marca vai no fim da justificativa.
 *
 * Sem servidor nem banco aqui: a tela, o histórico e a planilha leem os mesmos rótulos.
 */

export type CodigoAlerta = 'fora_da_escala' | 'escala_pendente' | 'acima_do_limite'

const ROTULO: Record<CodigoAlerta, string> = {
  fora_da_escala: 'fora da escala',
  escala_pendente: 'escala não aprovada',
  acima_do_limite: 'acima do limite do dia',
}

/** O que vai para `registros.alerta`: os códigos separados por vírgula, sem repetir. `null` sem alerta. */
export function juntarAlertas(codigos: (CodigoAlerta | null | undefined)[]): string | null {
  const unicos = [...new Set(codigos.filter((c): c is CodigoAlerta => !!c && c in ROTULO))]
  return unicos.length ? unicos.join(',') : null
}

/** Os rótulos de um `registros.alerta` ("fora da escala", "acima do limite do dia"). */
export function rotulosDoAlerta(alerta: string | null | undefined): string[] {
  return (alerta ?? '').split(',').map(c => c.trim()).filter((c): c is CodigoAlerta => c in ROTULO).map(c => ROTULO[c])
}

/** A marca em texto, para a justificativa (quando a coluna ainda não existe). */
export function textoDoAlerta(alerta: string | null | undefined): string | null {
  const r = rotulosDoAlerta(alerta)
  return r.length ? `Registrada ${r.join(' e ')} (o portão não barra mais — conferir).` : null
}

/** A batida chegou ao servidor bem depois de feita: foi guardada no aparelho sem internet. */
export function foiEnviadaDepois(createdAt: string | null | undefined, recebidoEm: string | null | undefined): boolean {
  if (!createdAt || !recebidoEm) return false
  return new Date(recebidoEm).getTime() - new Date(createdAt).getTime() > 2 * 60_000
}
