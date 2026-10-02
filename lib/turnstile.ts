/**
 * Verificação do Cloudflare Turnstile (captcha) — item "Bot protection" da
 * auditoria de segurança de 01/10/2026: o formulário público de cadastro
 * (`/form/[token]`) não tinha nenhuma barreira contra script automatizado,
 * só o rate limit (`lib/limite.ts`).
 *
 * Tolerante por padrão, como todo recurso novo deste sistema: sem
 * `TURNSTILE_SECRET_KEY` configurada (o Juan ainda não criou a conta em
 * dash.cloudflare.com → Turnstile), `verificarTurnstile` sempre libera — o
 * cadastro público continua funcionando exatamente como hoje. Só passa a
 * EXIGIR o desafio depois que a chave for configurada na Vercel (e o site
 * key público, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, fizer o widget aparecer no
 * formulário — ver `FormularioFuncionario.tsx`).
 */
export async function verificarTurnstile(token: string | null | undefined): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) return true // captcha ainda não configurado — recurso desligado

  // Captcha LIGADO (secret configurada) e a pessoa não resolveu o desafio.
  if (!token) return false

  try {
    const resposta = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token }),
    })
    const dados = await resposta.json()
    return dados?.success === true
  } catch (e) {
    console.error('[turnstile] verificação falhou (Cloudflare fora do ar?)', e)
    // Rede do Cloudflare instável não pode travar o cadastro de verdade —
    // mesma filosofia tolerante do resto do sistema: um recurso de proteção
    // extra nunca pode virar motivo de a operação parar no dia do evento.
    return true
  }
}
