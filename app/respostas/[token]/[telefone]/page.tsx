import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Check, CheckCheck, Clock, Megaphone, XCircle } from 'lucide-react'
import { conversaCompartilhada, conversasCompartilhadas } from '@/lib/respostas-compartilhadas'
import { formatarBR } from '@/lib/tz'
import { Badge } from '@/components/ui/Superficie'
import ConversaRolagem from '@/app/admin/whatsapp/conversas/[telefone]/ConversaRolagem'
import estilos from '@/app/admin/whatsapp/conversas/[telefone]/mensagens.module.css'
import Moldura, { LinkIndisponivel } from '../Moldura'
import { formatarTelefone, iniciais, rotuloSemTexto } from '../formato'
import Midia from './Midia'
import ResponderCompartilhado from './ResponderCompartilhado'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Respostas do disparo',
  robots: { index: false, follow: false },
}

const ROTULO_STATUS: Record<string, { texto: string; icone: React.ElementType; cor: string }> = {
  sent: { texto: 'enviada', icone: Check, cor: 'text-slate-400' },
  delivered: { texto: 'entregue', icone: CheckCheck, cor: 'text-slate-400' },
  read: { texto: 'lida', icone: CheckCheck, cor: 'text-blue-500' },
  failed: { texto: 'falhou', icone: XCircle, cor: 'text-erro-600' },
}

export default async function ConversaCompartilhadaPage({
  params,
}: {
  params: Promise<{ token: string; telefone: string }>
}) {
  const { token, telefone } = await params
  const dados = await conversasCompartilhadas(token)
  if (!dados.valido) return <LinkIndisponivel motivo={dados.motivo} />

  // Número que não recebeu o disparo cai aqui como link inválido, sem dizer se
  // a conversa existe: o endereço não pode servir para sondar outros contatos.
  const mensagens = await conversaCompartilhada(dados.estado, telefone)
  const info = dados.lista.find(c => c.telefone === telefone)
  if (!mensagens || !info) return <LinkIndisponivel motivo="invalido" />

  const nome = info.nome || formatarTelefone(telefone)

  return (
    <Moldura token={token} titulo={dados.titulo} expiraEm={dados.expiraEm} lista={dados.lista} totalRecebidas={dados.totalRecebidas} selecionado={telefone}>
      <main className="flex h-full min-w-0 flex-col bg-[#f4f1eb]">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <Link href={`/respostas/${token}`} aria-label="Voltar para as conversas" className="text-slate-500 hover:text-slate-800 lg:hidden">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <span className="flex w-9 h-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
            {iniciais(nome)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-semibold text-slate-800">{nome}</h2>
            <p className="truncate text-2xs text-slate-500 tabular-nums">{formatarTelefone(telefone)}</p>
          </div>
          {!dados.podeResponder
            ? <Badge tom="neutro">Somente leitura</Badge>
            : info.janelaAberta ? <Badge tom="positivo">Pode responder</Badge> : <Badge tom="neutro">Janela fechada</Badge>}
        </header>

        <ConversaRolagem ultimaMensagemId={mensagens.at(-1)?.id}>
          {/* O disparo não fica gravado como mensagem da conversa. Sem este
              lembrete, a primeira fala da pessoa aparece solta, respondendo a
              algo que quem atende não vê. */}
          <p className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-white px-3 py-1 text-2xs text-slate-500 shadow-sm">
            <Megaphone className="w-3 h-3 shrink-0" /> Recebeu o disparo e respondeu
          </p>
          {mensagens.map(m => {
            const st = m.status ? ROTULO_STATUS[m.status] : null
            const Icone = st?.icone
            const enviada = m.direcao === 'enviada'
            return (
              <div key={m.id} className={`flex ${enviada ? `justify-end ${estilos.enviada}` : `justify-start ${estilos.recebida}`}`}>
                <div className={`max-w-[82%] rounded-xl px-3 py-2 shadow-sm ${enviada ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
                  {m.midia && <Midia token={token} id={m.id} classe={m.midia.classe} nome={m.midia.nome} />}
                  {m.texto ? (
                    <p className={`whitespace-pre-wrap break-words text-sm text-slate-700 ${m.midia ? 'mt-2' : ''}`}>{m.texto}</p>
                  ) : !m.midia && (
                    <p className="text-sm italic text-slate-500">
                      {m.tipo === 'reaction'
                        ? (m.reacao ? `Reagiu com ${m.reacao}` : 'Retirou a reação')
                        : m.tipo === 'unsupported'
                          ? 'Mensagem em um formato que o WhatsApp não repassa para empresas'
                          : rotuloSemTexto(m.tipo)}
                    </p>
                  )}
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

        {dados.podeResponder && (
          <footer className="border-t border-slate-200 bg-slate-50 p-3">
            {info.janelaAberta ? (
              <ResponderCompartilhado token={token} telefone={telefone} />
            ) : (
              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
                <Clock className="mt-px w-3.5 h-3.5 shrink-0" />
                <span><strong>Janela de 24 horas fechada.</strong> O WhatsApp só permite resposta livre até 24 horas depois da última mensagem da pessoa.</span>
              </div>
            )}
          </footer>
        )}
      </main>
    </Moldura>
  )
}
