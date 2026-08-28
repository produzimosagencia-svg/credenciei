// O conteúdo do QR Code da credencial — assinado e com prazo.
//
// ─── O QUE ESTE CÓDIGO FAZ, E O QUE NÃO FAZ ─────────────────────────────────
//
// O QR carrega um código ASSINADO em vez do `qr_token` puro. A assinatura
// (HMAC) impede que alguém forje um QR a partir de um token adivinhado:
// conhecer o formato não basta, é preciso a chave, que nunca sai do servidor.
//
// ⚠️ O código NÃO EXPIRA — decisão do cliente, tomada sabendo do custo.
//
// Isso significa, sem rodeios: um print desta tela continua funcionando para
// sempre. As travas visuais da credencial (bloquear salvar, arrastar,
// imprimir, e esconder o QR quando a tela sai de foco) atrapalham a captura
// casual, mas não impedem ninguém — sempre dá para fotografar a tela com um
// segundo celular, e nenhum navegador consegue bloquear isso.
//
// A defesa que resta contra crachá emprestado é humana e já existe no fluxo:
// o scanner mostra NOME, empresa e função de quem está sendo lido, então quem
// credencia vê na hora se a pessoa na frente dele confere. Vale reforçar isso
// com a equipe do credenciamento.
//
// Se um dia voltar a valer a pena expirar, o caminho é curto: o `expira` já
// viaja dentro do código e já é coberto pela assinatura — basta voltar a
// compará-lo com o relógio em `lerCodigoQR`.

import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Prazo gravado dentro do código.
 *
 * Fica de propósito num horizonte longo em vez de zero: o campo continua
 * assinado e verificável, então religar a expiração é trocar uma linha em
 * `lerCodigoQR`, sem invalidar nada do que já está em circulação.
 */
export const VALIDADE_CODIGO_S = 10 * 365 * 24 * 60 * 60

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

/** Um código novo para aquela credencial. */
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

  /*
   * NÃO checa o prazo, de propósito (ver o cabeçalho): o cliente pediu que o
   * QR não expire. `agora` continua no parâmetro porque religar a expiração é
   * só descomentar a comparação abaixo.
   *
   *   if (expira * 1000 < agora) return { ok: false, erro: 'QR Code expirado.' }
   */
  void agora

  return { ok: true, token }
}
