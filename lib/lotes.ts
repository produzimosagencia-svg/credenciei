/**
 * Parte uma lista em lotes de até `tamanho` itens.
 *
 * Existe por causa do `.in('coluna', ids)` do Supabase: os ids vão na URL
 * (GET), e com algumas centenas de UUIDs a URL passa de ~16KB e a requisição
 * falha inteira — com `data: null`, que a maioria das telas lê como "nenhum
 * registro". Num evento de 4.000 pessoas isso é a equipe inteira aparecendo
 * sem batida. Em lotes de 200 a URL fica bem longe do limite.
 *
 * Sem dependência nenhuma (nem `next/headers`) de propósito: pode ser usado
 * tanto no servidor do Next quanto no worker de WhatsApp.
 */
export function emLotes<T>(itens: readonly T[], tamanho = 200): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho))
  return lotes
}
