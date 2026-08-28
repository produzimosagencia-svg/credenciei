// Client fino pra Evolution API (WhatsApp Web não-oficial).
//
// ⚠️ HISTÓRICO QUE IMPORTA: este projeto JÁ usou a Evolution, migrou pra Cloud
// API oficial da Meta depois de o número ser BANIDO por padrão de envio
// automatizado, e agora voltou pra Evolution a pedido. O risco de banimento
// não sumiu — ele é inerente a automatizar o WhatsApp Web. Por isso este
// arquivo tem duas defesas que a versão anterior não tinha:
//
//   1. `delay` no próprio payload, que faz a Evolution simular digitação;
//   2. espaçamento com jitter entre envios (ver ESPACAMENTO_MS), aplicado
//      por quem processa a fila.
//
// Não são garantia. O que de fato reduz banimento é volume baixo, número
// aquecido e gente respondendo a conversa — nada disso é código.
//
// Sem dependência de Next.js: roda tanto nos server actions quanto no worker
// standalone da VPS.

export type ResultadoEnvio = {
  ok: boolean
  statusHttp: number
  messageId?: string
  resposta: unknown
}

/**
 * Espaçamento entre uma mensagem e a próxima, no processamento da fila.
 * Disparar 40 mensagens no mesmo segundo é exatamente o padrão que marca o
 * número como robô.
 */
export const ESPACAMENTO_EVOLUTION = { min: 3_000, max: 8_000 }

/** Simula digitação antes de entregar. Valor em ms, aceito pela Evolution. */
const DELAY_DIGITACAO_MS = 1_200

/** Normaliza telefone (10-11 dígitos, sem DDI) pro formato com DDI do Brasil. */
export function formatarNumeroEvolution(telefone: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if (digitos.length === 12 || digitos.length === 13) {
    // já parece vir com DDI
    return digitos.startsWith('55') ? digitos : null
  }
  return null
}

/** Configuração da instância. Sem ela nada sai — e o erro diz o que falta. */
type Configuracao =
  | { ok: false; erro: string }
  | { ok: true; base: string; instancia: string; apikey: string }

function configuracao(): Configuracao {
  const base = (process.env.EVOLUTION_URL ?? '').replace(/\/+$/, '')
  const instancia = process.env.EVOLUTION_INSTANCIA
  const apikey = process.env.EVOLUTION_APIKEY
  if (!base || !instancia || !apikey) {
    return {
      ok: false,
      erro: 'Evolution API não configurada (EVOLUTION_URL / EVOLUTION_INSTANCIA / EVOLUTION_APIKEY ausentes)',
    }
  }
  return { ok: true, base, instancia, apikey }
}

/**
 * Envia uma mensagem de TEXTO pela Evolution.
 *
 * Nunca lança: falha de rede ou erro da API viram `{ ok: false }`, porque o
 * processamento da fila precisa registrar a tentativa e seguir para a próxima
 * mensagem em vez de abortar o lote inteiro.
 */
export async function enviarTextoEvolution(numero: string, texto: string): Promise<ResultadoEnvio> {
  const cfg = configuracao()
  if (!cfg.ok) return { ok: false, statusHttp: 0, resposta: { erro: cfg.erro } }

  try {
    // Evolution v2: POST /message/sendText/{instancia}, autenticação no header.
    const res = await fetch(`${cfg.base}/message/sendText/${encodeURIComponent(cfg.instancia)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.apikey },
      body: JSON.stringify({
        number: numero,
        text: texto,
        delay: DELAY_DIGITACAO_MS,
        linkPreview: false,
      }),
      // A instância roda numa VPS própria: sem timeout, uma queda dela
      // deixaria o worker pendurado e a fila parada.
      signal: AbortSignal.timeout(20_000),
    })

    const resposta = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, statusHttp: res.status, resposta }

    // A Evolution devolve a chave da mensagem em `key.id`.
    const messageId = (resposta as { key?: { id?: string } } | null)?.key?.id
    return { ok: true, statusHttp: res.status, messageId, resposta }
  } catch (e: unknown) {
    const erro = e instanceof Error ? e.message : 'Falha de rede ao chamar a Evolution API'
    return { ok: false, statusHttp: 0, resposta: { erro } }
  }
}

/**
 * A instância está conectada ao WhatsApp?
 *
 * Serve ao diagnóstico: na Evolution o número desconecta sozinho (celular
 * desligado, sessão derrubada, número banido) e, quando isso acontece, todo
 * envio falha em silêncio. Sem esta checagem, a resposta a "por que fulano não
 * recebeu" seria sempre "erro no envio", sem dizer a causa real.
 */
export async function estadoEvolution(): Promise<{ conectada: boolean; estado: string }> {
  const cfg = configuracao()
  if (!cfg.ok) return { conectada: false, estado: cfg.erro }

  try {
    const res = await fetch(`${cfg.base}/instance/connectionState/${encodeURIComponent(cfg.instancia)}`, {
      headers: { apikey: cfg.apikey },
      signal: AbortSignal.timeout(10_000),
    })
    const corpo = await res.json().catch(() => null)
    const estado: string = (corpo as { instance?: { state?: string } } | null)?.instance?.state ?? 'desconhecido'
    return { conectada: estado === 'open', estado }
  } catch (e: unknown) {
    return { conectada: false, estado: e instanceof Error ? e.message : 'sem resposta' }
  }
}
