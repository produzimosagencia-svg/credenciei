'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, X, ArrowUp, AlertTriangle, Loader2, Trash2, History, SquarePen, ArrowLeft,
} from 'lucide-react'
import {
  apagarConversa, carregarConversas, novaConversa, quandoRelativo, salvarConversa, tituloDe,
  type Confirmacao, type Conversa, type Mensagem,
} from './historico'

const SUGESTOES = [
  'Quem ainda não bateu o ponto?',
  'Como cadastro um funcionário?',
  'Quais eventos estão ativos?',
  'Como funcionam as janelas de horário?',
]

// ─── Abertura pela sidebar ───────────────────────────────────────────────────

type AssistenteCtx = { abrir: () => void; aberto: boolean }
const Ctx = createContext<AssistenteCtx | null>(null)

/** Usado pelo item "Credenciei IA" do menu lateral. */
export function useAssistente() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAssistente precisa estar dentro de <AssistenteIAProvider>')
  return c
}

export function AssistenteIAProvider({ usuarioId, children }: { usuarioId: string; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false)
  return (
    <Ctx.Provider value={{ abrir: () => setAberto(true), aberto }}>
      {children}
      {aberto && <ModalAssistente usuarioId={usuarioId} onFechar={() => setAberto(false)} />}
    </Ctx.Provider>
  )
}

// ─── Apresentação ────────────────────────────────────────────────────────────

/** Converte [texto](/caminho) em link e **negrito** em <strong>, só isso. */
function Formatado({ texto }: { texto: string }) {
  const partes = texto.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g)
  return (
    <>
      {partes.map((parte, i) => {
        const link = parte.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (link) {
          return <Link key={i} href={link[2]} className="text-brand-500 hover:underline font-medium">{link[1]}</Link>
        }
        const negrito = parte.match(/^\*\*([^*]+)\*\*$/)
        if (negrito) return <strong key={i} className="text-slate-800 font-semibold">{negrito[1]}</strong>
        return <span key={i}>{parte}</span>
      })}
    </>
  )
}

export function CartaoConfirmacao({ c, onConfirmar, ocupado }: {
  c: Confirmacao
  onConfirmar: (operacao: string) => void
  ocupado: boolean
}) {
  const [feito, setFeito] = useState(false)
  return (
    <div className="mt-2.5 rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
      <p className="flex items-start gap-1.5 text-red-700 text-xs font-bold">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {c.resumo}
      </p>
      <ul className="text-red-600 text-[11px] space-y-0.5 pl-5">
        {Object.entries(c.impacto).map(([chave, valor]) => (
          <li key={chave} className="list-disc">{chave.replace(/_/g, ' ')}: <strong>{String(valor)}</strong></li>
        ))}
      </ul>
      <p className="text-red-500 text-[11px]">Não tem como desfazer.</p>
      {feito ? (
        <p className="text-red-700 text-xs font-semibold">Confirmado — executando.</p>
      ) : (
        <button
          onClick={() => { setFeito(true); onConfirmar(c.operacao) }}
          disabled={ocupado}
          className="btn-press w-full flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white text-xs font-bold py-2 rounded-lg"
        >
          <Trash2 className="w-3.5 h-3.5" /> Confirmar exclusão
        </button>
      )}
    </div>
  )
}

/**
 * Modal central do Credenciei IA.
 *
 * A confirmação de exclusão só aparece quando o SERVIDOR manda um evento
 * 'confirmar'; clicar reenvia a conversa com o id liberado. Nada que o modelo
 * escreva no texto faz um botão desses surgir.
 */
