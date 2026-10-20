/*
 * QUEM TEM ENTRADA ABERTA — a conta que o aparelho do portão guarda para saber, SEM INTERNET, se a pessoa que está
 * saindo já bateu a entrada (Juan, 19/10/2026: "não tem como ele já saber isso?"). Sem importações e sem banco: o
 * servidor (lib/actions-offline.ts) passa as batidas e o aparelho recebe só o resultado.
 *
 * É a MESMA regra de `entradaEmAberto` do servidor (lib/actions.ts): vale a entrada MAIS RECENTE da pessoa, e ela está
 * fechada quando existe uma saída DEPOIS dela no mesmo dia de referência (`data_ref`) — por isso o turno que vira a
 * madrugada (entrada 22h de sexta, saída 1h de sábado, as duas com o dia de sexta) fecha direito.
 */
export type BatidaParaEstado = { funcionario_id: string; tipo: string; data_ref: string | null; created_at: string }

export type EstadoDeEntradas = {
  /** pessoa → hora da entrada ainda aberta (ISO). */
  e: Record<string, string>
  /** pessoa → hora da saída que fechou a entrada mais recente (ISO). */
  s: Record<string, string>
}

export function estadoDeEntradas(batidas: BatidaParaEstado[]): EstadoDeEntradas {
  const ms = (iso: string) => Date.parse(iso)
  const maisRecente = new Map<string, BatidaParaEstado>()
  const saidasDe = new Map<string, BatidaParaEstado[]>()
  for (const b of batidas) {
    if (b.tipo === 'entrada') {
      const atual = maisRecente.get(b.funcionario_id)
      if (!atual || ms(b.created_at) > ms(atual.created_at)) maisRecente.set(b.funcionario_id, b)
    } else if (b.tipo === 'fim') {
      saidasDe.set(b.funcionario_id, [...(saidasDe.get(b.funcionario_id) ?? []), b])
    }
  }
  const e: Record<string, string> = {}
  const s: Record<string, string> = {}
  for (const [pessoa, entrada] of maisRecente) {
    const fechou = (saidasDe.get(pessoa) ?? [])
      .filter(f => f.data_ref === entrada.data_ref && ms(f.created_at) > ms(entrada.created_at))
      .sort((a, b) => ms(b.created_at) - ms(a.created_at))[0]
    if (fechou) s[pessoa] = fechou.created_at
    else e[pessoa] = entrada.created_at
  }
  return { e, s }
}
