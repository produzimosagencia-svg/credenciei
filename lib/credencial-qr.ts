// O conteúdo do QR Code da credencial — assinado e amarrado à ETAPA do evento.
//
// ─── UM QR POR ETAPA, NÃO POR DIA ───────────────────────────────────────────
//
// Um evento tem três etapas, e cada uma tem o seu código:
//
//   montagem     → todos os dias de preparação ANTES do dia do evento
//   principal    → o dia do evento
//   desmontagem  → os dias de trabalho DEPOIS do dia do evento
//
// Dentro de uma etapa o código é o mesmo todos os dias: segunda, terça e
// quarta de montagem mostram o mesmo QR. O que muda o código é virar de etapa.
//
// O ponto disso é separar o crachá do dia do evento do crachá da montagem. O
// dia do evento é o que tem portaria, cliente na frente e mil pessoas; o código
// que circulou a semana inteira na montagem não pode servir para entrar nele.
// Por isso a assinatura cobre a etapa: um QR de montagem apresentado no dia do
// evento é recusado, e vice-versa.
//
// A assinatura (HMAC) é o que impede forjar: trocar a etapa dentro do código
// quebra a conferência, e gerar assinatura nova exige a chave, que nunca sai do
// servidor.
//
// ─── O QUE ISTO NÃO RESOLVE ─────────────────────────────────────────────────
//
// Emprestar o crachá DENTRO DA MESMA ETAPA é possível: na montagem, o print de
// segunda continua valendo na quarta. É uma consequência direta de o código não
// mudar mais todo dia — e foi uma escolha, não um descuido.
//
// Onde mais importa, a exposição continua curta: o dia principal é um dia só,
// então o código dele nasce e morre naquele dia, igual ao modelo antigo.
//
// A outra defesa é humana e já existe: o scanner mostra NOME e função de quem
// está sendo lido, e quem credencia confere com a pessoa à sua frente.

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FaseDoDia } from './janelas'

/*
 * Versão do formato:
 *
 *   c1 — token cru, sem assinatura. Nunca mais aceito.
 *   c2 — assinatura cobrindo O DIA. Ainda aceito (ver `lerCodigoQR`).
 *   c3 — assinatura cobrindo a ETAPA. O formato atual.
 */
const PREFIXO = 'c3'
const PREFIXO_LEGADO = 'c2'

/** A etapa, abreviada dentro do código. */
const SIGLA: Record<FaseDoDia, string> = {
  montagem: 'm',
  evento: 'p',
  desmontagem: 'd',
}
const POR_SIGLA: Record<string, FaseDoDia> = { m: 'montagem', p: 'evento', d: 'desmontagem' }

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

/** Assina no formato atual: o par (credencial, etapa). */
function assinar(token: string, sigla: string): string {
  return createHmac('sha256', chave())
    .update(`${PREFIXO}.${token}.${sigla}`)
    .digest('base64url')
    .slice(0, 16)
}

/** Assina no formato antigo: o par (credencial, dia). Só para conferir c2. */
function assinarLegado(token: string, dia: string): string {
  return createHmac('sha256', chave())
    .update(`${PREFIXO_LEGADO}.${token}.${dia}`)
    .digest('base64url')
    .slice(0, 16)
}

export type CodigoQR = { codigo: string; fase: FaseDoDia }

/** O código daquela credencial NAQUELA ETAPA do evento. */
export function gerarCodigoQR(token: string, fase: FaseDoDia): CodigoQR {
  const sigla = SIGLA[fase]
  return { codigo: `${PREFIXO}.${token}.${sigla}.${assinar(token, sigla)}`, fase }
}

export type LeituraQR =
  | { ok: true; token: string; fase: FaseDoDia | null }
  | { ok: false; erro: string }

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/**
 * Lê o que veio do scanner: confere a ASSINATURA e devolve token e etapa.
 *
 * Não decide se a etapa serve para hoje — isso depende do evento que está sendo
 * escaneado, que só quem chamou conhece. Aqui se responde apenas "este código
 * saiu deste sistema, e para qual etapa ele foi emitido?".
 *
 * `fase: null` significa código no formato antigo (c2), que era amarrado ao dia
 * e não à etapa. Ver a nota sobre compatibilidade abaixo.
 */
