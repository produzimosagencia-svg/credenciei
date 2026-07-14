// Geocoding reverso (lat/lng -> endereço legível) via Nominatim (OpenStreetMap),
// gratuito e sem API key. Uso baixo volume (poucas centenas de registros por
// evento) — dentro da política de uso justo do Nominatim.

/** Retorna um endereço aproximado, ou null se não conseguir (falha silenciosa — recurso cosmético). */
export async function enderecoAproximado(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=17&addressdetails=1`
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Credenciei/1.0 (sistema de credenciamento de eventos)' },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.display_name ?? null
  } catch {
    return null
  }
}
