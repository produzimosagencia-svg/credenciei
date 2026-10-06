import type { Metadata } from 'next'
import { Clock, QrCode } from 'lucide-react'
import { conversasCompartilhadas } from '@/lib/respostas-compartilhadas'
import { formatarBR } from '@/lib/tz'
import AoVivo from './AoVivo'
import Colunas from './Colunas'
import LinkIndisponivel from './LinkIndisponivel'
import ListaCompartilhada from './ListaCompartilhada'

export const dynamic = 'force-dynamic'

// Tem nome e telefone de gente: buscador nenhum deve guardar estas páginas.
export const metadata: Metadata = {
  title: 'Respostas do disparo',
  robots: { index: false, follow: false },
}

/**
 * A moldura do atendimento compartilhado: cabeçalho, lista de conversas e o
 * espaço da conversa aberta.
 *
 * É aqui que o link é conferido. Link inválido ou vencido não chega a
 * renderizar a página de dentro.
 */
export default async function RespostasLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const dados = await conversasCompartilhadas(token)
  if (!dados.valido) return <LinkIndisponivel motivo={dados.motivo} />

  const aguardando = dados.lista.filter(c => c.aguardando).length

  return (
    <div className="flex h-dvh flex-col bg-[#0a0918] text-white">
      <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-3 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="logo-marca w-9 h-9 shrink-0 rounded-xl flex items-center justify-center"><QrCode className="w-4 h-4 text-white" /></div>
          <div className="min-w-0">
            <h1 className="truncate text-sm font-bold leading-tight text-white sm:text-base">{dados.titulo}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-white/50">
              <Clock className="w-3 h-3 shrink-0" /> Link válido até {formatarBR(dados.expiraEm, 'curto')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-full bg-white/[0.06] px-2.5 py-1 text-2xs font-medium text-white/70 sm:inline">
            <strong className="font-semibold text-white">{dados.lista.length.toLocaleString('pt-BR')}</strong> responderam
          </span>
          <span className="hidden rounded-full bg-white/[0.06] px-2.5 py-1 text-2xs font-medium text-white/70 md:inline">
            <strong className="font-semibold text-white">{dados.totalRecebidas.toLocaleString('pt-BR')}</strong> mensagens
          </span>
          <span className="hidden rounded-full bg-[#ff4a0f]/15 px-2.5 py-1 text-2xs font-medium text-[#ffb08f] sm:inline">
            <strong className="font-semibold text-white">{aguardando.toLocaleString('pt-BR')}</strong> aguardando
          </span>
          <AoVivo />
        </div>
      </header>

      <div className="mx-auto min-h-0 w-full max-w-7xl flex-1 px-0 pb-0 sm:px-6 sm:pb-5">
        <section className="h-full overflow-hidden border-white/10 bg-[#12111f] shadow-2xl shadow-black/40 sm:rounded-2xl sm:border">
          <Colunas lista={<ListaCompartilhada token={token} lista={dados.lista} />}>
            {children}
          </Colunas>
        </section>
      </div>
    </div>
  )
}
