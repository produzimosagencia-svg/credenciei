'use client'
import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  Sparkles, X, ArrowUp, AlertTriangle, Loader2, Trash2, History, SquarePen, ArrowLeft,
  Paperclip, FileSpreadsheet,
} from 'lucide-react'
import {
  apagarConversa, carregarConversas, novaConversa, quandoRelativo, salvarConversa, tituloDe,
  type Confirmacao, type Conversa, type Mensagem,
} from './historico'
import { lerPlanilhaDeEquipe, type LinhaPlanilha } from '@/lib/planilha'
import { Aviso } from '@/components/ui/Superficie'

/** Planilha anexada à conversa: fica no cliente e vai junto de cada mensagem. */
type Anexo = { nome: string; linhas: LinhaPlanilha[] }

const SUGESTOES = [
  'Quem ainda não bateu o ponto?',
  'Quero cadastrar minha equipe pela planilha',
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
  // Cadastrar em lote também pede aval, mas não é perda de dado: vermelho e
  // lixeira ali fariam a pessoa achar que vai apagar alguma coisa.
  const criando = c.tipo === 'criar'
  const t = criando
    ? { borda: 'border-brand-200', fundo: 'bg-brand-50', titulo: 'text-brand-700', item: 'text-brand-600',
        nota: 'text-brand-500', botao: 'bg-brand-500 hover:bg-brand-600',
        aviso: 'Ninguém é apagado. Se algo sair errado, dá pra desativar ou excluir depois.',
        rotulo: 'Confirmar cadastro', Icone: FileSpreadsheet }
    : { borda: 'border-red-200', fundo: 'bg-red-50', titulo: 'text-red-700', item: 'text-red-600',
        nota: 'text-red-500', botao: 'bg-red-500 hover:bg-red-600',
        aviso: 'Não tem como desfazer.',
        rotulo: 'Confirmar exclusão', Icone: Trash2 }

  return (
    <div className={`mt-2.5 rounded-xl border ${t.borda} ${t.fundo} p-3 space-y-2`}>
      <p className={`flex items-start gap-1.5 ${t.titulo} text-xs font-bold`}>
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {c.resumo}
      </p>
      <ul className={`${t.item} text-2xs space-y-0.5 pl-5`}>
        {Object.entries(c.impacto).map(([chave, valor]) => (
          <li key={chave} className="list-disc">
            {chave.replace(/_/g, ' ')}: <strong>{Array.isArray(valor) ? valor.join(', ') || '—' : String(valor)}</strong>
          </li>
        ))}
      </ul>
      <p className={`${t.nota} text-2xs`}>{t.aviso}</p>
      {feito ? (
        <p className={`${t.titulo} text-xs font-semibold`}>Confirmado — executando.</p>
      ) : (
        <button
          onClick={() => { setFeito(true); onConfirmar(c.operacao) }}
          disabled={ocupado}
          className={`btn-press w-full flex items-center justify-center gap-1.5 ${t.botao} disabled:opacity-50 text-white text-xs font-bold py-2 rounded-lg`}
        >
          <t.Icone className="w-3.5 h-3.5" /> {t.rotulo}
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
  const [anexo, setAnexo] = useState<Anexo | null>(null)
  const [erroAnexo, setErroAnexo] = useState<string | null>(null)
  const confirmadas = useRef<string[]>([])
  const fimDaLista = useRef<HTMLDivElement>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const pathname = usePathname()

  // A planilha é lida aqui, por código — a IA nunca transcreve CPF.
  const anexarPlanilha = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setErroAnexo(null)
    try {
      const linhas = await lerPlanilhaDeEquipe(arquivo)
      if (!linhas.length) {
        setErroAnexo('Não achei ninguém nessa planilha. Ela precisa ter pelo menos as colunas Nome e CPF.')
        return
      }
      setAnexo({ nome: arquivo.name, linhas })
    } catch {
      setErroAnexo('Não consegui ler esse arquivo. Use a planilha modelo (.xlsx ou .csv).')
    }
  }

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
          planilha: anexo?.linhas,
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
            const c: Confirmacao = {
              operacao: ev.operacao,
              resumo: ev.resumo ?? 'Confirmar operação',
              impacto: ev.impacto ?? {},
              tipo: ev.tipo === 'criar' ? 'criar' : 'excluir',
            }
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

  /**
   * Enviar com planilha anexada e sem texto é um pedido válido — o anexo é a
   * mensagem. Nesse caso escrevemos a frase por ela, porque a API exige texto.
   */
  const mandar = () => {
    if (ocupado) return
    const texto = entrada.trim()
    if (texto) return void enviar(texto)
    if (anexo) return void enviar(`Anexei a planilha "${anexo.nome}" com a equipe. Cadastra pra mim?`)
  }

  const confirmar = (operacao: string) => {
    confirmadas.current = [...confirmadas.current, operacao]
    enviar('Confirmado, pode executar.', mensagens.filter(m => m.texto.trim()))
  }

  // A planilha pertence à conversa: trocar de conversa solta o anexo junto.
  const comecarNova = () => {
    confirmadas.current = []
    setAnexo(null)
    setErroAnexo(null)
    setConversa(novaConversa())
    setVerHistorico(false)
  }

  const abrirConversa = (c: Conversa) => {
    confirmadas.current = []
    setAnexo(null)
    setErroAnexo(null)
    setConversa(c)
    setVerHistorico(false)
  }

  return (
    /*
     * `tema-escuro` precisa estar AQUI: o provider do assistente envolve o
     * AppShell inteiro, então o modal é irmão do `<div className="tema-escuro">`
     * e não descendente dele. Sem esta classe o modal renderizava claro —
     * branco, texto escuro — no meio de um painel escuro.
     */
    <div className="tema-escuro fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-6" onClick={onFechar}>
      <div className="overlay-fade-in absolute inset-0 bg-black/60" />
      <div
        onClick={e => e.stopPropagation()}
        className="modal-pop-in relative flex flex-col w-full h-full sm:w-[44rem] sm:h-[80vh] sm:max-h-[46rem] bg-white sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden"
      >
        {/* Cabeçalho — 56px, a mesma altura da barra superior do painel */}
        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 h-14 border-b border-slate-100 shrink-0">
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
              <p className="text-slate-400 text-2xs truncate">
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
                  <p className="text-slate-400 text-2xs">{quandoRelativo(c.atualizadaEm)} • {c.mensagens.filter(m => m.papel === 'user').length} pergunta(s)</p>
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
                  <Aviso tom="marca" icone={<Paperclip className="w-3.5 h-3.5" />}>
                    <span className="text-xs">
                      Também dá pra anexar a planilha da equipe no clipe abaixo — o sistema lê e confere os CPFs, e
                      eu cadastro todo mundo de uma vez, no setor certo.
                    </span>
                  </Aviso>
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
              onSubmit={e => { e.preventDefault(); mandar() }}
              className="border-t border-slate-100 p-3 sm:px-5 sm:pb-4 shrink-0 space-y-2"
            >
              {anexo && (
                <div className="flex items-center gap-2 bg-brand-50 border border-brand-200 rounded-xl px-3 py-2">
                  <FileSpreadsheet className="w-4 h-4 text-brand-600 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-brand-700 text-xs font-semibold truncate">{anexo.nome}</p>
                    <p className="text-brand-500 text-2xs">
                      {anexo.linhas.length} pessoa{anexo.linhas.length !== 1 ? 's' : ''} — diga em qual setor entram
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAnexo(null)}
                    className="shrink-0 text-brand-400 hover:text-brand-700"
                    aria-label="Remover planilha"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
              {erroAnexo && (
                <p className="text-red-500 text-xs bg-red-50 border border-red-200 rounded-xl px-3 py-2">{erroAnexo}</p>
              )}

              <div className="flex items-end gap-2">
                <input
                  ref={arquivoRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={anexarPlanilha}
                />
                <button
                  type="button"
                  onClick={() => arquivoRef.current?.click()}
                  disabled={ocupado}
                  className="btn-press shrink-0 w-11 h-11 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-brand-600 hover:border-brand-300 disabled:opacity-40"
                  aria-label="Anexar planilha da equipe"
                  title="Anexar planilha da equipe"
                >
                  <Paperclip className="w-4 h-4" />
                </button>
                <textarea
                  autoFocus
                  value={entrada}
                  onChange={e => setEntrada(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      mandar()
                    }
                  }}
                  rows={1}
                  placeholder={anexo ? 'Em qual setor entram?' : 'Pergunte ou peça algo...'}
                  className="input resize-none max-h-32 text-sm"
                />
                <button
                  type="submit"
                  disabled={(!entrada.trim() && !anexo) || ocupado}
                  className="btn btn-primario btn-icone-lg shrink-0"
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