export function lerCodigoQR(bruto: string, diaDeHoje: string): LeituraQR {
  const partes = (bruto ?? '').trim().split('.')

  if (partes.length !== 4) {
    return { ok: false, erro: 'QR Code fora do padrão. Peça para a pessoa abrir a credencial de novo e mostrar o código.' }
  }

  const [versao, token, meio, sig] = partes
  if (!token) return { ok: false, erro: 'QR Code ilegível. Peça para a pessoa recarregar a credencial.' }

  // ── Formato atual: a etapa ────────────────────────────────────────────────
  if (versao === PREFIXO) {
    if (!POR_SIGLA[meio]) {
      return { ok: false, erro: 'QR Code ilegível. Peça para a pessoa recarregar a credencial.' }
    }
    if (!iguais(assinar(token, meio), sig)) {
      return { ok: false, erro: 'QR Code inválido. Este código não foi emitido por este sistema.' }
    }
    return { ok: true, token, fase: POR_SIGLA[meio] }
  }

  /*
   * ── Formato antigo (c2), amarrado ao dia ────────────────────────────────
   *
   * Continua aceito para não derrubar quem está com a credencial ABERTA na
   * tela no momento em que a versão nova sobe: a imagem já desenhada é a
   * antiga, e recusá-la deixaria a pessoa parada no portão sem entender por
   * quê. Quem recarregar já recebe o código novo.
   *
   * Não abre brecha: c2 vale só no dia em que foi emitido, o que é mais
   * restrito do que a etapa — um c2 de segunda-feira não passa no dia do
   * evento, que é justamente o que esta mudança quer garantir.
   *
   * Pode sair depois que a operação do evento passar.
   */
  if (versao === PREFIXO_LEGADO) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meio)) {
      return { ok: false, erro: 'QR Code ilegível. Peça para a pessoa recarregar a credencial.' }
    }
    if (!iguais(assinarLegado(token, meio), sig)) {
      return { ok: false, erro: 'QR Code inválido. Este código não foi emitido por este sistema.' }
    }
    if (meio !== diaDeHoje) {
      const [, m, d] = meio.split('-')
      return {
        ok: false,
        erro: `Este QR Code é do dia ${d}/${m} e não vale hoje. Peça para a pessoa abrir a credencial ao vivo — o código de hoje aparece sozinho.`,
      }
    }
    return { ok: true, token, fase: null }
  }

  return { ok: false, erro: 'QR Code fora do padrão. Peça para a pessoa abrir a credencial de novo e mostrar o código.' }
}

/** Como a etapa aparece para quem está no portão. */
export const NOME_DA_FASE: Record<FaseDoDia, string> = {
  montagem: 'montagem',
  evento: 'dia do evento',
  desmontagem: 'desmontagem',
}

/**
 * A etapa do QR serve para a etapa de hoje?
 *
 * A recusa precisa dizer as duas etapas. "QR Code inválido" faria o operador
 * achar em código falsificado e chamar a segurança, quando o que houve foi a
 * pessoa mostrar o crachá da montagem no dia do evento — coisa que vai
 * acontecer, e que se resolve pedindo para ela recarregar a tela.
 */
export function faseConfere(doQR: FaseDoDia | null, deHoje: FaseDoDia): Veredito {
  // Código antigo (c2): já foi conferido contra o DIA de hoje, que é mais
  // restrito que a etapa. Nada a checar aqui.
  if (doQR === null) return { ok: true }
  if (doQR === deHoje) return { ok: true }
  return {
    ok: false,
    erro: `Este QR Code é o da ${NOME_DA_FASE[doQR]}, e hoje é ${NOME_DA_FASE[deHoje]}. Peça para a pessoa abrir a credencial de novo — o código certo aparece sozinho.`,
  }
}

type Veredito = { ok: true } | { ok: false; erro: string }
