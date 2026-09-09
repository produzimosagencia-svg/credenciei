'use client'
import { useState, useTransition } from 'react'
import { FileDown, X, AlertTriangle, Loader2 } from 'lucide-react'
import { custoWhatsAppDoEventoParaExportar } from '@/lib/actions-whatsapp'
import { mensagemAmigavel } from '@/lib/erros'
import SeletorLista from '@/components/SeletorLista'

/**
 * "Extrair custo evento" — o PDF de fechamento do gasto de WhatsApp de UM
 * evento, do início ao fim dele (pedido do Juan, 09/09/2026): quanto foi
 * gasto, com quantos disparos, pra quantas pessoas. O PDF pronto é pra
 * anexar como comprovante de custo no Financeiro — não é a mesma coisa que
 * o custo já entrar sozinho lá; o master decide se e quando lança.
 *
 * Vive no layout do WhatsApp, então aparece em toda aba da seção — o mesmo
 * lugar de "Gerenciador da Meta".
 */
export default function ExtrairCustoEventoModal({
  eventos,
}: {
  eventos: { id: string; nome: string }[]
}) {
  const [aberto, setAberto] = useState(false)
  const [eventoId, setEventoId] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, startTransition] = useTransition()

  const gerar = () => {
    if (!eventoId) { setErro('Escolha o evento.'); return }
    setErro(null)
    startTransition(async () => {
      try {
        const dados = await custoWhatsAppDoEventoParaExportar(eventoId)
        if (!dados) { setErro('Não encontrei esse evento.'); return }
        if (!dados.enviados) { setErro('Este evento não tem nenhuma mensagem enviada ainda.'); return }
        const { gerarPdfCustoWhatsApp } = await import('./pdfCustoWhatsApp')
        gerarPdfCustoWhatsApp(dados)
        setAberto(false)
      } catch (e) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <>
      <button onClick={() => setAberto(true)} className="btn btn-secundario">
        <FileDown className="w-3.5 h-3.5 shrink-0" /> Extrair custo evento
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !gerando && setAberto(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="text-slate-800 font-bold flex items-center gap-2">
                <FileDown className="w-4 h-4 text-brand-500" /> Extrair custo do evento
              </h2>
              <button onClick={() => setAberto(false)} disabled={gerando} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-slate-500 text-sm">
              Gera um PDF com tudo que este evento gastou de WhatsApp — quantos disparos, pra
              quantas pessoas e o custo total, por tipo de mensagem. Pronto pra anexar como
              comprovante de custo no Financeiro.
            </p>

            <div>
              <label className="text-sm font-medium text-slate-700 block mb-1.5">Evento</label>
              <SeletorLista
                valor={eventoId}
                onChange={v => { setEventoId(v); setErro(null) }}
                placeholder="Escolha o evento…"
                titulo="Escolha o evento"
                busca
                opcoes={eventos.map(e => ({ valor: e.id, rotulo: e.nome }))}
              />
            </div>

            {erro && (
              <p className="flex items-start gap-1.5 text-red-600 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
              </p>
            )}

            <button onClick={gerar} disabled={gerando} className="btn btn-primario w-full justify-center disabled:opacity-50">
              {gerando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              {gerando ? 'Gerando PDF…' : 'Gerar PDF'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
