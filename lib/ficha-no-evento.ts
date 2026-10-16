/*
 * UMA PESSOA POR EVENTO — com uma exceção (Juan, 16/10/2026: "quando a pessoa estiver com o cadastro dessa forma em
 * uma equipe [com BAIXA], ela pode sim se cadastrar em outra"). A ficha da baixa fica onde está — em cinza, com as
 * batidas daquela equipe no relatório — e o cadastro novo nasce como uma ficha nova na outra equipe. Por isso o
 * mesmo CPF pode ter mais de uma ficha no evento, mas no máximo UMA sem baixa.
 *
 * Funções puras (sem banco): quem chama busca TODAS as fichas do CPF no evento, com `fornecedor_id` e
 * `descredenciado_em`, e escolhe aqui.
 */

export type FichaDoCpf = { fornecedor_id: string; descredenciado_em?: string | null }

/**
 * A ficha que IMPEDE um cadastro novo deste CPF no fornecedor `destino`, na ordem em que a resposta mais ajuda:
 *   1. a do mesmo fornecedor, sem baixa (a pessoa já está ali — devolve-se a credencial dela);
 *   2. uma sem baixa em OUTRO fornecedor (a regra de sempre: não pode estar em duas equipes do mesmo evento);
 *   3. a do mesmo fornecedor COM baixa (o caminho é "Trazer de volta", não uma ficha repetida na mesma equipe).
 * Baixa em outro fornecedor não impede: `null`, pode cadastrar.
 */
export function fichaQueImpedeCadastro<T extends FichaDoCpf>(fichas: readonly T[] | null | undefined, destino: string | null | undefined): T | null {
  const lista = fichas ?? []
  return lista.find(f => f.fornecedor_id === destino && !f.descredenciado_em)
    ?? lista.find(f => !f.descredenciado_em)
    ?? lista.find(f => f.fornecedor_id === destino)
    ?? null
}

/** A ficha que VALE deste CPF no evento: a sem baixa; se todas têm baixa, a primeira da lista. */
export function fichaQueVale<T extends Pick<FichaDoCpf, 'descredenciado_em'>>(fichas: readonly T[] | null | undefined): T | null {
  const lista = fichas ?? []
  return lista.find(f => !f.descredenciado_em) ?? lista[0] ?? null
}

/**
 * Numa lista de achados (busca do Registrar ponto), tira as fichas COM baixa de quem tem também uma ficha sem baixa —
 * senão o mesmo CPF aparece duas vezes e o operador pode escolher justamente a que não vale mais.
 */
export function semFichasDeBaixaRepetidas<T extends { cpf: string; descredenciado_em?: string | null }>(achados: readonly T[]): T[] {
  const comFichaQueVale = new Set(achados.filter(f => !f.descredenciado_em).map(f => f.cpf))
  return achados.filter(f => !f.descredenciado_em || !comFichaQueVale.has(f.cpf))
}
