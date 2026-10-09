import { notFound } from 'next/navigation'
import { Building2, Link2Off, CalendarX } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase-server'
import { diaBRT } from '@/lib/janelas'
import { situacaoDoLink } from '@/lib/pedido-setor-regras'
import { contextoDoPedido } from '@/lib/pedidos-setor-consulta'
import { formatarBR } from '@/lib/tz'
import FormularioPedidoSetor from './FormularioPedidoSetor'
import { travasDeCadastroDoEvento } from '@/lib/internos-servidor'

export const revalidate = 0

/**
 * O pedido de setor — página PÚBLICA, sem login. O fornecedor chega pelo link que o organizador mandou no
 * grupo, diz o que precisa e acompanha a resposta pela página que abre depois do envio.
 *
 * Fechada (link desligado ou prazo vencido) a página continua abrindo, só que explica — o link circula em
 * grupo de WhatsApp e não dá para recolhê-lo, então a resposta tem que ser clara.
 */
export default async function PedidoSetorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const { data: evento, error } = await supabaseAdmin
    .from('eventos').select('id, nome, local, data_inicio, pedido_setor_ativo, pedido_setor_prazo')
    .eq('pedido_setor_token', token).maybeSingle()
  if (error || !evento) notFound()

  const situacao = situacaoDoLink({ ativo: evento.pedido_setor_ativo === true, prazo: evento.pedido_setor_prazo as string | null })
  const { ctx, diasComFase, subeventos: todosSubeventos } = await contextoDoPedido(evento.id as string)
  /*
   * Trava de cadastro (09/10/2026): evento travado fecha o pedido; subgrupo travado some da lista de escolha. Se
   * TODOS os subgrupos estão travados, não há onde pedir — fecha também.
   */
  const travas = await travasDeCadastroDoEvento(evento.id as string)
  const subeventos = todosSubeventos.filter(s => !travas.subgrupos.has(s.id))
  const cadastroTravado = travas.evento || (todosSubeventos.length > 0 && subeventos.length === 0)
  const hoje = diaBRT()
  const diasUi = diasComFase.filter(d => d.data >= hoje)
  // Evento com vários dias, mas todos já passaram: não há o que pedir.
  const periodoEncerrado = diasComFase.length > 0 && diasUi.length === 0

  if (!situacao.aberto || periodoEncerrado || cadastroTravado) {
    const prazo = !situacao.aberto && situacao.motivo === 'prazo'
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-amber-500/15 text-amber-500">
            {prazo || periodoEncerrado ? <CalendarX className="w-7 h-7" /> : <Link2Off className="w-7 h-7" />}
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Pedidos encerrados</h1>
          <p className="text-slate-600 text-sm font-medium mt-1">{evento.nome as string}</p>
          <p className="text-slate-500 text-sm mt-4">
            {prazo
              ? <>O prazo para enviar pedidos de setor terminou{evento.pedido_setor_prazo ? <> em <strong className="text-slate-700">{formatarBR(evento.pedido_setor_prazo as string, 'completo')}</strong></> : null}.</>
              : periodoEncerrado
                ? <>O período de trabalho deste evento já terminou.</>
                : <>A organização não está recebendo novos pedidos de setor neste momento.</>}
            {' '}Se você já enviou um pedido, acompanhe pelo link que apareceu logo depois do envio. Em caso de dúvida, fale com a organização do evento.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex justify-center p-4 py-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="logo-marca inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-lg">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Pedido de setor</h1>
          <p className="text-slate-600 text-sm font-semibold mt-1">{evento.nome as string}</p>
          {evento.local && <p className="text-slate-500 text-xs mt-0.5">{evento.local as string}</p>}
          <p className="text-slate-500 text-sm mt-4 leading-relaxed">
            Diga qual serviço você vai prestar no evento (segurança, limpeza, buffet…), quantas pessoas precisa e quem será o supervisor. O administrador do
            evento analisa o pedido e, se aprovado, o supervisor recebe o acesso no WhatsApp.
          </p>
          {!!situacao.aberto && evento.pedido_setor_prazo && (
            <p className="text-amber-700 text-xs mt-2">Pedidos até {formatarBR(evento.pedido_setor_prazo as string, 'completo')}.</p>
          )}
        </div>
        <FormularioPedidoSetor token={token} ctx={ctx} dias={diasUi} subeventos={subeventos} />
      </div>
    </div>
  )
}
