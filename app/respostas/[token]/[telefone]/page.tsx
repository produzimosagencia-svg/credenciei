import Link from 'next/link'
import { ArrowLeft, SearchX } from 'lucide-react'
import { conversaCompartilhada, lerCompartilhamento } from '@/lib/respostas-compartilhadas'
import estilos from '../chat.module.css'
import Chat from './Chat'

export const dynamic = 'force-dynamic'

export default async function ConversaCompartilhadaPage({
  params,
}: {
  params: Promise<{ token: string; telefone: string }>
}) {
  const { token, telefone } = await params
  // A moldura já barrou link inválido ou vencido; aqui é só não seguir adiante.
  const leitura = await lerCompartilhamento(token)
  if (!leitura.valido) return null

  // Número que não recebeu o disparo, ou que não respondeu, cai no mesmo aviso,
  // sem dizer qual dos dois: o endereço não pode servir para sondar contatos.
  const conversa = await conversaCompartilhada(leitura.estado, telefone)
  if (!conversa) {
    return (
      <div className={`flex h-full items-center justify-center px-8 text-center ${estilos.fundo}`}>
        <div className={`max-w-sm ${estilos.surgir}`}>
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.07] text-white/70">
            <SearchX className="h-7 w-7" />
          </span>
          <h2 className="mt-4 text-lg font-bold text-white">Conversa não encontrada</h2>
          <p className="mt-1.5 text-sm text-white/60">Esta conversa não faz parte deste link.</p>
          <Link href={`/respostas/${token}`} className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
            <ArrowLeft className="h-4 w-4" /> Voltar para as conversas
          </Link>
        </div>
      </div>
    )
  }

  return (
    <Chat
      // Trocar de conversa remonta o chat: o rascunho de uma não vaza para a outra.
      key={telefone}
      token={token}
      telefone={telefone}
      nome={conversa.nome}
      podeResponder={leitura.estado.pode_responder === true}
      janelaAberta={conversa.janelaAberta}
      mensagens={conversa.mensagens}
    />
  )
}
