import { NextResponse, after, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { linkDoWhatsApp } from '@/lib/whatsapp-comercial'

/*
 * /wa — o atalho rastreável pro WhatsApp comercial.
 *
 * Este é o endereço que vai no link da bio do Instagram e em qualquer
 * divulgação. Ele grava de onde veio o clique e, na sequência, manda a pessoa
 * pra conversa. Um salto só, invisível pra ela.
 *
 * Por que não mandar direto pro wa.me na bio: porque aí a UTM morre. O
 * Instagram entrega o clique, o WhatsApp abre, e ninguém nunca fica sabendo se
 * aquele lead veio do perfil da Credenciei, do perfil do Guilherme ou de um
 * anúncio. Com este desvio, cada clique vira uma linha em `cliques_whatsapp`.
 *
 * Exemplo de uso:
 *   /wa?utm_source=instagram&utm_medium=bio&utm_campaign=credenciei-perfil
 *
 * REGRA DE OURO: o desvio nunca pode depender do registro dar certo. Se o
 * banco estiver fora do ar, a pessoa ainda assim chega no WhatsApp. Por isso o
 * `after()`: a resposta sai primeiro, a gravação acontece depois, e uma falha
 * ali vira log no servidor, não porta fechada pra quem quer contratar.
 *
 * Esta rota é pública e está liberada no proxy.ts. Se aquela linha sair, o
 * link da bio passa a cair no login e ninguém percebe.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const texto = (valor: string | null, max = 300) =>
  valor ? valor.trim().slice(0, max) || null : null

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl

  const clique = {
    utm_source: texto(searchParams.get('utm_source'), 200),
    utm_medium: texto(searchParams.get('utm_medium'), 200),
    utm_campaign: texto(searchParams.get('utm_campaign'), 200),
    utm_content: texto(searchParams.get('utm_content'), 200),
    utm_term: texto(searchParams.get('utm_term'), 200),
    referer: texto(request.headers.get('referer'), 500),
    user_agent: texto(request.headers.get('user-agent'), 500),
  }

  after(async () => {
    try {
      const { error } = await supabaseAdmin.from('cliques_whatsapp').insert(clique)
      if (error) throw error
    } catch (erro) {
      // Tabela ausente (upgrade-cliques-whatsapp.sql ainda não rodou) ou banco
      // fora: registra e segue. O desvio já aconteceu.
      console.error('[wa] não deu pra registrar o clique:', erro)
    }
  })

  // 307 e não 308: o desvio é temporário por natureza (o número pode mudar) e
  // não queremos que navegador nenhum decore isso pra sempre.
  const resposta = NextResponse.redirect(linkDoWhatsApp(), 307)
  resposta.headers.set('Cache-Control', 'no-store')
  return resposta
}
