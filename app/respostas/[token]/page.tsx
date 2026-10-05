import type { Metadata } from 'next'
import { MessageCircleMore } from 'lucide-react'
import { conversasCompartilhadas } from '@/lib/respostas-compartilhadas'
import Moldura, { LinkIndisponivel } from './Moldura'

export const dynamic = 'force-dynamic'

// Tem nome e telefone de gente: buscador nenhum deve guardar esta página.
export const metadata: Metadata = {
  title: 'Respostas do disparo',
  robots: { index: false, follow: false },
}

export default async function RespostasCompartilhadasPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const dados = await conversasCompartilhadas(token)
  if (!dados.valido) return <LinkIndisponivel motivo={dados.motivo} />

  return (
    <Moldura token={token} titulo={dados.titulo} expiraEm={dados.expiraEm} lista={dados.lista} totalRecebidas={dados.totalRecebidas}>
      <div className="flex h-full items-center justify-center bg-slate-50/70 px-8 text-center">
        <div className="max-w-sm">
          <span className="mx-auto flex w-16 h-16 items-center justify-center rounded-full bg-green-50 text-green-600">
            <MessageCircleMore className="w-8 h-8" />
          </span>
          <h2 className="mt-4 font-semibold text-slate-800">Selecione uma conversa</h2>
          <p className="mt-1 text-sm text-slate-500">
            As conversas estão ordenadas pela mensagem mais recente. O ponto verde marca quem ainda espera resposta.
          </p>
        </div>
      </div>
    </Moldura>
  )
}
