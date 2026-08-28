// O conteúdo do QR Code da credencial — assinado e com prazo.
//
// ─── POR QUE NÃO É MAIS O TOKEN CRU ──────────────────────────────────────────
//
// Antes o QR carregava o `qr_token` puro. Um print daquela tela valia para
// sempre: bastava mandar a imagem no grupo do WhatsApp e outra pessoa passava
// o crachá por você. Nenhum bloqueio de screenshot resolve isso — sempre dá
// para fotografar a tela com um segundo celular.
//
// O que resolve é a imagem PARAR DE VALER. O QR passa a carregar um código
// assinado com prazo curto, que a tela renova sozinha enquanto estiver aberta.
// O print continua sendo possível; ele só não serve mais alguns minutos depois.
//
// A assinatura (HMAC) é o que impede alguém de forjar um código: conhecer o
// formato não basta, é preciso a chave, que nunca sai do servidor.
//
// ─── O PREÇO, EXPLÍCITO ──────────────────────────────────────────────────────
//
// Uma credencial aberta há muito tempo, sem internet para renovar, para de ser
// aceita. O prazo é generoso de propósito (cinco minutos, renovando a cada
// noventa segundos) e a saída para esse caso já existe e é melhor: o registro
// assistido, em que o supervisor localiza a pessoa e bate por ela com foto.

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Quanto tempo um código continua válido depois de gerado. */
export const VALIDADE_CODIGO_S = 5 * 60

/**
 * De quanto em quanto tempo a tela pede um código novo.
 *
 * Bem menor que a validade de propósito: dá três tentativas de renovação antes
 * de o código atual expirar, então uma falha de rede isolada não derruba o QR
 * na mão de quem está na fila.
 */
export const INTERVALO_RENOVACAO_S = 90

const PREFIXO = 'c1'

/**
 * A chave da assinatura.
 *
 * Deriva da service role em vez de exigir uma variável nova: é um segredo que
 * já existe, já é obrigatório e nunca chega ao navegador. `CREDENCIAL_SEGREDO`
 * sobrepõe quando se quiser rotacionar as assinaturas sem trocar a chave do
 * banco — rotacionar invalida todos os códigos em circulação na hora.
 */
function chave(): string {
  const s = process.env.CREDENCIAL_SEGREDO || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('Sem segredo para assinar a credencial (SUPABASE_SERVICE_ROLE_KEY ausente)')
  return s
}

function assinar(token: string, expira: number): string {
  return createHmac('sha256', chave())
    .update(`${PREFIXO}.${token}.${expira}`)
    .digest('base64url')
    .slice(0, 16)
}

export type CodigoQR = { codigo: string; expiraEm: number }

/** Um código novo, válido por VALIDADE_CODIGO_S segundos a partir de agora. */
export function gerarCodigoQR(token: string, agora = Date.now()): CodigoQR {
  const expira = Math.floor(agora / 1000) + VALIDADE_CODIGO_S
  return {
    codigo: `${PREFIXO}.${token}.${expira}.${assinar(token, expira)}`,
    expiraEm: expira * 1000,
  }
}

export type LeituraQR = { ok: true; token: string } | { ok: false; erro: string }

/**
 * Lê o que veio do scanner e devolve o token, ou a recusa já em português.
 *
 * Rejeita de propósito o token cru que o formato antigo usava: aceitá-lo
 * manteria de pé exatamente o print que esta mudança existe para inutilizar.
 * Quem estiver com a tela antiga aberta recebe uma instrução clara — recarregar
 * a credencial resolve, e é o que a própria tela faz sozinha.
 */
export function lerCodigoQR(bruto: string, agora = Date.now()): LeituraQR {
  const partes = (bruto ?? '').trim().split('.')

  if (partes.length !== 4 || partes[0] !== PREFIXO) {
    return { ok: false, erro: 'QR Code fora do padrão. Peça para a pessoa abrir a credencial de novo e mostrar o código atualizado.' }
  }

  const [, token, expiraStr, sig] = partes
  const expira = Number(expiraStr)
  if (!token || !Number.isFinite(expira)) {
    return { ok: false, erro: 'QR Code ilegível. Peça para a pessoa recarregar a credencial.' }
  }

  // Assinatura antes do prazo: sem isso, um código forjado com prazo válido
  // seria recusado por "expirado", contando que o formato está certo.
  const esperado = Buffer.from(assinar(token, expira))
  const recebido = Buffer.from(sig)
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
    return { ok: false, erro: 'QR Code inválido. Este código não foi emitido por este sistema.' }
  }

  if (expira * 1000 < agora) {
    return { ok: false, erro: 'QR Code expirado — provavelmente é um print antigo. Peça para a pessoa abrir a credencial ao vivo.' }
  }

  return { ok: true, token }
}
