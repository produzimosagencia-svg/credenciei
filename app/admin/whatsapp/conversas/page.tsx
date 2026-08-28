import Link from 'next/link'
import { MessagesSquare, ArrowRight, Clock, Send } from 'lucide-react'
import { conversas } from '@/lib/whatsapp-painel'
import { formatarBR } from '@/lib/tz'
import { Secao, EmptyState, Badge, Aviso } from '@/components/ui/Superficie'

export const revalidate = 0

/** Telefone com DDI para leitura humana: 5527999255959 → (27) 99925-5959. */
function formatarTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, '')
  const semDdi = d.startsWith('55') ? d.slice(2) : d
  if (semDdi.length === 11) return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 7)}-${semDdi.slice(7)}`
  if (semDdi.length === 10) return `(${semDdi.slice(0, 2)}) ${semDdi.slice(2, 6)}-${semDdi.slice(6)}`
  return bruto
}

export default async function ConversasPage() {
  const lista = await conversas()

  return (
    <div className="space-y-5">
      <Secao
        tom="neutro"
        icone={<MessagesSquare className="w-3.5 h-3.5" />}
        titulo="Conversas"
        descricao="Tudo que saiu e tudo que chegou, por número"
        acoes={<Badge tom="neutro">{lista.length}</Badge>}
      >
        {!lista.length ? (
          <EmptyState
            icone={<MessagesSquare className="w-7 h-7" />}
            titulo="Nenhuma conversa ainda"
            descricao="As mensagens aparecem aqui conforme o sistema envia e as pessoas respondem."
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {lista.map(c => (
              <Link
                key={c.telefone}
                href={`/admin/whatsapp/conversas/${c.telefone}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-slate-800 text-sm font-medium">
                      {c.nome || formatarTelefone(c.telefone)}
                    </span>
                    {c.nome && (
                      <span className="text-slate-400 text-xs tabular-nums">{formatarTelefone(c.telefone)}</span>
                    )}
                    {/* A janela de 24h decide se dá para responder com texto
                        livre. Mostrar aqui evita abrir a conversa só pra
                        descobrir que não dá. */}
                    {c.janelaAberta
                      ? <Badge tom="positivo">Pode responder</Badge>
                      : <Badge tom="neutro">Só template</Badge>}
                  </div>
                  <p className="text-slate-500 text-xs mt-0.5 truncate">
                    {c.ultimaDirecao === 'enviada' && (
                      <Send className="w-3 h-3 inline-block mr-1 text-slate-400" />
                    )}
                    {c.ultimoTexto?.replace(/\s+/g, ' ').slice(0, 110) || '(sem texto)'}
                  </p>
                </div>
                <span className="text-slate-400 text-2xs tabular-nums shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {formatarBR(c.ultimaEm, 'curto')}
                </span>
                <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </Secao>

      {!lista.length && (
        <Aviso tom="atencao">
          Se você já enviou mensagens e nada aparece aqui, faltam duas coisas: rodar{' '}
          <code>supabase/upgrade-painel-whatsapp.sql</code> — sem ele o sistema não consegue gravar as
          mensagens que saem — e confirmar que o webhook da Meta está apontando para{' '}
          <code>/api/whatsapp/webhook</code>, que é por onde chegam as respostas.
        </Aviso>
      )}
    </div>
  )
}