function ModalAssistente({ usuarioId, onFechar }: { usuarioId: string; onFechar: () => void }) {
  const [conversa, setConversa] = useState<Conversa>(() => novaConversa())
  const [conversas, setConversas] = useState<Conversa[]>([])
  const [verHistorico, setVerHistorico] = useState(false)
  const [entrada, setEntrada] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const confirmadas = useRef<string[]>([])
  const fimDaLista = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  const mensagens = conversa.mensagens

  useEffect(() => { setConversas(carregarConversas(usuarioId)) }, [usuarioId])
  useEffect(() => { fimDaLista.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensagens])

  // Fecha no Esc — comportamento esperado de modal.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFechar])

  const trocarMensagens = (fn: (m: Mensagem[]) => Mensagem[]) =>
    setConversa(c => ({ ...c, mensagens: fn(c.mensagens) }))

  const enviar = async (texto: string, base?: Mensagem[]) => {
    const historico = base ?? mensagens
    const comUsuario: Mensagem[] = texto ? [...historico, { papel: 'user', texto }] : historico
    trocarMensagens(() => [...comUsuario, { papel: 'assistant', texto: '' }])
    setEntrada('')
    setOcupado(true)

    const atualizarUltima = (fn: (a: Mensagem) => Mensagem) =>
      trocarMensagens(m => { const c = [...m]; c[c.length - 1] = fn(c[c.length - 1]); return c })

    try {
      const res = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagens: comUsuario.map(m => ({ role: m.papel, content: m.texto })).filter(m => m.content.trim()),
          confirmacoes: confirmadas.current,
          telaAtual: pathname,
        }),
      })

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({ error: 'Não consegui falar com o assistente.' }))
        atualizarUltima(() => ({ papel: 'assistant', texto: '', erro: json.error }))
        return
      }

      const leitor = res.body.getReader()
      const decoder = new TextDecoder()
      let sobra = ''
      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        sobra += decoder.decode(value, { stream: true })
        const linhas = sobra.split('\n')
        sobra = linhas.pop() ?? ''
        for (const linha of linhas) {
          if (!linha.trim()) continue
          let ev: { t: string; v?: string } & Partial<Confirmacao>
          try { ev = JSON.parse(linha) } catch { continue }
          if (ev.t === 'texto') atualizarUltima(a => ({ ...a, texto: a.texto + (ev.v ?? ''), ferramenta: null }))
          else if (ev.t === 'ferramenta') atualizarUltima(a => ({ ...a, ferramenta: ev.v ?? null }))
          else if (ev.t === 'confirmar' && ev.operacao) {
            const c: Confirmacao = { operacao: ev.operacao, resumo: ev.resumo ?? 'Confirmar exclusão', impacto: ev.impacto ?? {} }
            atualizarUltima(a => ({ ...a, confirmacoes: [...(a.confirmacoes ?? []), c] }))
          } else if (ev.t === 'erro') atualizarUltima(a => ({ ...a, erro: ev.v, ferramenta: null }))
        }
      }
      atualizarUltima(a => ({ ...a, ferramenta: null }))
    } catch {
      atualizarUltima(() => ({
        papel: 'assistant', texto: '',
        erro: 'A conexão caiu no meio da resposta. Tente de novo.',
      }))
    } finally {
      setOcupado(false)
    }
  }

  // Guarda no histórico sempre que a conversa para de ser escrita.
  useEffect(() => {
    if (ocupado || !mensagens.length) return
    setConversas(salvarConversa(usuarioId, { ...conversa, mensagens }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocupado, mensagens.length, usuarioId])

  const confirmar = (operacao: string) => {
    confirmadas.current = [...confirmadas.current, operacao]
    enviar('Confirmado, pode executar.', mensagens.filter(m => m.texto.trim()))
  }

  const comecarNova = () => {
    confirmadas.current = []
    setConversa(novaConversa())
    setVerHistorico(false)
  }

  const abrirConversa = (c: Conversa) => {
    confirmadas.current = []
    setConversa(c)
    setVerHistorico(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6" onClick={onFechar}>
      <div className="overlay-fade-in absolute inset-0 bg-black/55 backdrop-blur-sm" />
      <div
        onClick={e => e.stopPropagation()}
        className="modal-pop-in relative flex flex-col w-full h-full sm:w-[44rem] sm:h-[80vh] sm:max-h-[46rem] bg-white sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 h-16 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {verHistorico ? (
              <button onClick={() => setVerHistorico(false)} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-brand-600" />
              </div>
            )}
            <div className="leading-tight min-w-0">
              <p className="text-slate-800 font-bold text-sm truncate">
                {verHistorico ? 'Conversas anteriores' : 'Credenciei IA'}
              </p>
              <p className="text-slate-400 text-[11px] truncate">
                {verHistorico ? `${conversas.length} guardada(s) neste aparelho` : 'Pergunte ou peça pra fazer'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!verHistorico && (
              <>
                <button onClick={comecarNova} title="Nova conversa" className="btn-press w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                  <SquarePen className="w-4 h-4" />
                </button>
                <button onClick={() => setVerHistorico(true)} title="Conversas anteriores" className="btn-press w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
                  <History className="w-4 h-4" />
                </button>
              </>
            )}
            <button onClick={onFechar} title="Fechar" className="btn-press w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {verHistorico ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {!conversas.length && (
              <p className="text-slate-400 text-sm text-center py-10">Nenhuma conversa guardada ainda.</p>
            )}
            {conversas.map(c => (
              <div key={c.id} className="group flex items-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5 transition-colors">
                <button onClick={() => abrirConversa(c)} className="flex-1 text-left min-w-0">
                  <p className="text-slate-700 text-sm font-medium truncate">{c.titulo || tituloDe(c.mensagens)}</p>
                  <p className="text-slate-400 text-[11px]">{quandoRelativo(c.atualizadaEm)} • {c.mensagens.filter(m => m.papel === 'user').length} pergunta(s)</p>
                </button>
                <button
                  onClick={() => setConversas(apagarConversa(usuarioId, c.id))}
                  title="Apagar conversa"
                  className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-3">
              {!mensagens.length && (
                <div className="space-y-3 max-w-lg">
                  <p className="text-slate-500 text-sm">
                    Eu conheço todas as telas e regras do sistema. Posso ensinar, consultar e executar o que você já
                    poderia fazer sozinho.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-1.5">
                    {SUGESTOES.map(s => (
                      <button
                        key={s}
                        onClick={() => enviar(s)}
                        className="btn-press text-left text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {mensagens.map((m, i) => (
                <div key={i} className={m.papel === 'user' ? 'flex justify-end' : ''}>
                  {m.papel === 'user' ? (
                    <p className="bg-brand-100 text-slate-800 text-sm rounded-2xl rounded-br-sm px-3.5 py-2 max-w-[80%] whitespace-pre-wrap">
                      {m.texto}
                    </p>
                  ) : (
                    <div className="max-w-[92%] space-y-1">
                      {m.texto && (
                        <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">
                          <Formatado texto={m.texto} />
                        </p>
                      )}
                      {m.ferramenta && (
                        <p className="flex items-center gap-1.5 text-slate-400 text-xs">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {m.ferramenta.startsWith('excluir') ? 'Verificando o impacto...' : 'Consultando o sistema...'}
                        </p>
                      )}
                      {!m.texto && !m.ferramenta && !m.erro && ocupado && (
                        <p className="flex items-center gap-1.5 text-slate-400 text-xs">
                          <Loader2 className="w-3 h-3 animate-spin" /> Pensando...
                        </p>
                      )}
                      {m.confirmacoes?.map(c => (
                        <CartaoConfirmacao key={c.operacao} c={c} onConfirmar={confirmar} ocupado={ocupado} />
                      ))}
                      {m.erro && (
                        <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">{m.erro}</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={fimDaLista} />
            </div>

            <form
              onSubmit={e => { e.preventDefault(); if (entrada.trim() && !ocupado) enviar(entrada.trim()) }}
              className="border-t border-slate-100 p-3 sm:px-5 sm:pb-4 shrink-0"
            >
              <div className="flex items-end gap-2">
                <textarea
                  autoFocus
                  value={entrada}
                  onChange={e => setEntrada(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      if (entrada.trim() && !ocupado) enviar(entrada.trim())
                    }
                  }}
                  rows={1}
                  placeholder="Pergunte ou peça algo..."
                  className="input resize-none max-h-32 text-sm"
                />
                <button
                  type="submit"
                  disabled={!entrada.trim() || ocupado}
                  className="btn-press shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white"
                  aria-label="Enviar"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
