/**
 * Onde o APARELHO DO OPERADOR estava na leitura, comparado com o local do evento — as regras, sem banco
 * (testes/geolocalizacao.mjs). Pedido do Juan (08/10/2026): toda leitura grava a localização; fora do raio do
 * evento a batida vale, mas fica marcada para a conferência interna.
 */

export type Posicao = { latitude: number; longitude: number; precisao?: number | null }
export type LocalDoEvento = { latitude: number; longitude: number; raioM: number }

const validaLat = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= -90 && v <= 90
const validaLng = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= -180 && v <= 180

/** A posição que veio do aparelho, se for de verdade (número, faixa válida, não 0,0). */
export function posicaoValida(p: unknown): Posicao | null {
  const x = (p ?? {}) as Record<string, unknown>
  if (!validaLat(x.latitude) || !validaLng(x.longitude)) return null
  if (x.latitude === 0 && x.longitude === 0) return null
  const precisao = typeof x.precisao === 'number' && Number.isFinite(x.precisao) && x.precisao >= 0 ? Math.round(x.precisao) : null
  return { latitude: x.latitude, longitude: x.longitude, precisao }
}

/** Distância em metros entre dois pontos (haversine). */
export function distanciaMetros(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const R = 6371000
  const rad = (g: number) => (g * Math.PI) / 180
  const dLat = rad(b.latitude - a.latitude)
  const dLng = rad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(h)))
}

/**
 * A pior precisão que ainda vale como PROVA de "fora do local" (Juan, 12/10/2026, VITAL — supervisora marcada "a 8 km"
 * com a localização do celular dela em ±500 m e ±50 km: "essa localização não pode errar em hipótese alguma, é motivo de
 * auditoria para não pagarmos a pessoa"). GPS de verdade dá 3–30 m; ±500 m, ±5 km, ±50 km é a localização APROXIMADA
 * (iPhone com "Localização Precisa" desligada, rede do celular, IP) — não diz onde o aparelho está.
 */
export const PRECISAO_MAXIMA_PROVA_M = 100

/** Precisão pior que a de prova: a posição não afirma nada — nem dentro, nem fora. */
export function posicaoImprecisa(precisao: number | null | undefined): boolean {
  return typeof precisao === 'number' && Number.isFinite(precisao) && precisao > PRECISAO_MAXIMA_PROVA_M
}

/**
 * A posição serve de PROVA (de "fora do local")? Só com a precisão CONHECIDA e boa. Sem precisão gravada (o celular da
 * própria pessoa não mandava até 12/10/2026) não dá pra saber se era GPS ou aproximada — então não prova.
 */
export function provaDeLocal(precisao: number | null | undefined): boolean {
  return typeof precisao === 'number' && Number.isFinite(precisao) && precisao <= PRECISAO_MAXIMA_PROVA_M
}

/**
 * Dentro ou fora do local. A margem soma a imprecisão do GPS (até 300 m) — um aparelho que diz "estou aqui com
 * 200 m de erro" não é marcado como fora por causa do erro dele. Sem posição ou sem local configurado: `null`
 * (não dá para afirmar nada).
 *
 * Além do raio com localização APROXIMADA (`posicaoImprecisa`): `foraDoLocal: null` e `imprecisa: true` — quem chama
 * recusa a batida pedindo a localização precisa, mas NUNCA registra isso como "fora do local".
 */
export function avaliarLocal(pos: Posicao | null, local: LocalDoEvento | null): { distanciaM: number | null; foraDoLocal: boolean | null; imprecisa: boolean } {
  if (!pos || !local) return { distanciaM: null, foraDoLocal: null, imprecisa: false }
  const distanciaM = distanciaMetros(pos, local)
  const margem = Math.min(pos.precisao ?? 0, 300)
  if (distanciaM <= local.raioM + margem) return { distanciaM, foraDoLocal: false, imprecisa: false }
  // Sem precisão conhecida e boa, "fora" não se afirma (aparelho antigo, aba antiga, localização aproximada).
  if (!provaDeLocal(pos.precisao)) return { distanciaM, foraDoLocal: null, imprecisa: true }
  return { distanciaM, foraDoLocal: true, imprecisa: false }
}

/** "±500 m" / "±50 km". */
function textoPrecisao(m: number): string {
  return m >= 1000 ? `±${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : `±${Math.round(m)} m`
}

/** O que a tela diz quando a localização do aparelho é aproximada. Nada é registrado. */
export function mensagemLocalImpreciso(precisao: number | null | undefined): string {
  return `LOCALIZAÇÃO IMPRECISA (${typeof precisao === 'number' ? textoPrecisao(precisao) : 'aproximada'}) — o aparelho não está usando o GPS. `
    + 'A batida não foi registrada. Ligue a localização PRECISA (no iPhone: Ajustes › Privacidade › Serviços de Localização › '
    + 'o navegador › Localização Precisa) e tente de novo.'
}

/** "a 3,2 km do local" / "a 450 m do local" — para a tela interna. */
export function descreverDistancia(m: number): string {
  return m >= 1000 ? `a ${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km do local` : `a ${m} m do local`
}
