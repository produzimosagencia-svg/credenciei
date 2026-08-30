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

/**
 * Marca que a Meta recusou a ENTREGA de uma mensagem que ela já tinha aceitado.
 *
 * Exportado para a tela poder reconhecer sem repetir o texto: quem lê o campo
 * `erro` procura por esta marca para saber que a falha é de entrega, e não de
 * envio.
 */
export const MARCA_NAO_ENTREGUE = 'NÃO ENTREGUE —'

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
    /*
     * Cada evento é inserido separadamente. A Meta pode reenviar um status já
     * gravado no MESMO POST em que entrega uma mensagem nova. Num INSERT do
     * lote inteiro, a duplicata gera 23505 e o Postgres desfaz também a linha
     * nova — exatamente a situação que deixa "Conversas" vazia mesmo com o
     * webhook ativo. Isolar as linhas faz a duplicata morrer sozinha.
     *
     * Não usamos upsert porque o índice de dedupe é parcial e o PostgREST não
     * consegue mirá-lo de forma confiável no ON CONFLICT.
     */
    for (const linha of linhas) {
      const { error } = await supabase.from('whatsapp_eventos').insert(linha)
      if (error && error.code !== '23505') {
        console.error('[webhook] falha ao gravar:', error.code, error.message)
      }
    }
  }

  /*
   * O DESFECHO VOLTA PARA A FILA.
   *
   * A API da Meta responde 200 e `accepted` mesmo para número que não existe —
   * ela só ecoa o que recebeu. A falha real chega aqui, segundos depois, como
   * `failed · Message undeliverable`.
   *
   * Sem esta parte, a falha morria no registro do WhatsApp e a fila continuava
   * dizendo "enviado". Foi o que aconteceu num teste de importação: três
   * mensagens recusadas pela Meta, e a tela mostrando as três como enviadas —
   * não havia como o produtor saber.
   *
   * Com 56 pessoas num evento, cinco números errados na planilha significam
   * cinco pessoas chegando sem instrução nenhuma, e o organizador descobrindo
   * no portão.
   *
   * Só `failed` volta. `sent`, `delivered` e `read` são o caminho normal e não
   * mudam nada do que a fila precisa saber — gravá-los seria escrita a cada
   * mensagem entregue, por informação que já está no registro do WhatsApp.
   */
  const falhas = linhas.filter(l => l.direcao === 'status' && l.tipo === 'failed' && l.wa_message_id)
  for (const f of falhas) {
    const { error } = await supabase
      .from('mensagens_agendadas')
      .update({
        /*
         * A falha vai no campo `erro`, e o status continua `enviado`.
         *
         * Um status novo seria mais direto de ler, e exigiria alterar a
         * restrição do banco — mudança de schema em produção, na semana de um
         * evento, por uma informação que cabe num campo que já existe.
         *
         * E `enviado` continua sendo verdade: o envio saiu, a Meta aceitou. O
         * que falhou foi a ENTREGA, que é outro momento — e é exatamente essa
         * distinção que o campo `erro` carrega.
         *
         * O prefixo é o que a tela procura para diferenciar de um erro de
         * envio comum. Sem ele, seria preciso adivinhar pelo texto da Meta.
         */
        erro: `${MARCA_NAO_ENTREGUE} ${f.texto ?? 'a operadora não conseguiu entregar.'}`,
      })
      .eq('evolution_message_id', f.wa_message_id)
      // Não mexe no que foi cancelado à mão: o produtor decidiu, e o desfecho
      // tardio da Meta não pode desfazer a decisão dele.
      .eq('status', 'enviado')

    if (error) console.error('[webhook] não consegui marcar a falha:', error.message)
  }

  /*
   * Sempre 200, mesmo com erro nosso. A Meta reenvia o evento por horas quando
   * não recebe 200, e desliga o webhook se a falha persistir — perder um
   * evento é bem melhor que perder o canal.
   */

  return new Response('ok', { status: 200 })
}
