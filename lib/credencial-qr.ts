// O conteúdo do QR Code da credencial — assinado e com prazo.
//
// ─── UM QR POR DIA ──────────────────────────────────────────────────────────
//
// O QR carrega um código ASSINADO em vez do `qr_token` puro, e a assinatura
// cobre O DIA. Isso significa que o mesmo link mostra um QR diferente a cada
// dia da operação, sem precisar mandar mensagem nova: a pessoa abre a mesma
// credencial de sempre e o código de hoje está lá.
//
// É o que resolve o print passado adiante. Antes, a imagem do dia 28 valia
// para sempre — bastava mandar no grupo e outra pessoa entrava por você. Agora
// ela vale só no dia 28: no dia seguinte o scanner recusa, porque a assinatura
// que ele confere inclui a data.
//
// A assinatura (HMAC) é o que impede forjar: mudar a data dentro do código
// quebra a conferência, e gerar uma assinatura nova exige a chave, que nunca
// sai do servidor.
//
// ─── O QUE ISTO NÃO RESOLVE ─────────────────────────────────────────────────
//
// Emprestar o crachá NO MESMO DIA continua possível — dentro do dia o código é
// o mesmo, e nenhum navegador impede print. Contra isso a defesa é humana e já
// existe: o scanner mostra NOME, empresa e função de quem está sendo lido, e
// quem credencia confere com a pessoa à sua frente.

import { createHmac, timingSafeEqual } from 'node:crypto'

/*
 * Versão do formato. Subiu de c1 para c2 quando o dia entrou na assinatura:
 * um código antigo não tem data, então não há como saber de que dia ele é —
 * e aceitar sem saber devolveria exatamente o print eterno que isto remove.
 */
const PREFIXO = 'c2'

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

function assinar(token: string, dia: string): string {
  return createHmac('sha256', chave())
    .update(`${PREFIXO}.${token}.${dia}`)
    .digest('base64url')
    .slice(0, 16)
}

export type CodigoQR = { codigo: string; dia: string }

/** O código daquela credencial NAQUELE DIA ("2026-08-28", em Brasília). */
export function gerarCodigoQR(token: string, dia: string): CodigoQR {
  return { codigo: `${PREFIXO}.${token}.${dia}.${assinar(token, dia)}`, dia }
}

export type LeituraQR = { ok: true; token: string; dia: string } | { ok: false; erro: string }

/**
 * Lê o que veio do scanner e devolve o token, ou a recusa já em português.
 *
 * Rejeita de propósito o token cru que o formato antigo usava: aceitá-lo
 * manteria de pé exatamente o print que esta mudança existe para inutilizar.
 * Quem estiver com a tela antiga aberta recebe uma instrução clara — recarregar
 * a credencial resolve, e é o que a própria tela faz sozinha.
 */
export function lerCodigoQR(bruto: string, diaDeHoje: string): LeituraQR {
  const partes = (bruto ?? '').trim().split('.')

  if (partes.length !== 4 || partes[0] !== PREFIXO) {
    return { ok: false, erro: 'QR Code fora do padrão. Peça para a pessoa abrir a credencial de novo e mostrar o código de hoje.' }
  }

  const [, token, dia, sig] = partes
  if (!token || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    return { ok: false, erro: 'QR Code ilegível. Peça para a pessoa recarregar a credencial.' }
  }

  // Assinatura ANTES da data: sem isso, um código com a data trocada à mão
  // seria recusado por "de outro dia", quando na verdade é forjado — e a
  // recusa mandaria a pessoa recarregar a tela em vez de acender o alerta.
  const esperado = Buffer.from(assinar(token, dia))
  const recebido = Buffer.from(sig)
  if (esperado.length !== recebido.length || !timingSafeEqual(esperado, recebido)) {
    return { ok: false, erro: 'QR Code inválido. Este código não foi emitido por este sistema.' }
  }

  if (dia !== diaDeHoje) {
    const [, m, d] = dia.split('-')
    return {
      ok: false,
      erro: `Este QR Code é do dia ${d}/${m} e não vale hoje. Peça para a pessoa abrir a credencial ao vivo — o código de hoje aparece sozinho.`,
    }
  }

  return { ok: true, token, dia }
}
