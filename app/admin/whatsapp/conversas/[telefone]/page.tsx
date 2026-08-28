import Link from 'next/link'
import { ArrowLeft, Check, CheckCheck, XCircle, Clock } from 'lucide-react'
import { conversaDe, conversas } from '@/lib/whatsapp-painel'
import { supabaseAdmin } from '@/lib/supabase-server'
import { formatarBR } from '@/lib/tz'
import { Secao, Badge, Aviso } from '@/components/ui/Superficie'
import Responder from './Responder'

export const revalidate = 0

const ROTULO_STATUS: Record<string, { texto: string; icone: React.ElementType; cor: string }> = {
  sent: { texto: 'enviada', icone: Check, cor: 'text-slate-400' },
  delivered: { texto: 'entregue', icone: CheckCheck, cor: 'text-slate-400' },
  read: { texto: 'lida', icone: CheckCheck, cor: 'text-blue-500' },
  failed: { texto: 'falhou', icone: XCircle, cor: 'text-erro-600' },
}

export default async function ConversaPage({ params }: { params: Promise<{ telefone: string }> }) {
  const { telefone } = await params
  const [mensagens, lista] = await Promise.all([conversaDe(telefone), conversas()])
  const info = lista.find(c => c.telefone === telefone)

  // Quem é esse número? A conversa fica bem mais útil sabendo de qual setor e
  // evento a pessoa é — é o contexto que decide como responder.
  const { data: func } = await supabaseAdmin
    .from('funcionarios')
    .select('nome, cargo, fornecedores(nome, eventos(nome))')
    .eq('telefone', telefone.replace(/^55/, ''))
    .maybeSingle()
  const setor = func?.fornecedores as unknown as { nome: string; eventos: { nome: string } } | null

  return (
    <div className="space-y-4">
      <Link href="/admin/whatsapp/conversas" className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 text-sm">
        <ArrowLeft className="w-4 h-4" /> Todas as conversas
      </Link>

      <Secao
        tom="neutro"
        titulo={func?.nome ?? info?.nome ?? telefone}
        descricao={
          setor
            ? `${setor.nome} · ${setor.eventos?.nome ?? ''}${func?.cargo ? ` · ${func.cargo}` : ''}`
            : `Número ${telefone}`
        }
        acoes={info?.janelaAberta
          ? <Badge tom="positivo">Janela aberta</Badge>
          : <Badge tom="neutro">Janela fechada</Badge>}
        corpoClassName="p-4"
      >
        {!mensagens.length ? (
          <p className="text-slate-500 text-sm py-6 text-center">Nenhuma mensagem neste número.</p>
        ) : (
          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto">
            {mensagens.map(m => {
              const st = m.status ? ROTULO_STATUS[m.status] : null
              const Icone = st?.icone
              const enviada = m.direcao === 'enviada'
              return (
                <div key={m.id} className={`flex ${enviada ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 ${
                      enviada
                        ? 'bg-brand-50 border border-brand-200'
                        : 'bg-white border border-slate-200'
                    }`}
                  >
                    <p className="text-slate-700 text-sm whitespace-pre-wrap break-words">
                      {m.texto ?? <span className="text-slate-400 italic">(sem texto — mídia ou template)</span>}
                    </p>
                    <p className="flex items-center gap-1 justify-end mt-1 text-slate-400 text-2xs tabular-nums">
                      {formatarBR(m.em, 'curto')}
                      {Icone && <Icone className={`w-3 h-3 ${st!.cor}`} />}
                      {st && <span className={st.cor}>{st.texto}</span>}
                    </p>
                    {m.erro && <p className="text-erro-600 text-2xs mt-1">{m.erro}</p>}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Secao>

      {info?.janelaAberta ? (
        <Responder telefone={telefone} />
      ) : (
        <Aviso tom="atencao" icone={<Clock className="w-3.5 h-3.5" />}>
          <strong>Janela de 24 horas fechada.</strong> A Meta só permite texto livre até 24h depois da
          última mensagem que a pessoa mandou. Depois disso, só template aprovado — o mesmo motivo
          pelo qual os avisos do sistema são todos templates.
        </Aviso>
      )}
    </div>
  )
}
