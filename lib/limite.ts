/**
 * Limitador de tentativas em memória, por processo.
 *
 * Serve às ações PÚBLICAS — as que não têm sessão pra checar e por isso podem
 * ser chamadas em laço por qualquer pessoa: a consulta de CPF do formulário e
 * o check-in por foto. Sem isto, um script varre CPFs sequenciais e colhe nome
 * e telefone de todo mundo que já passou pela plataforma.
 *
 * É proposital que seja simples:
 *
 * - **Em memória, por instância.** Em serverless há várias instâncias, então o
 *   teto real é maior que o configurado. Não é uma trava criptográfica: é o
 *   que transforma "varrer a base em minutos" em "varrer em semanas", que já
 *   muda o custo do ataque. Um limite de verdade, compartilhado entre
 *   instâncias, precisa de Redis/Upstash — vale a pena quando houver volume.
 * - **Sem dependência nova.** Um pacote a mais no bundle público para isto
 *   custaria mais do que resolve.
 */

type Janela = { contagem: number; expiraEm: number }

const balde = new Map<string, Janela>()

/** Faxina preguiçosa: sem isto o Map cresce pra sempre num processo longo. */
function limpar(agora: number) {
  if (balde.size < 5000) return
  for (const [k, v] of balde) if (v.expiraEm <= agora) balde.delete(k)
}

/**
 * Consome uma tentativa. Devolve `true` quando ainda pode passar.
 *
 * @param chave    o que se está limitando (ex.: `cpf:<token do formulário>`)
 * @param teto     tentativas permitidas dentro da janela
 * @param janelaMs tamanho da janela
 */
export function podePassar(chave: string, teto: number, janelaMs: number): boolean {
  const agora = Date.now()
  limpar(agora)

  const atual = balde.get(chave)
  if (!atual || atual.expiraEm <= agora) {
    balde.set(chave, { contagem: 1, expiraEm: agora + janelaMs })
    return true
  }
  if (atual.contagem >= teto) return false

  atual.contagem++
  return true
}
