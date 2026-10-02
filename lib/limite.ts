/**
 * Limitador de tentativas — Redis compartilhado (Upstash) quando
 * configurado; em memória por processo, como sempre foi, enquanto não.
 *
 * Serve às ações PÚBLICAS — as que não têm sessão pra checar e por isso podem
 * ser chamadas em laço por qualquer pessoa: a consulta de CPF do formulário e
 * o check-in por foto. Sem isto, um script varre CPFs sequenciais e colhe nome
 * e telefone de todo mundo que já passou pela plataforma.
 *
 * ── Por que tinha virado "em memória, por instância" (histórico) ───────────
 *
 * Em serverless há várias instâncias da Vercel rodando ao mesmo tempo, cada
 * uma com seu próprio `Map` — o teto real virava `teto × instâncias`, maior
 * que o configurado. Não era uma trava de verdade: era o que transformava
 * "varrer a base em minutos" em "varrer em semanas", o que já mudava o custo
 * do ataque, mas sem valer o número exato prometido na chamada.
 *
 * ── Agora (auditoria de segurança, 01/10/2026) ──────────────────────────────
 *
 * Com `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` configuradas (conta
 * grátis em upstash.com → criar um banco Redis → aba "REST API" → colar as
 * duas variáveis na Vercel), o teto passa a valer de VERDADE entre todas as
 * instâncias. Sem elas — ou se o Upstash falhar na hora — cai pro limite em
 * memória de sempre: nunca quebra o cadastro público por causa de uma
 * dependência nova, só fica mais fraco contra abuso em escala, exatamente
 * como já era antes desta mudança.
 */
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

type Janela = { contagem: number; expiraEm: number }

const balde = new Map<string, Janela>()

/** Faxina preguiçosa: sem isto o Map cresce pra sempre num processo longo. */
function limparBalde(agora: number) {
  if (balde.size < 5000) return
  for (const [k, v] of balde) if (v.expiraEm <= agora) balde.delete(k)
}

function podePassarEmMemoria(chave: string, teto: number, janelaMs: number): boolean {
  const agora = Date.now()
  limparBalde(agora)

  const atual = balde.get(chave)
  if (!atual || atual.expiraEm <= agora) {
    balde.set(chave, { contagem: 1, expiraEm: agora + janelaMs })
    return true
  }
  if (atual.contagem >= teto) return false

  atual.contagem++
  return true
}

const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN })
  : null

/*
 * Um `Ratelimit` por combinação (teto, janela) já usada no sistema — são
 * só ~9 chamadas diferentes no código todo (ver `grep podePassar`), então
 * isto nunca cresce. Criar um novo a cada chamada funcionaria igual, só
 * desperdiçaria memória à toa.
 */
const limitadoresPorJanela = new Map<string, Ratelimit>()
function limitadorDoUpstash(teto: number, janelaMs: number): Ratelimit {
  const chaveConfig = `${teto}:${janelaMs}`
  let limitador = limitadoresPorJanela.get(chaveConfig)
  if (!limitador) {
    limitador = new Ratelimit({
      redis: redis!,
      limiter: Ratelimit.slidingWindow(teto, `${janelaMs} ms`),
      prefix: 'credenciei',
    })
    limitadoresPorJanela.set(chaveConfig, limitador)
  }
  return limitador
}

/**
 * Consome uma tentativa. Devolve `true` quando ainda pode passar.
 *
 * @param chave    o que se está limitando (ex.: `cpf:<token do formulário>`)
 * @param teto     tentativas permitidas dentro da janela
 * @param janelaMs tamanho da janela
 */
export async function podePassar(chave: string, teto: number, janelaMs: number): Promise<boolean> {
  if (!redis) return podePassarEmMemoria(chave, teto, janelaMs)
  try {
    const { success } = await limitadorDoUpstash(teto, janelaMs).limit(chave)
    return success
  } catch (e) {
    console.error('[limite] Upstash indisponível, caindo pro limite em memória', e)
    return podePassarEmMemoria(chave, teto, janelaMs)
  }
}
