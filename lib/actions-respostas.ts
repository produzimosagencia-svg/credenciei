'use server'
import { revalidatePath } from 'next/cache'
import { formatarNumeroWhatsApp, responderConversa } from './whatsapp'
import { registrarEnviada } from './whatsapp-painel'
import { podePassar } from './limite'
import { lerCompartilhamento, telefoneDoCompartilhamento } from './respostas-compartilhadas'

/**
 * Resposta enviada por quem abriu um link de atendimento compartilhado.
 *
 * Aqui não existe sessão: a autorização é o próprio código do link. Por isso
 * cada chamada confere tudo de novo no servidor, na ordem em que um abuso
 * tentaria passar: o link existe e está no prazo, foi criado com permissão de
 * resposta, e o número de destino é de alguém que recebeu o disparo. A tela
 * esconde a caixa de resposta nos outros casos, mas tela não é barreira.
 */
export async function responderCompartilhado(token: string, telefone: string, texto: string) {
  const leitura = await lerCompartilhamento(token)
  if (!leitura.valido) {
    throw new Error(leitura.motivo === 'expirado' ? 'Este link expirou.' : 'Link inválido.')
  }
  if (leitura.estado.pode_responder !== true) throw new Error('Este link é só para leitura.')

  const corpo = texto.trim()
  if (!corpo) throw new Error('Escreva a mensagem.')
  if (corpo.length > 4000) throw new Error('Mensagem longa demais.')

  const numero = formatarNumeroWhatsApp(telefone)
  if (!numero || !await telefoneDoCompartilhamento(leitura.estado, numero)) {
    throw new Error('Esta conversa não faz parte deste link.')
  }

  // Teto por link: quem atende de verdade não chega perto, e um link vazado
  // não vira um canal de envio em massa pelo número da empresa.
  if (!await podePassar(`respostas:${leitura.chave}`, 30, 60 * 1000)) {
    throw new Error('Muitas respostas em sequência. Espere um minuto.')
  }

  const r = await responderConversa(numero, corpo)
  if (!r.ok) {
    const detalhe = (r.resposta as { error?: { message?: string } } | null)?.error?.message
    throw new Error(detalhe ?? 'A Meta recusou o envio. A janela de 24h pode ter fechado.')
  }

  await registrarEnviada({ telefone: numero, texto: corpo, waMessageId: r.messageId ?? null })
  revalidatePath(`/respostas/${token}`)
  revalidatePath(`/respostas/${token}/${telefone}`)
  return { ok: true as const }
}
