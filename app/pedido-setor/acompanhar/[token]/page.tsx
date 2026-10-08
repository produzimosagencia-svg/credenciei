import { notFound } from 'next/navigation'
import { Check, Clock, X, Building2 } from 'lucide-react'
import { pedidoPublicoPorToken } from '@/lib/pedidos-setor-consulta'
import { descreverDias, statusDoPedido } from '@/lib/pedido-setor-regras'
import { formatarBR } from '@/lib/tz'

export const revalidate = 0

const TITULO = {
  pendente: { texto: 'Aguardando análise', explicacao: 'O administrador do evento ainda vai analisar o seu pedido. Guarde este endereço: é por aqui que você acompanha a resposta.' },
  aprovado: { texto: 'Pedido aprovado', explicacao: 'O supervisor recebe o acesso no WhatsApp cadastrado. Se a mensagem não chegar, fale com a organização do evento.' },
  negado: { texto: 'Pedido não aprovado', explicacao: 'Veja o motivo abaixo. Em caso de dúvida, fale com a organização do evento.' },
  parcial: { texto: 'Pedido analisado', explicacao: 'Alguns setores foram aprovados e outros não. Veja abaixo.' },
} as const

/**
 * Página PÚBLICA de acompanhamento do pedido — o endereço (um código que ninguém adivinha) aparece logo depois
 * do envio. É o que evita a ligação "meu setor já foi cadastrado?": a resposta está aqui. Não mostra CPF nem
 * telefone de ninguém.
 */
export default async function AcompanharPedidoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const pedido = await pedidoPublicoPorToken(token)
  if (!pedido) notFound()

  const status = statusDoPedido(pedido.itens)
  const decididos = pedido.itens.filter(i => i.status !== 'pendente').length
  const titulo = TITULO[status]

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex justify-center p-4 py-8">
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center mb-2">
          <div className="logo-marca inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 shadow-lg">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">{titulo.texto}</h1>
          <p className="text-slate-600 text-sm font-semibold mt-1">{pedido.eventoNome}</p>
          <p className="text-slate-500 text-xs mt-0.5">Enviado em {formatarBR(pedido.criadoEm, 'completo')} por {pedido.contatoNome}</p>
          <p className="text-slate-500 text-sm mt-3 leading-relaxed">{titulo.explicacao}</p>
          {status === 'pendente' && pedido.itens.length > 1 && decididos > 0 && (
            <p className="text-slate-600 text-xs font-semibold mt-1">{decididos} de {pedido.itens.length} setores já analisados.</p>
          )}
        </div>

        {pedido.itens.map((i, n) => (
          <section key={n} className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-slate-800 font-bold text-base break-words">{i.nome}</h2>
                {i.subeventoNome && <p className="text-slate-500 text-xs mt-0.5">{i.subeventoNome}</p>}
              </div>
              <Selo status={i.status} />
            </div>
            <p className="text-slate-600 text-sm mt-2">
              {i.quantidade ?? '?'} colaboradores
              {descreverDias(i.porDia) && <span className="block text-slate-500 text-xs mt-0.5">{descreverDias(i.porDia)}</span>}
            </p>
            {i.status === 'negado' && i.motivoNegacao && (
              <p className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm px-3 py-2">
                <strong>Motivo:</strong> {i.motivoNegacao}
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

function Selo({ status }: { status: 'pendente' | 'aprovado' | 'negado' }) {
  const estilo = status === 'aprovado'
    ? 'bg-green-100 text-green-800'
    : status === 'negado' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
  const Icone = status === 'aprovado' ? Check : status === 'negado' ? X : Clock
  const texto = status === 'aprovado' ? 'Aprovado' : status === 'negado' ? 'Não aprovado' : 'Aguardando'
  return (
    <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${estilo}`}>
      <Icone className="w-3.5 h-3.5" /> {texto}
    </span>
  )
}
