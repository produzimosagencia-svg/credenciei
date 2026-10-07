/*
 * O WhatsApp de SUPORTE HUMANO — o número pra onde vai quem toca em "Falar com
 * o suporte" na credencial. Não é o comercial (`whatsapp-comercial.ts`, de quem
 * quer contratar): aqui é quem já está no evento e precisa de ajuda na hora.
 *
 * O número vem de NEXT_PUBLIC_WHATSAPP_SUPORTE (só dígitos, com o 55 do país).
 * Sem ele configurado, o botão simplesmente não aparece: melhor sem botão do
 * que mandar a pessoa pra um número errado no meio do evento.
 */
const numeroSuporte = (process.env.NEXT_PUBLIC_WHATSAPP_SUPORTE ?? '').replace(/\D/g, '')

/**
 * O link da conversa, já com a primeira mensagem escrita: quem é a pessoa,
 * em qual evento e setor, e uma linha em aberto pra ela contar o que está
 * acontecendo. Sem CPF no texto — o atendente pede se precisar.
 */
export function linkDoSuporte(dados: { nome?: string | null; evento?: string | null; setor?: string | null }): string | null {
  if (numeroSuporte.length < 12) return null
  const linhas = [
    'Olá! Gostaria de suporte com a minha credencial.',
    dados.nome ? `Nome: ${dados.nome}` : null,
    dados.evento ? `Evento: ${dados.evento}` : null,
    dados.setor ? `Setor: ${dados.setor}` : null,
    '',
    'O que está acontecendo: ',
  ].filter((l): l is string => l !== null)
  return `https://wa.me/${numeroSuporte}?text=${encodeURIComponent(linhas.join('\n'))}`
}
