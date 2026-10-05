import { Clock, QrCode } from 'lucide-react'
import type { ConversaCompartilhada } from '@/lib/respostas-compartilhadas'
import { formatarBR } from '@/lib/tz'
import AoVivo from './AoVivo'
import ListaCompartilhada from './ListaCompartilhada'

export function LinkIndisponivel({ motivo }: { motivo: 'invalido' | 'expirado' }) {
  return (
    <main className="min-h-screen bg-[#0a0918] flex items-center justify-center p-6">
      <div className="w-full max-w-sm text-center">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <div className="logo-marca w-9 h-9 rounded-lg flex items-center justify-center"><QrCode className="w-4 h-4 text-white" /></div>
          <span className="font-bold text-white text-lg">Credenciei</span>
        </div>
        <h1 className="text-white text-2xl font-bold">
          {motivo === 'expirado' ? 'Este link expirou' : 'Link inválido'}
        </h1>
        <p className="text-slate-400 text-sm mt-2">
          {motivo === 'expirado'
            ? 'O prazo de acesso a estas conversas terminou. Peça um link novo a quem enviou este.'
            : 'Confira se o endereço foi copiado inteiro ou peça um link novo a quem enviou este.'}
        </p>
      </div>
    </main>
  )
}

/**
 * A casca das duas telas do link: cabeçalho, coluna de conversas e o painel da
 * direita. Repete a grade da aba Conversas para quem atende não precisar
 * aprender outra tela.
 *
 * No celular cabe uma coluna só: a lista aparece quando nenhuma conversa está
 * aberta, e some para dar lugar ao chat.
 */
export default function Moldura({ token, titulo, expiraEm, lista, totalRecebidas, selecionado, children }: {
  token: string
  titulo: string
  expiraEm: string
  lista: ConversaCompartilhada[]
  totalRecebidas: number
  selecionado?: string
  children: React.ReactNode
}) {
  const aguardando = lista.filter(c => c.aguardando).length

  return (
    <div className="min-h-screen bg-[#0a0918] text-slate-800">
      <div className="mx-auto w-full max-w-6xl px-3 sm:px-6 py-5 space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="logo-marca w-9 h-9 shrink-0 rounded-lg flex items-center justify-center"><QrCode className="w-4 h-4 text-white" /></div>
            <div className="min-w-0">
              <h1 className="truncate text-white font-bold leading-tight">{titulo}</h1>
              <p className="text-slate-500 text-xs">
                {lista.length.toLocaleString('pt-BR')} {lista.length === 1 ? 'pessoa respondeu' : 'pessoas responderam'}
                {' · '}{totalRecebidas.toLocaleString('pt-BR')} {totalRecebidas === 1 ? 'mensagem' : 'mensagens'}
                {' · '}{aguardando.toLocaleString('pt-BR')} aguardando resposta
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 text-slate-500 text-2xs">
              <Clock className="w-3.5 h-3.5 shrink-0" /> Link válido até {formatarBR(expiraEm, 'curto')}
            </span>
            <AoVivo />
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid h-[calc(100dvh-7.5rem)] min-h-[480px] lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className={`min-h-0 ${selecionado ? 'hidden lg:block' : ''}`}>
              <ListaCompartilhada token={token} lista={lista} selecionado={selecionado} />
            </div>
            <div className={`min-h-0 min-w-0 ${selecionado ? '' : 'hidden lg:block'}`}>{children}</div>
          </div>
        </section>
      </div>
    </div>
  )
}
