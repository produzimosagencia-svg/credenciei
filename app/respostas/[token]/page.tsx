import { MessageCircleMore } from 'lucide-react'
import estilos from './chat.module.css'

/** Nenhuma conversa aberta: só existe no computador, onde as duas colunas cabem. */
export default function RespostasCompartilhadasPage() {
  return (
    <div className={`flex h-full items-center justify-center px-8 text-center ${estilos.fundo}`}>
      <div className={`max-w-sm ${estilos.surgir}`}>
        <span className="mx-auto flex w-16 h-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[#ff7a45] to-[#e33c06] text-white shadow-lg shadow-[#ff4a0f]/25">
          <MessageCircleMore className="w-8 h-8" />
        </span>
        <h2 className="mt-5 text-lg font-bold text-white">Selecione uma conversa</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-white/60">
          As conversas estão ordenadas pela mensagem mais recente. O ponto verde marca quem ainda espera resposta.
        </p>
      </div>
    </div>
  )
}
