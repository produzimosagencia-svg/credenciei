// Client fino pra WhatsApp Cloud API (Meta oficial) — substitui a Evolution
// API (WhatsApp Web não-oficial) depois do banimento do número por padrão
// de envio automatizado. Sem dependência de Next.js — usado tanto pelos
// server actions/rotas quanto pelo worker standalone que roda na VPS.
//
// Diferença que importa pro resto do código: mensagens iniciadas pelo
// sistema (fora de uma janela de 24h de conversa começada pelo usuário) só
// podem ser enviadas como TEMPLATE previamente aprovado pela Meta — nunca
// texto livre. Por isso a assinatura recebe um nome de template + lista de
// parâmetros, em vez de um texto pronto.

export type ResultadoEnvio = {
  ok: boolean
  statusHttp: number
  messageId?: string
  resposta: unknown
}

const GRAPH_VERSION = 'v21.0'

/** Normaliza telefone de funcionarios.telefone (10-11 dígitos, sem DDI) pro formato que a Cloud API espera (DDI + DDD + número, sem "+"). */
export function formatarNumeroWhatsApp(telefone: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if (digitos.length === 12 || digitos.length === 13) {
    // já parece vir com DDI
    return digitos.startsWith('55') ? digitos : null
  }
  return null
}

/**
 * Envia uma mensagem de TEMPLATE via WhatsApp Cloud API. `params` preenche,
 * em ordem, as variáveis {{1}}, {{2}}... do corpo do template (idioma
 * pt_BR). O template precisa já estar aprovado no WhatsApp Manager da Meta
 * com esse nome e essa quantidade de variáveis — nome errado ou template
 * ainda em análise retorna erro da própria API. Nunca lança — erros de
 * rede/API viram { ok: false }.
 */
export async function enviarWhatsApp(numero: string, templateName: string, params: string[]): Promise<ResultadoEnvio> {
  const token = process.env.WHATSAPP_CLOUD_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!token || !phoneNumberId) {
    return { ok: false, statusHttp: 0, resposta: { erro: 'WhatsApp Cloud API não configurada (WHATSAPP_CLOUD_TOKEN/WHATSAPP_PHONE_NUMBER_ID ausentes)' } }
  }

  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: numero,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'pt_BR' },
          ...(params.length ? { components: [{ type: 'body', parameters: params.map(text => ({ type: 'text', text })) }] } : {}),
        },
      }),
    })
    const resposta = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, statusHttp: res.status, resposta }
    const messageId = resposta?.messages?.[0]?.id
    return { ok: true, statusHttp: res.status, messageId, resposta }
  } catch (e: unknown) {
    const erro = e instanceof Error ? e.message : 'Falha de rede ao chamar a WhatsApp Cloud API'
    return { ok: false, statusHttp: 0, resposta: { erro } }
  }
}
