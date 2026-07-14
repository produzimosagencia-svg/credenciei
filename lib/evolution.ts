// Client fino pra Evolution API (WhatsApp self-hosted, modo Baileys).
// Sem dependência de Next.js — usado tanto pelos server actions/rotas
// quanto pelo worker standalone que roda na VPS.

export type ResultadoEnvio = {
  ok: boolean
  statusHttp: number
  messageId?: string
  resposta: unknown
}

/**
 * Normaliza telefone de funcionarios.telefone (10-11 dígitos, sem DDI) pro
 * formato que a Evolution API espera. Retorna null se o formato não bater
 * com nada reconhecível, pra quem chamar logar o erro em vez de enviar lixo.
 */
export function formatarNumeroWhatsApp(telefone: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if (digitos.length === 12 || digitos.length === 13) {
    // já parece vir com DDI
    return digitos.startsWith('55') ? digitos : null
  }
  return null
}

/** Envia uma mensagem de texto via Evolution API. Nunca lança — erros de rede viram { ok: false }. */
export async function enviarWhatsApp(numero: string, texto: string): Promise<ResultadoEnvio> {
  const baseUrl = process.env.EVOLUTION_API_URL
  const apiKey = process.env.EVOLUTION_API_KEY
  const instancia = process.env.EVOLUTION_INSTANCE_NAME
  if (!baseUrl || !apiKey || !instancia) {
    return { ok: false, statusHttp: 0, resposta: { erro: 'Evolution API não configurada (EVOLUTION_API_URL/EVOLUTION_API_KEY/EVOLUTION_INSTANCE_NAME ausentes)' } }
  }

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/message/sendText/${instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number: numero, text: texto }),
    })
    const resposta = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, statusHttp: res.status, resposta }
    const messageId = resposta?.key?.id ?? resposta?.messageId
    return { ok: true, statusHttp: res.status, messageId, resposta }
  } catch (e: unknown) {
    const erro = e instanceof Error ? e.message : 'Falha de rede ao chamar a Evolution API'
    return { ok: false, statusHttp: 0, resposta: { erro } }
  }
}
