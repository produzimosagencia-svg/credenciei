import { MessageCircleMore } from 'lucide-react'
import { conversas, disparosDoCanal, templatesAprovados } from '@/lib/whatsapp-painel'
import AbasCaixa from './AbasCaixa'
import ListaConversas from './ListaConversas'
import PainelDisparos from './PainelDisparos'
import AtualizacaoAoVivo from './AtualizacaoAoVivo'

export const revalidate = 0

export default async function ConversasPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const { aba } = await searchParams
  const disparosAtivos = aba === 'disparos'
  const [lista, templates] = await Promise.all([
    conversas(),
    disparosAtivos ? templatesAprovados() : Promise.resolve([]),
  ])
  const disparos = disparosAtivos ? await disparosDoCanal(templates) : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <AbasCaixa ativa={disparosAtivos ? 'disparos' : 'conversas'} />
        {!disparosAtivos && <AtualizacaoAoVivo />}
      </div>

      {disparosAtivos ? (
        <PainelDisparos disparos={disparos} />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid lg:grid-cols-[360px_minmax(0,1fr)]">
            <ListaConversas lista={lista} />
            <div className="hidden min-h-[650px] items-center justify-center bg-slate-50/70 px-8 text-center lg:flex">
              <div className="max-w-sm">
                <span className="mx-auto flex w-16 h-16 items-center justify-center rounded-full bg-green-50 text-green-600">
                  <MessageCircleMore className="w-8 h-8" />
                </span>
                <h2 className="mt-4 font-semibold text-slate-800">Selecione uma conversa</h2>
                <p className="mt-1 text-sm text-slate-500">As conversas já estão ordenadas pela mensagem mais recente. As novas aparecem com a quantidade não lida.</p>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
