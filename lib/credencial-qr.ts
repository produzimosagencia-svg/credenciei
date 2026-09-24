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
import { ed25519 } from '@noble/curves/ed25519'
import type { FaseDoDia } from './janelas'

/*
 * Versão do formato:
 *
 *   c1 — token cru, sem assinatura. Nunca mais aceito.
 *   c2 — assinatura cobrindo O DIA. Ainda aceito (ver `lerCodigoQR`).
 *   c3 — assinatura cobrindo a ETAPA (HMAC, chave simétrica). O formato atual.
 *   c4 — assinatura Ed25519 (chave assimétrica) cobrindo ETAPA + JANELA DE
 *        TEMPO — ainda não gerado por este sistema, só aceito. Ver ADR 009
 *        do credenciei-app (`docs/decisoes/009-qr-offline-ed25519.md`), que
 *        vale pros dois sistemas: os dois geram E leem QR hoje.
 */
const PREFIXO = 'c3'
const PREFIXO_LEGADO = 'c2'
const PREFIXO_ED25519 = 'c4'

/** Mesma duração de janela do credenciei-app — os dois lados têm que concordar. */
const JANELA_MS = 2 * 60_000

function janelaDoInstante(instanteMs: number): number {
  return Math.floor(instanteMs / JANELA_MS)
}

/** A atual e a anterior — ~4 min de folga. Ver ADR 009. */
function janelasAceitas(agora: Date): number[] {
  const atual = janelaDoInstante(agora.getTime())
  return [atual, atual - 1]
}

/**
 * A chave PÚBLICA Ed25519 do QR novo — `null` enquanto o par não existir ou
 * a aceitação de `c4` ainda não estiver ligada (ver ADR 009, fases 1-2). A
 * privada correspondente não entra neste arquivo — só é necessária para
 * GERAR, que ainda não acontece (fase 3).
 */
function chavePublicaEd25519(): Uint8Array | null {
  const hex = process.env.CHAVE_PUBLICA_QR_ED25519
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) return null
  return new Uint8Array(Buffer.from(hex, 'hex'))
}

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

/** Assina com a chave PRIVADA Ed25519 — a mesma usada pelo credenciei-app. */
function assinarComEd25519(chavePrivada: Uint8Array, ...partes: string[]): string {
  const assinatura = ed25519.sign(Buffer.from([PREFIXO_ED25519, ...partes].join('.')), chavePrivada)
  return Buffer.from(assinatura).toString('base64url')
}

/** Confere com a chave PÚBLICA Ed25519. */
function conferirComEd25519(chavePublica: Uint8Array, assinaturaB64: string, ...partes: string[]): boolean {
  try {
    const assinatura = Buffer.from(assinaturaB64, 'base64url')
    return ed25519.verify(assinatura, Buffer.from([PREFIXO_ED25519, ...partes].join('.')), chavePublica)
  } catch {
    return false
  }
}

export type CodigoQR = { codigo: string; fase: FaseDoDia }

/** O código daquela credencial NAQUELA ETAPA do evento. */
export function gerarCodigoQR(token: string, fase: FaseDoDia): CodigoQR {
  const sigla = SIGLA[fase]
  return { codigo: `${PREFIXO}.${token}.${sigla}.${assinar(token, sigla)}`, fase }
}

/**
 * O código no formato novo (`c4`) — ainda não é o que este sistema gera por
 * padrão (ver ADR 009, fase 3). Existe desde já para os dois sistemas
 * ficarem prontos a ACEITAR antes de qualquer um GERAR — nunca o contrário,
 * senão um sistema recusaria crachá que o outro já estivesse emitindo.
 */
export function gerarCodigoQREd25519(
  chavePrivada: Uint8Array, token: string, fase: FaseDoDia, agora: Date = new Date(),
): CodigoQR {
  const sigla = SIGLA[fase]
  const janela = String(janelaDoInstante(agora.getTime()))
  const assinatura = assinarComEd25519(chavePrivada, token, sigla, janela)
  return { codigo: `${PREFIXO_ED25519}.${token}.${sigla}.${janela}.${assinatura}`, fase }
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
export function lerCodigoQR(bruto: string, diaDeHoje: string, agora: Date = new Date()): LeituraQR {
  const partes = (bruto ?? '').trim().split('.')

  if (partes.length !== 4 && !(partes.length === 5 && partes[0] === PREFIXO_ED25519)) {
    return { ok: false, erro: 'QR Code fora do padrão. Peça para a pessoa abrir a credencial de novo e mostrar o código.' }
  }

  const [versao, token] = partes
  if (!token) return { ok: false, erro: 'QR Code ilegível. Peça para a pessoa recarregar a credencial.' }

  // ── Formato novo: Ed25519 + janela de tempo ─────────────────────────────
  if (versao === PREFIXO_ED25519) {
    const [, , meioNovo, janelaTxt, sigNova] = partes
    if (!POR_SIGLA[meioNovo]) {
      return { ok: false, erro: 'QR Code ilegível. Peça para a pessoa recarregar a credencial.' }
    }
    const chavePublica = chavePublicaEd25519()
    if (!chavePublica) {
      return { ok: false, erro: 'QR Code fora do padrão. Peça para a pessoa abrir a credencial de novo e mostrar o código.' }
    }
    const janela = Number(janelaTxt)
    if (!Number.isInteger(janela) || !janelasAceitas(agora).includes(janela)) {
      return {
        ok: false,
        erro: 'Este QR Code expirou. Peça para a pessoa abrir a credencial de novo — o código troca sozinho de tempos em tempos.',
      }
    }
    if (!conferirComEd25519(chavePublica, sigNova, token, meioNovo, janelaTxt)) {
      return { ok: false, erro: 'QR Code inválido. Este código não foi emitido por este sistema.' }
    }
    return { ok: true, token, fase: POR_SIGLA[meioNovo] }
  }

  const [, , meio, sig] = partes

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
