/*
 * TELEFONE QUE SERVE PARA RECEBER MENSAGEM. Sem importações: serve à fila do WhatsApp (lib/mensagens.ts), à ficha da
 * equipe e ao "Monte sua equipe".
 */

/**
 * 10 a 13 dígitos e não o genérico de destravar cadastro (DDD + zeros, como o "27 0000-0000" usado no LUAN para quem
 * não tinha telefone, ou "(00) 00000-0000"). Esse genérico passa no cadastro, mas não recebe nada: o sistema não tenta
 * enviar (Juan, 23/10/2026 — a mensagem ia, a Meta devolvia "não entregue" e a ficha mostrava um alarme vermelho).
 */
export function telefoneValido(t: string | null | undefined): boolean {
  const d = String(t ?? '').replace(/\D/g, '')
  if (d.length < 10 || d.length > 13) return false
  return !/^(55)?\d{2}0{8,9}$/.test(d)
}
