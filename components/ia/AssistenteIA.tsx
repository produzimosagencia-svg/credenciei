'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Sparkles, X, ArrowUp, AlertTriangle, Loader2, Trash2 } from 'lucide-react'

type Papel = 'user' | 'assistant'
type Confirmacao = { operacao: string; resumo: string; impacto: Record<string, unknown> }
type Mensagem = {
  papel: Papel
  texto: string
  ferramenta?: string | null
  confirmacoes?: Confirmacao[]
  erro?: string
}

const SUGESTOES = [
  'Quem ainda não bateu o ponto?',
  'Como cadastro um funcionário?',
  'Quais eventos estão ativos?',
  'Como funcionam as janelas de horário?',
]

/** Converte [texto](/caminho) em link e **negrito** em <strong>, só isso. */
function Formatado({ texto }: { texto: string }) {
  const partes = texto.split(/(\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*)/g)
  return (
    <>
      {partes.map((parte, i) => {
        const link = parte.match(/^\[([^\]]+)\]\(([^)]+)\)$/)
        if (link) {
          return (
            <Link key={i} href={link[2]} className="text-brand-500 hover:underline font-medium">
              {link[1]}
            </Link>
          )
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
          <li key={chave} className="list-disc">
            {chave.replace(/_/g, ' ')}: <strong>{String(valor)}</strong>
          </li>
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
 * Credenciei IA — assistente disponível em todas as telas do painel.
 *
 * A confirmação de exclusão só existe quando o SERVIDOR manda um evento
 * 'confirmar'; clicar reenvia a conversa com o id da operação liberado. Nada
 * que o modelo escreva no texto faz um botão desses aparecer.
 */
export default function AssistenteIA() {
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [entrada, setEntrada] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const confirmadas = useRef<string[]>([])
  const fimDaLista = useRef<HTMLDivElement>(null)
  const pathname = usePathname()

  useEffect(() => {
    if (aberto) fimDaLista.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens, aberto])

  const enviar = async (texto: string, historicoBase?: Mensagem[]) => {
    const historico = historicoBase ?? mensagens
    const comUsuario: Mensagem[] = texto
      ? [...historico, { papel: 'user', texto }]
      : historico
    setMensagens([...comUsuario, { papel: 'assistant', texto: '' }])
    setEntrada('')
    setOcupado(true)

    try {
      const res = await fetch('/api/ia/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagens: comUsuario.map(m => ({
            role: m.papel,
            content: m.texto,
          })).filter(m => m.content.trim()),
          confirmacoes: confirmadas.current,
          telaAtual: pathname,
        }),
      })

      if (!res.ok || !res.body) {
        const json = await res.json().catch(() => ({ error: 'Não consegui falar com o assistente.' }))
        setMensagens(m => {
          const copia = [...m]
          copia[copia.length - 1] = { papel: 'assistant', texto: '', erro: json.error }
          return copia
        })
        return
      }

      const leitor = res.body.getReader()
      const decoder = new TextDecoder()
      let sobra = ''

      const atualizar = (fn: (atual: Mensagem) => Mensagem) =>
        setMensagens(m => {
          const copia = [...m]
          copia[copia.length - 1] = fn(copia[copia.length - 1])
          return copia
        })

      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        sobra += decoder.decode(value, { stream: true })
        const linhas = sobra.split('\n')
        sobra = linhas.pop() ?? ''
        for (const linha of linhas) {
          if (!linha.trim()) continue
          let evento: { t: string; v?: string } & Partial<Confirmacao>
          try { evento = JSON.parse(linha) } catch { continue }
          if (evento.t === 'texto') {
            atualizar(a => ({ ...a, texto: a.texto + (evento.v ?? ''), ferramenta: null }))
          } else if (evento.t === 'ferramenta') {
            atualizar(a => ({ ...a, ferramenta: evento.v ?? null }))
          } else if (evento.t === 'confirmar' && evento.operacao) {
            const c: Confirmacao = {
              operacao: evento.operacao,
              resumo: evento.resumo ?? 'Confirmar exclusão',
              impacto: evento.impacto ?? {},
            }
            atualizar(a => ({ ...a, confirmacoes: [...(a.confirmacoes ?? []), c] }))
          } else if (evento.t === 'erro') {
            atualizar(a => ({ ...a, erro: evento.v, ferramenta: null }))
          }
        }
      }
      atualizar(a => ({ ...a, ferramenta: null }))
    } catch {
      setMensagens(m => {
        const copia = [...m]
        copia[copia.length - 1] = {
          papel: 'assistant', texto: '',
          erro: 'A conexão caiu no meio da resposta. Tente de novo.',
        }
        return copia
      })
    } finally {
      setOcupado(false)
    }
  }

  // Reenvia a conversa com a operação liberada: agora a ferramenta executa.
  const confirmar = (operacao: string) => {
    confirmadas.current = [...confirmadas.current, operacao]
    const semVazias = mensagens.filter(m => m.texto.trim())
    enviar('Confirmado, pode executar.', semVazias)
  }

  return (
    <>
      {!aberto && (
        <button
          onClick={() => setAberto(true)}
          className="btn-press fixed bottom-5 right-5 z-40 flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white pl-4 pr-5 py-3 rounded-full font-semibold text-sm shadow-lg shadow-brand-500/30"
        >
          <Sparkles className="w-4 h-4" />
          Credenciei IA
        </button>
      )}

      {aberto && (
        <div className="fixed inset-0 z-40 flex items-end justify-end p-0 sm:p-5 pointer-events-none">
          <div className="modal-pop-in pointer-events-auto flex flex-col w-full sm:w-[26rem] h-full sm:h-[38rem] sm:max-h-[85vh] bg-white sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 h-14 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-brand-100 flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                </div>
                <div className="leading-tight">
                  <p className="text-slate-800 font-bold text-sm">Credenciei IA</p>
                  <p className="text-slate-400 text-[11px]">Pergunte ou peça pra fazer</p>
                </div>
              </div>
              <button
                onClick={() => setAberto(false)}
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Fechar assistente"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {!mensagens.length && (
                <div className="space-y-3">
                  <p className="text-slate-500 text-sm">
                    Eu conheço todas as telas e regras do sistema. Posso ensinar, consultar e executar o que você
                    já poderia fazer sozinho.
                  </p>
                  <div className="space-y-1.5">
                    {SUGESTOES.map(s => (
                      <button
                        key={s}
                        onClick={() => enviar(s)}
                        className="btn-press w-full text-left text-xs text-slate-600 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl px-3 py-2.5"
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
                    <p className="bg-brand-500 text-white text-sm rounded-2xl rounded-br-sm px-3.5 py-2 max-w-[85%] whitespace-pre-wrap">
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
                        <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                          {m.erro}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <div ref={fimDaLista} />
            </div>

            <form
              onSubmit={e => { e.preventDefault(); if (entrada.trim() && !ocupado) enviar(entrada.trim()) }}
              className="border-t border-slate-100 p-3 shrink-0"
            >
              <div className="flex items-end gap-2">
                <textarea
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
                  className="input resize-none max-h-28 text-sm"
                />
                <button
                  type="submit"
                  disabled={!entrada.trim() || ocupado}
                  className="btn-press shrink-0 w-10 h-10 flex items-center justify-center rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white"
                  aria-label="Enviar"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
