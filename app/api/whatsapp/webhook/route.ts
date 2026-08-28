import { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

/**
 * Webhook da API oficial do WhatsApp (Meta Cloud API).
 *
 * A Meta chama esta rota de dois jeitos:
 *
 *   GET  — uma única vez, ao salvar o webhook no painel. Ela manda um desafio
 *          e espera receber de volta, provando que quem respondeu conhece o
 *          token combinado. É o "aperto de mão".
 *   POST — a cada evento: mensagem recebida, e mudança de status das que você
 *          enviou (enviada, entregue, lida, falhou).
 *
 * ⚠️ Esta rota é PÚBLICA — tem que ser, a Meta chama de fora. O que impede
 * qualquer um de injetar mensagem falsa aqui é a assinatura em
 * `X-Hub-Signature-256`: um HMAC do corpo cru feito com o App Secret. Sem essa
 * conferência, bastaria alguém descobrir a URL para inventar conversas.
 */

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * O aperto de mão. A Meta só considera o webhook válido se o desafio voltar
 * em texto puro — JSON aqui faz a verificação falhar sem explicar por quê.
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN

  if (!esperado) {
    console.error('[webhook] WHATSAPP_VERIFY_TOKEN não configurado')
    return new Response('webhook não configurado', { status: 503 })
  }
  if (p.get('hub.mode') === 'subscribe' && p.get('hub.verify_token') === esperado) {
    return new Response(p.get('hub.challenge') ?? '', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    })
  }
  return new Response('token de verificação não confere', { status: 403 })
}

/** O corpo veio mesmo da Meta? */
function assinaturaConfere(corpoCru: string, cabecalho: string | null): boolean {
  const segredo = process.env.META_APP_SECRET
  if (!segredo || !cabecalho?.startsWith('sha256=')) return false

  const esperado = Buffer.from(
    'sha256=' + createHmac('sha256', segredo).update(corpoCru, 'utf8').digest('hex'),
  )
  const recebido = Buffer.from(cabecalho)
  // Comparação de tempo constante: comparar com `===` vaza, pelo tempo de
  // resposta, quantos caracteres iniciais o atacante acertou.
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido)
}

type Entrada = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { display_phone_number?: string; phone_number_id?: string }
        contacts?: { profile?: { name?: string }; wa_id?: string }[]
        messages?: {
          id?: string; from?: string; timestamp?: string; type?: string
          text?: { body?: string }
        }[]
        statuses?: {
          id?: string; status?: string; timestamp?: string; recipient_id?: string
          errors?: { code?: number; title?: string }[]
        }[]
      }
    }[]
  }[]
}

export async function POST(request: NextRequest) {
  const corpoCru = await request.text()

  if (!assinaturaConfere(corpoCru, request.headers.get('x-hub-signature-256'))) {
    console.warn('[webhook] assinatura inválida — payload descartado')
    return new Response('assinatura inválida', { status: 401 })
  }

  let dados: Entrada
  try {
    dados = JSON.parse(corpoCru)
  } catch {
    return new Response('ok', { status: 200 })
  }

  const linhas: Record<string, unknown>[] = []

  for (const entry of dados.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const v = change.value
      if (!v) continue
      const nomePorWaId = new Map(
        (v.contacts ?? []).map(c => [c.wa_id ?? '', c.profile?.name ?? '']),
      )

      // Mensagens que CHEGARAM — a matéria-prima do chat.
      for (const m of v.messages ?? []) {
        linhas.push({
          direcao: 'recebida',
          wa_message_id: m.id ?? null,
          telefone: m.from ?? null,
          nome_contato: nomePorWaId.get(m.from ?? '') || null,
          tipo: m.type ?? 'desconhecido',
          texto: m.text?.body ?? null,
          ocorrido_em: m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString(),
          bruto: m,
        })
      }

      // Status das que SAÍRAM. É o que diz se a mensagem foi entregue de
      // verdade — hoje o sistema só sabe que a API aceitou, não que chegou.
      for (const st of v.statuses ?? []) {
        linhas.push({
          direcao: 'status',
          wa_message_id: st.id ?? null,
          telefone: st.recipient_id ?? null,
          tipo: st.status ?? 'desconhecido',
          texto: st.errors?.[0]?.title ?? null,
          ocorrido_em: st.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : new Date().toISOString(),
          bruto: st,
        })
      }
    }
  }

  if (linhas.length) {
    const { error } = await supabase
      .from('whatsapp_eventos')
      .upsert(linhas, { onConflict: 'wa_message_id,direcao,tipo', ignoreDuplicates: true })
    // Nunca devolve erro para a Meta: ela reenvia o mesmo evento por horas e,
    // se acumular falha, desliga o webhook. Problema nosso se resolve no log.
    if (error) console.error('[webhook] falha ao gravar:', error.message)
  }

  return new Response('ok', { status: 200 })
}
