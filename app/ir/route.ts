import { NextResponse, after, type NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { DESTINOS, ORIGENS, type DestinoClique, type OrigemClique } from '@/lib/links-rastreados'

/*
 * /ir — o atalho rastreável pro Instagram e pro site da Credenciei (ver lib/links-rastreados.ts).
 *
 * Grava de onde veio o clique (e, quando dá, o evento, o setor e a pessoa) e manda pro destino. Mesmas regras
 * do /wa: o desvio nunca depende do registro dar certo (`after()` — banco fora ou SQL ainda não rodado vira log,
 * não porta fechada), e o destino sai de uma lista fechada, nunca da URL.
 *
 * Os ids vêm da tela, sem login: alguém poderia forjar um clique, e o pior que acontece é um número inflado. Por
 * isso cada id só é aceito se existir e se bater com os outros (a pessoa é daquele setor, o setor daquele evento).
 *
 * Rota pública, liberada no proxy.ts.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const id = (v: string | null) => (v && UUID.test(v) ? v : null)
const texto = (v: string | null, max: number) => (v ? v.trim().slice(0, max) || null : null)

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const para = (q.get('para') ?? '') in DESTINOS ? (q.get('para') as DestinoClique) : 'site'
  const de = (ORIGENS as readonly string[]).includes(q.get('de') ?? '') ? (q.get('de') as OrigemClique) : null
  const pessoa = id(q.get('pessoa')), setor = id(q.get('setor')), evento = id(q.get('evento'))
  const referer = texto(request.headers.get('referer'), 500)
  const userAgent = texto(request.headers.get('user-agent'), 500)

  if (de) {
    after(async () => {
      try {
        let funcionarioId: string | null = null, fornecedorId: string | null = setor, eventoId: string | null = evento
        if (pessoa) {
          const { data } = await supabaseAdmin.from('funcionarios').select('id, fornecedor_id').eq('id', pessoa).maybeSingle()
          if (data) { funcionarioId = data.id as string; fornecedorId = data.fornecedor_id as string }
        }
        if (fornecedorId) {
          const { data } = await supabaseAdmin.from('fornecedores').select('evento_id').eq('id', fornecedorId).maybeSingle()
          if (data) eventoId = data.evento_id as string
          else fornecedorId = null
        }
        if (eventoId && !fornecedorId) {
          const { data } = await supabaseAdmin.from('eventos').select('id').eq('id', eventoId).maybeSingle()
          if (!data) eventoId = null
        }
        const { error } = await supabaseAdmin.from('cliques_links').insert({
          destino: para, origem: de, evento_id: eventoId, fornecedor_id: fornecedorId, funcionario_id: funcionarioId,
          referer, user_agent: userAgent,
        })
        if (error) throw error
      } catch (erro) {
        // Tabela ausente (upgrade-cliques-links.sql ainda não rodou) ou banco fora: registra e segue.
        console.error('[ir] não deu pra registrar o clique:', erro)
      }
    })
  }

  // 307: temporário por natureza, e nenhum navegador pode decorar o desvio (senão o próximo clique não passa aqui).
  const resposta = NextResponse.redirect(DESTINOS[para], 307)
  resposta.headers.set('Cache-Control', 'no-store')
  return resposta
}
