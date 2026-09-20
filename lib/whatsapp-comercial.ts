/*
 * O WhatsApp comercial da Credenciei, num lugar só.
 *
 * A Credenciei não capta por formulário: toda divulgação leva direto pra
 * conversa. Por isso o número aparece em exatamente um arquivo, e quem quiser
 * trocar troca aqui (ou pela variável de ambiente, sem mexer em código).
 *
 * Ninguém deve montar link de wa.me na mão em outro lugar do projeto: use
 * `linkDoWhatsApp()`. Número escrito à mão na tela é como o placeholder
 * 5500000000000 sobreviveu meses na landing sem ninguém notar.
 */

// Só dígitos, com o 55 do país na frente. Sem +, sem espaço, sem traço.
const NUMERO_PADRAO = '5527998869852'

export const numeroComercial = (
  process.env.NEXT_PUBLIC_WHATSAPP_COMERCIAL || NUMERO_PADRAO
).replace(/\D/g, '')

export const MENSAGEM_PADRAO =
  'Oi! Quero saber como funciona a Credenciei pro meu evento.'

/**
 * Monta o link da conversa já com a primeira mensagem escrita.
 * A mensagem é só o que a pessoa vai ver: a origem do clique não vai no texto,
 * ela é gravada no banco pela rota /wa antes do desvio.
 */
export function linkDoWhatsApp(mensagem: string = MENSAGEM_PADRAO): string {
  return `https://wa.me/${numeroComercial}?text=${encodeURIComponent(mensagem)}`
}
