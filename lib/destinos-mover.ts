/**
 * Para onde dá para mover uma pessoa, em dois passos quando o evento tem SUBEVENTOS (pedido do Juan,
 * 08/10/2026): primeiro o subevento, depois os fornecedores DELE. Sem subeventos, é a lista única de sempre.
 *
 * Sem código de servidor nem de tela: serve ao modal da ficha e ao teste.
 */
export type DestinoDeMover = { id: string; nome: string; area?: string | null }

/** Chave do "grupo" dos fornecedores que não têm subevento (num evento que usa subeventos). */
export const SEM_AREA = '__sem_area__'

export type AreaDeDestino = { chave: string; rotulo: string; total: number }

/** Os subeventos de destino, com quantos fornecedores cada um tem. Vazio = o evento não usa subeventos. */
export function areasDeDestino(destinos: readonly DestinoDeMover[]): AreaDeDestino[] {
  if (!destinos.some(d => d.area)) return []
  const mapa = new Map<string, AreaDeDestino>()
  for (const d of destinos) {
    const chave = d.area ?? SEM_AREA
    const atual = mapa.get(chave) ?? { chave, rotulo: d.area ?? 'Sem subevento', total: 0 }
    atual.total++
    mapa.set(chave, atual)
  }
  return [...mapa.values()].sort((a, b) =>
    (a.chave === SEM_AREA ? 1 : 0) - (b.chave === SEM_AREA ? 1 : 0) || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
}

/** Os fornecedores do subevento escolhido (ou todos, quando o evento não usa subeventos). */
export function destinosDaArea(destinos: readonly DestinoDeMover[], areaEscolhida: string): DestinoDeMover[] {
  if (!destinos.some(d => d.area)) return [...destinos]
  return destinos.filter(d => (d.area ?? SEM_AREA) === areaEscolhida)
}

/** "GOTE - LIMPEZA — BLOCO": o nome com o subevento, para a confirmação (o mesmo nome existe em vários subeventos). */
export function rotuloDoDestino(d: DestinoDeMover | undefined): string {
  if (!d) return ''
  return d.area ? `${d.nome} — ${d.area}` : d.nome
}
