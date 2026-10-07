import { MessageCircle } from 'lucide-react'
import { linkDoSuporte } from '@/lib/whatsapp-suporte'

/**
 * "Suporte" — conversa com uma pessoa, no WhatsApp, já com quem é e a função na
 * mensagem. Fica no topo das telas de administrador, supervisor e Encarregado.
 *
 * Pequeno e com contorno verde, de propósito: tem que ser fácil de achar quando
 * dá problema, mas não pode virar o primeiro clique de todo mundo — o suporte
 * é humano. No celular só o ícone aparece; o texto vem de `sm` pra cima.
 * Sem número configurado (`linkDoSuporte` devolve null) o botão não existe.
 */
export default function BotaoSuporteWpp({ nome, funcao, organizacao, evento, setor }: {
  nome: string
  funcao: string
  organizacao?: string | null
  evento?: string | null
  setor?: string | null
}) {
  const href = linkDoSuporte({ nome, funcao, organizacao, evento, setor }, 'acesso')
  if (!href) return null
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      aria-label="Falar com o suporte no WhatsApp" title="Falar com o suporte no WhatsApp"
      className="btn-press inline-flex items-center gap-1.5 rounded-full border border-green-600 text-green-700 hover:bg-green-50 text-xs font-semibold px-2.5 sm:px-3 py-1.5 shrink-0"
    >
      <MessageCircle className="w-3.5 h-3.5" />
      <span className="hidden sm:inline">Suporte</span>
    </a>
  )
}
