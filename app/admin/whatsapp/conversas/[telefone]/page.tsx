import Link from 'next/link'
import { ArrowLeft, Check, CheckCheck, XCircle, Clock, MoreVertical } from 'lucide-react'
import { conversaDe, conversas, perfilDaConversa } from '@/lib/whatsapp-painel'
import { formatarBR } from '@/lib/tz'
import { Badge } from '@/components/ui/Superficie'
import AbasCaixa from '../AbasCaixa'
import ListaConversas from '../ListaConversas'
import Responder from './Responder'
import PerfilContato from './PerfilContato'
import AtualizacaoAoVivo from '../AtualizacaoAoVivo'
import ConversaRolagem from './ConversaRolagem'
import estilos from './mensagens.module.css'

export const revalidate = 0

const ROTULO_STATUS: Record<string, { texto: string; icone: React.ElementType; cor: string }> = {
  sent: { texto: 'enviada', icone: Check, cor: 'text-slate-400' },
  delivered: { texto: 'entregue', icone: CheckCheck, cor: 'text-slate-400' },
  read: { texto: 'lida', icone: CheckCheck, cor: 'text-blue-500' },
  failed: { texto: 'falhou', icone: XCircle, cor: 'text-erro-600' },
}

export default async function ConversaPage({ params }: { params: Promise<{ telefone: string }> }) {
  const { telefone } = await params
  const [mensagens, lista, perfil] = await Promise.all([conversaDe(telefone), conversas(), perfilDaConversa(telefone)])
  const info = lista.find(c => c.telefone === telefone)
  const nome = perfil.nome ?? info?.nome ?? telefone

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <AbasCaixa ativa="conversas" />
        <div className="flex items-center gap-3">
          <AtualizacaoAoVivo
            telefone={telefone}
            ultimaRecebidaEm={[...mensagens].reverse().find(m => m.direcao === 'recebida')?.em}
          />
          <Link href="/admin/whatsapp/conversas" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 lg:hidden">
            <ArrowLeft className="w-4 h-4" /> Conversas
          </Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="grid xl:grid-cols-[300px_minmax(420px,1fr)_320px]">
          <div className="hidden xl:block"><ListaConversas lista={lista} selecionado={telefone} /></div>

          <main className="flex min-h-[650px] min-w-0 flex-col bg-[#f4f1eb]">
            <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <Link href="/admin/whatsapp/conversas" aria-label="Voltar" className="text-slate-500 hover:text-slate-800 xl:hidden">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <span className="flex w-9 h-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                {nome.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <h1 className="truncate text-sm font-semibold text-slate-800">{nome}</h1>
                <p className="truncate text-2xs text-slate-500">
                  {perfil.cadastrado ? [perfil.cargo, perfil.empresa].filter(Boolean).join(' · ') || telefone : telefone}
                </p>
              </div>
              {info?.janelaAberta ? <Badge tom="positivo">Pode responder</Badge> : <Badge tom="neutro">Só template</Badge>}
              <MoreVertical className="w-4 h-4 text-slate-400" />
            </header>

            <ConversaRolagem ultimaMensagemId={mensagens.at(-1)?.id}>
              {!mensagens.length ? (
                <p className="py-10 text-center text-sm text-slate-500">Nenhuma mensagem neste número.</p>
              ) : mensagens.map(m => {
                const st = m.status ? ROTULO_STATUS[m.status] : null
                const Icone = st?.icone
                const enviada = m.direcao === 'enviada'
                return (
                  <div key={m.id} className={`flex ${enviada ? `justify-end ${estilos.enviada}` : `justify-start ${estilos.recebida}`}`}>
                    <div className={`max-w-[82%] rounded-xl px-3 py-2 shadow-sm ${enviada ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
                      <p className="whitespace-pre-wrap break-words text-sm text-slate-700">
                        {m.texto ?? <span className="italic text-slate-400">(sem texto — mídia ou template)</span>}
                      </p>
                      <p className="mt-1 flex items-center justify-end gap-1 text-2xs tabular-nums text-slate-400">
                        {formatarBR(m.em, 'curto')}
                        {Icone && (
                          <span title={st!.texto} aria-label={st!.texto} className="inline-flex">
                            <Icone className={`w-3 h-3 ${st!.cor}`} />
                          </span>
                        )}
                      </p>
                      {m.erro && <p className="mt-1 text-2xs text-erro-600">{m.erro}</p>}
                    </div>
                  </div>
                )
              })}
            </ConversaRolagem>

            <footer className="border-t border-slate-200 bg-slate-50 p-3">
              {info?.janelaAberta ? (
                <Responder telefone={telefone} />
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                  <Clock className="mt-px w-3.5 h-3.5 shrink-0" />
                  <span><strong>Janela de 24 horas fechada.</strong> Para falar agora, use um template aprovado.</span>
                </div>
              )}
            </footer>
          </main>

          <div className="hidden xl:block"><PerfilContato perfil={perfil} nomeWhatsApp={info?.nome} /></div>
        </div>
        <div className="border-t border-slate-200 xl:hidden"><PerfilContato perfil={perfil} nomeWhatsApp={info?.nome} /></div>
      </section>
    </div>
  )
}
