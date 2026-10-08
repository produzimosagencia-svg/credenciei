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
 * Dentro ou fora do local. A margem soma a imprecisão do GPS (até 300 m) — um aparelho que diz "estou aqui com
 * 200 m de erro" não é marcado como fora por causa do erro dele. Sem posição ou sem local configurado: `null`
 * (não dá para afirmar nada).
 */
export function avaliarLocal(pos: Posicao | null, local: LocalDoEvento | null): { distanciaM: number | null; foraDoLocal: boolean | null } {
  if (!pos || !local) return { distanciaM: null, foraDoLocal: null }
  const distanciaM = distanciaMetros(pos, local)
  const margem = Math.min(pos.precisao ?? 0, 300)
  return { distanciaM, foraDoLocal: distanciaM > local.raioM + margem }
}

/** "a 3,2 km do local" / "a 450 m do local" — para a tela interna. */
export function descreverDistancia(m: number): string {
  return m >= 1000 ? `a ${(m / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km do local` : `a ${m} m do local`
}
