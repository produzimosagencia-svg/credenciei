// Cliente da API oficial do WhatsApp — Meta Cloud API.
//
// ─── POR QUE ESTE ARQUIVO EXISTE ────────────────────────────────────────────
//
// A Evolution (WhatsApp Web automatizado) derrubou o número duas vezes: a
// primeira com banimento, a segunda com restrição de "não pode iniciar novas
// conversas" depois de 51 mensagens num dia. Não é ajuste de código — é a
// plataforma errada para volume. Mil pessoas num evento passam de 3.000
// mensagens numa semana.
//
// A Cloud API é feita exatamente para isso: envio para quem nunca te escreveu
// é permitido, desde que por TEMPLATE aprovado.
//
// ─── A DIFERENÇA QUE MUDA O CÓDIGO ──────────────────────────────────────────
//
// A Evolution manda texto livre. A Cloud API não: fora da janela de 24h depois
// da última mensagem da pessoa, só sai template aprovado, com os parâmetros
// entregues separados do texto. É por isso que `montarEnvioTemplate` sempre
// produziu `{ template, params }` em vez de uma string pronta — a montagem já
// estava no formato certo esperando este momento.

const VERSAO = 'v21.0'
const IDIOMA = 'pt_BR'

// Os templates de autenticação aprovados pela Meta possuem um botão URL
// "Copiar código". A Cloud API exige que o mesmo código do corpo seja enviado
// também como parâmetro desse botão; mandar apenas o body resulta em erro de
// quantidade de parâmetros, embora a prévia do template pareça correta.
const TEMPLATES_AUTENTICACAO = new Set([
  'acesso_supervisor_auth',
  'credenciais_supervisor_auth',
])

export type ResultadoEnvio = {
  ok: boolean
  statusHttp: number
  messageId?: string
  resposta: unknown
}

/**
 * Espaçamento entre mensagens no processamento da fila.
 *
 * Bem menor que o da Evolution (3–8s): aqui não há navegador sendo pilotado
 * nem heurística de robô para enganar — a Meta publica limites de taxa e o
 * gargalo real é a camada de destinatários por 24h, não a velocidade.
 */
export const ESPACAMENTO_MS = { min: 300, max: 900 }

type Configuracao =
  | { ok: false; erro: string }
  | { ok: true; token: string; phoneId: string }

function configuracao(): Configuracao {
  const token = process.env.WHATSAPP_TOKEN
  const phoneId = process.env.WHATSAPP_PHONE_ID
  if (!token || !phoneId) {
    return { ok: false, erro: 'Cloud API não configurada (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID ausentes)' }
  }
  return { ok: true, token, phoneId }
}

/** Normaliza telefone (10-11 dígitos, sem DDI) pro formato com DDI do Brasil. */
export function formatarNumeroWhatsApp(telefone: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) return `55${digitos}`
  if (digitos.length === 12 || digitos.length === 13) {
    return digitos.startsWith('55') ? digitos : null
  }
  return null
}

async function chamar(corpo: unknown, phoneNumberId?: string): Promise<ResultadoEnvio> {
  const cfg = configuracao()
  if (!cfg.ok) return { ok: false, statusHttp: 0, resposta: { erro: cfg.erro } }

  try {
    const res = await fetch(`https://graph.facebook.com/${VERSAO}/${phoneNumberId ?? cfg.phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}` },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(20_000),
    })
    const resposta = await res.json().catch(() => null)
    if (!res.ok) return { ok: false, statusHttp: res.status, resposta }

    const messageId = (resposta as { messages?: { id?: string }[] } | null)?.messages?.[0]?.id
    return { ok: true, statusHttp: res.status, messageId, resposta }
  } catch (e: unknown) {
    const erro = e instanceof Error ? e.message : 'Falha de rede ao chamar a Cloud API'
    return { ok: false, statusHttp: 0, resposta: { erro } }
  }
}

/**
 * Envia um TEMPLATE aprovado. É o caminho normal do sistema — toda mensagem
 * que o Credenciei inicia passa por aqui.
 *
 * Os parâmetros vão na ordem em que aparecem no corpo do template ({{1}},
 * {{2}}…). Fora de ordem, a Meta aceita e entrega o texto errado — por isso
 * `montarEnvioTemplate` monta a lista na mesma ordem do texto aprovado.
 */
export async function enviarTemplate(
  numero: string,
  template: string,
  params: string[],
  phoneNumberId?: string,
): Promise<ResultadoEnvio> {
  const parametrosBody = params.map(p => ({ type: 'text', text: String(p ?? '') }))
  const componentes = params.length
    ? [
        { type: 'body', parameters: parametrosBody },
        ...(TEMPLATES_AUTENTICACAO.has(template) && params[0]
          ? [{
              type: 'button',
              sub_type: 'url',
              index: '0',
              parameters: [{ type: 'text', text: String(params[0]) }],
            }]
          : []),
      ]
    : []

  return chamar({
    messaging_product: 'whatsapp',
    to: numero,
    type: 'template',
    template: {
      name: template,
      language: { code: IDIOMA },
      // Sem `components` quando o template não tem variável: mandar um body
      // vazio faz a Meta recusar com "number of parameters does not match".
      ...(componentes.length ? { components: componentes } : {}),
    },
  }, phoneNumberId)
}

/**
 * Envia TEXTO LIVRE. Só funciona dentro da janela de 24h depois de a pessoa
 * ter escrito para o número — fora dela a Meta recusa com o código 131047.
 *
 * Serve para resposta no chat, nunca para mensagem que o sistema inicia.
 */
export async function enviarTextoLivre(numero: string, texto: string): Promise<ResultadoEnvio> {
  return chamar({
    messaging_product: 'whatsapp',
    to: numero,
    type: 'text',
    text: { body: texto, preview_url: false },
  })
}

/**
 * O canal está saudável?
 *
 * Diferente da Evolution, aqui não existe "desconectado" — o número não cai
 * sozinho. O que existe e derruba o envio é a QUALIDADE cair para vermelho ou
 * o número ser bloqueado, e é isso que esta checagem enxerga.
 */
export async function estadoDaInstancia(): Promise<{ conectada: boolean; estado: string }> {
  const cfg = configuracao()
  if (!cfg.ok) return { conectada: false, estado: cfg.erro }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${VERSAO}/${cfg.phoneId}?fields=quality_rating,messaging_limit_tier,status`,
      { headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(10_000) },
    )
    const corpo = await res.json().catch(() => null) as
      { quality_rating?: string; messaging_limit_tier?: string; status?: string; error?: { message?: string } } | null

    if (!res.ok || corpo?.error) {
      return { conectada: false, estado: corpo?.error?.message ?? `HTTP ${res.status}` }
    }

    const qualidade = corpo?.quality_rating ?? 'UNKNOWN'
    const situacao = corpo?.status ?? 'UNKNOWN'
    // RED ainda entrega, mas é o degrau antes do bloqueio: melhor a faixa
    // vermelha no Painel aparecer aí do que depois de o número cair.
    const saudavel = situacao !== 'BANNED' && situacao !== 'RESTRICTED' && qualidade !== 'RED'
    return {
      conectada: saudavel,
      estado: `${situacao} · qualidade ${qualidade} · limite ${corpo?.messaging_limit_tier ?? '?'}`,
    }
  } catch (e: unknown) {
    return { conectada: false, estado: e instanceof Error ? e.message : 'sem resposta' }
  }
}
