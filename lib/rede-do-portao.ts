/*
 * O QUE AS TELAS DO PORTÃO SABEM DA INTERNET, e do evento em que estão (Juan, 19/10/2026: trocar entre o leitor e o
 * Registrar ponto sem internet). Sem importações: serve ao `ModoSemInternet`, ao leitor e ao Registrar ponto.
 *
 * `navigator.onLine` só diz "sem Wi-Fi nem dados". Wi-Fi conectado e sem internet de verdade (o caso do Santana) conta
 * como "online" — por isso as telas também anotam aqui, na hora, quando um pedido não chega.
 */
const CHAVE_SEM_REDE = 'credenciei:sem-rede-ate'
const CHAVE_EVENTO = 'credenciei:evento-do-portao'
/** Quanto tempo uma falha anotada vale — passou disso, a tela volta a achar que há internet até um pedido falhar. */
const LEMBRA_MS = 60_000

/** Um pedido ao servidor não chegou: vale como "sem internet" por um minuto. */
export function percebeuSemRede(): void {
  try { sessionStorage.setItem(CHAVE_SEM_REDE, String(Date.now() + LEMBRA_MS)) } catch { /* aba anônima */ }
}

/** A internet voltou (evento "online", ou um pedido respondeu). */
export function percebeuRede(): void {
  try { sessionStorage.removeItem(CHAVE_SEM_REDE) } catch { /* aba anônima */ }
}

export function semRedeAgora(): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  try { return Number(sessionStorage.getItem(CHAVE_SEM_REDE)) > Date.now() } catch { return false }
}

/** O evento em que este aparelho está trabalhando — a troca de tela sem internet abre a tela DESTE evento. */
export function guardarEventoDoPortao(eventoId: string): void {
  try { if (eventoId) localStorage.setItem(CHAVE_EVENTO, eventoId) } catch { /* aba anônima */ }
}

export function eventoDoPortao(): string | null {
  try { return localStorage.getItem(CHAVE_EVENTO) } catch { return null }
}
