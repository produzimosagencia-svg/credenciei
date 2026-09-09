'use client'
import { useState } from 'react'
import { FileDown, X, AlertTriangle, Loader2 } from 'lucide-react'
import SeletorLista from '@/components/SeletorLista'

/**
 * "Extrair custo evento" — o comprovante do gasto de WhatsApp de UM evento:
 * quantas mensagens saíram, quanto custou e quantas pessoas tinha na equipe.
 * Um PDF de uma página, pra anexar como despesa no Financeiro.
 *
 * ─── O CLIENTE NÃO MONTA MAIS O PDF ──────────────────────────────────────────
 *
 * Antes isto chamava uma Server Action, recebia os números e montava o PDF
 * aqui no navegador com um `import()` dinâmico do jsPDF. Falhava em produção
 * com a mensagem mascarada do Next ("An error occurred in the Server
 * Components render…"), que não diz nada e não deixa rastro na tela.
 *
 * Agora é um GET comum numa rota (`/api/whatsapp/custo-evento`) que devolve o
 * PDF pronto. Menos peça no caminho, e — o que importa mais — quando dá erro,
 * o servidor responde com um status e um texto de verdade, que aparece aqui
 * embaixo em vez de virar um parágrafo genérico em inglês.
 */
export default function ExtrairCustoEventoModal({
  eventos,
}: {
  eventos: { id: string; nome: string }[]
}) {
  const [aberto, setAberto] = useState(false)
  const [eventoId, setEventoId] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [gerando, setGerando] = useState(false)

  const gerar = async () => {
    if (!eventoId) { setErro('Escolha o evento.'); return }
    setErro(null)
    setGerando(true)
    try {
      const resposta = await fetch(`/api/whatsapp/custo-evento?evento=${encodeURIComponent(eventoId)}`)
      if (!resposta.ok) {
        // A rota responde erro em texto puro, escrito pra ser lido.
        setErro(await resposta.text() || `O servidor respondeu ${resposta.status}.`)
        return
      }

      const arquivo = await resposta.blob()
      const nome = /filename="([^"]+)"/.exec(resposta.headers.get('Content-Disposition') ?? '')?.[1]
        ?? 'custo-whatsapp.pdf'
      const url = URL.createObjectURL(arquivo)
      const link = document.createElement('a')
      link.href = url
      link.download = nome
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Revoga depois do clique: revogar na mesma linha cancela o download em
      // parte dos navegadores.
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
      setAberto(false)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui falar com o servidor. Verifique a conexão e tente de novo.')
    } finally {
      setGerando(false)
    }
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
              Um PDF de uma página com quantas mensagens este evento enviou, quanto custou e
              quantas pessoas tinha na equipe. Conta só este evento — cada evento começa do
              zero.
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
