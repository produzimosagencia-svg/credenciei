'use client'

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, ArrowLeft, Check, CheckCheck, Clock, Eye, Megaphone, SendHorizontal } from 'lucide-react'
import { responderCompartilhado } from '@/lib/actions-respostas'
import type { MensagemCompartilhada } from '@/lib/respostas-compartilhadas'
import { formatarBR } from '@/lib/tz'
import { corDoCirculo, formatarTelefone, iniciais, rotuloSemTexto } from '../formato'
import estilos from '../chat.module.css'
import Midia from './Midia'

const ROTULO_STATUS: Record<string, { texto: string; icone: React.ElementType; cor: string }> = {
  enviando: { texto: 'enviando', icone: Clock, cor: 'text-white/70' },
  sent: { texto: 'enviada', icone: Check, cor: 'text-white/80' },
  delivered: { texto: 'entregue', icone: CheckCheck, cor: 'text-white/80' },
  read: { texto: 'lida', icone: CheckCheck, cor: 'text-sky-200' },
  failed: { texto: 'falhou', icone: AlertCircle, cor: 'text-white' },
}

/** O que mostrar quando a mensagem não tem texto nem arquivo. */
function semConteudo(m: MensagemCompartilhada): string {
  if (m.tipo === 'reaction') return m.reacao ? `Reagiu com ${m.reacao}` : 'Retirou a reação'
  if (m.tipo === 'unsupported') return 'Mensagem em um formato que o WhatsApp não repassa para empresas'
  return rotuloSemTexto(m.tipo)
}

/**
 * A conversa aberta: cabeçalho, mensagens e a caixa de resposta.
 *
 * A resposta aparece na tela no instante do envio, com um relógio no lugar do
 * tique, e só depois é confirmada pelo servidor. Esperar a ida e a volta para
 * então desenhar o balão é o que fazia o envio parecer travado.
 */
export default function Chat({ token, telefone, nome, podeResponder, janelaAberta, mensagens }: {
  token: string
  telefone: string
  nome: string
  podeResponder: boolean
  janelaAberta: boolean
  mensagens: MensagemCompartilhada[]
}) {
  const router = useRouter()
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, iniciarEnvio] = useTransition()
  const [visiveis, acrescentar] = useOptimistic(
    mensagens,
    (atuais, nova: MensagemCompartilhada) => [...atuais, nova],
  )
  const rolagem = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const jaRolou = useRef(false)

  const titulo = nome || formatarTelefone(telefone)
  const ultimaId = visiveis.at(-1)?.id

  // Desce até a mensagem mais nova: de uma vez ao abrir, suave quando chega outra.
  useEffect(() => {
    const el = rolagem.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: jaRolou.current ? 'smooth' : 'auto' })
    jaRolou.current = true
  }, [ultimaId])

  // Foto que termina de carregar aumenta o balão. Se a pessoa estava no fim da
  // conversa, continua no fim; se subiu para ler algo antigo, não é puxada.
  const acompanharMidia = () => {
    const el = rolagem.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 420) el.scrollTo({ top: el.scrollHeight })
  }

  // A caixa cresce com o texto, até um teto, em vez de rolar dentro de duas linhas.
  useEffect(() => {
    const el = campo.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [texto])

  const enviar = () => {
    const corpo = texto.trim()
    if (!corpo || enviando) return
    setErro(null)
    setTexto('')
    iniciarEnvio(async () => {
      acrescentar({
        id: `enviando-${Date.now()}`, direcao: 'enviada', tipo: 'text', texto: corpo,
        em: new Date().toISOString(), midia: null, reacao: null, status: 'enviando', erro: null,
      })
      try {
        await responderCompartilhado(token, telefone, corpo)
        router.refresh()
      } catch (e: unknown) {
        // Falhou: o balão provisório some sozinho e o texto volta para a caixa,
        // para a pessoa não ter que digitar de novo.
        setTexto(corpo)
        setErro(e instanceof Error ? e.message : 'Não foi possível enviar.')
      }
    })
  }

  // Cada mensagem sabe se abre um dia novo, para o separador de data sair antes dela.
  const comDia = visiveis.map((m, i) => {
    const dia = formatarBR(m.em, 'data').slice(0, 5)
    return { m, dia, novoDia: i === 0 || dia !== formatarBR(visiveis[i - 1].em, 'data').slice(0, 5) }
  })

  return (
    <main className={`flex h-full min-w-0 flex-col ${estilos.surgir}`}>
      <header className="flex items-center gap-3 border-b border-white/10 bg-[#161526] px-3 py-3 sm:px-4">
        <Link
          href={`/respostas/${token}`}
          aria-label="Voltar para as conversas"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white lg:hidden"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-bold text-white shadow-sm ${corDoCirculo(telefone)}`}>
          {iniciais(titulo)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-white">{titulo}</h2>
          <p className="truncate text-2xs tabular-nums text-white/50">{formatarTelefone(telefone)}</p>
        </div>
        {!podeResponder ? (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.08] px-2.5 py-1 text-2xs font-semibold text-white/70">
            <Eye className="h-3 w-3" /> Somente leitura
          </span>
        ) : janelaAberta ? (
          <span className="shrink-0 rounded-full bg-emerald-400/15 px-2.5 py-1 text-2xs font-semibold text-emerald-300">Pode responder</span>
        ) : (
          <span className="shrink-0 rounded-full bg-amber-400/15 px-2.5 py-1 text-2xs font-semibold text-amber-200">Janela fechada</span>
        )}
      </header>

      <div ref={rolagem} aria-live="polite" className={`min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-6 ${estilos.fundo} ${estilos.rolagem}`}>
        {/* O disparo não fica gravado como mensagem da conversa. Sem este
            lembrete, a primeira fala da pessoa aparece solta, respondendo a
            algo que quem atende não vê. */}
        <p className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1 text-2xs text-white/60">
          <Megaphone className="h-3 w-3 shrink-0" /> Recebeu o disparo e respondeu
        </p>

        {comDia.map(({ m, dia, novoDia }) => {
          const enviada = m.direcao === 'enviada'
          const st = m.status ? ROTULO_STATUS[m.status] : null
          const Icone = st?.icone
          return (
            <div key={m.id}>
              {novoDia && (
                <p className="mx-auto my-3 w-fit rounded-full bg-white/[0.07] px-3 py-1 text-2xs font-medium tabular-nums text-white/55">{dia}</p>
              )}
              <div className={`flex ${enviada ? `justify-end ${estilos.entrarEnviada}` : `justify-start ${estilos.entrarRecebida}`}`}>
                <div
                  className={`max-w-[85%] px-3.5 py-2.5 sm:max-w-[72%] ${
                    enviada
                      ? 'rounded-2xl rounded-br-md bg-gradient-to-br from-[#ff6a2b] to-[#e03a06] shadow-lg shadow-[#ff4a0f]/15'
                      : 'rounded-2xl rounded-bl-md border border-white/[0.07] bg-white/[0.08]'
                  } ${m.status === 'enviando' ? 'opacity-80' : ''} ${m.status === 'failed' ? 'ring-2 ring-red-400/70' : ''}`}
                >
                  {m.midia && <Midia token={token} id={m.id} classe={m.midia.classe} nome={m.midia.nome} aoCarregar={acompanharMidia} />}
                  {m.texto ? (
                    <p className={`whitespace-pre-wrap break-words text-[0.9375rem] leading-relaxed text-white ${m.midia ? 'mt-2' : ''}`}>{m.texto}</p>
                  ) : !m.midia && (
                    <p className="text-sm italic text-white/65">{semConteudo(m)}</p>
                  )}
                  <p className={`mt-1 flex items-center justify-end gap-1 text-2xs tabular-nums ${enviada ? 'text-white/80' : 'text-white/45'}`}>
                    {formatarBR(m.em, 'hora')}
                    {Icone && (
                      <span title={st!.texto} aria-label={st!.texto} className="inline-flex">
                        <Icone className={`h-3.5 w-3.5 ${st!.cor}`} />
                      </span>
                    )}
                  </p>
                  {m.erro && <p className="mt-1 text-2xs font-medium text-white">Não entregue ({m.erro})</p>}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {podeResponder && (
        <footer className="border-t border-white/10 bg-[#161526] p-3">
          {janelaAberta ? (
            <>
              {erro && (
                <p role="alert" className={`mb-2 flex items-start gap-1.5 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200 ${estilos.surgir}`}>
                  <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" /> {erro}
                </p>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={campo}
                  value={texto}
                  onChange={e => { setTexto(e.target.value); setErro(null) }}
                  rows={1}
                  maxLength={4000}
                  placeholder="Escreva a resposta"
                  aria-label="Resposta"
                  className={`max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-2.5 text-[0.9375rem] leading-relaxed text-white placeholder:text-white/40 outline-none transition focus:border-[#ff6a2b]/60 focus:bg-white/[0.09] focus:ring-2 focus:ring-[#ff4a0f]/20 ${estilos.rolagem}`}
                  onKeyDown={e => {
                    // No computador, Enter envia e Shift+Enter quebra linha, como
                    // em qualquer chat. No celular o Enter do teclado quebra
                    // linha, porque lá existe o botão de enviar ao lado.
                    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
                    if (window.matchMedia('(pointer: coarse)').matches) return
                    e.preventDefault()
                    enviar()
                  }}
                />
                <button
                  type="button"
                  onClick={enviar}
                  disabled={enviando || !texto.trim()}
                  aria-label={enviando ? 'Enviando' : 'Enviar resposta'}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ff6a2b] to-[#e03a06] text-white shadow-lg shadow-[#ff4a0f]/25 transition duration-150 hover:scale-105 hover:brightness-110 active:scale-95 disabled:scale-100 disabled:cursor-not-allowed disabled:bg-none disabled:bg-white/10 disabled:text-white/35 disabled:shadow-none"
                >
                  {enviando
                    ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                    : <SendHorizontal className="h-5 w-5" />}
                </button>
              </div>
              <p className="mt-1.5 hidden px-1 text-2xs text-white/35 lg:block">Enter envia · Shift+Enter quebra a linha</p>
            </>
          ) : (
            <div className="flex items-start gap-2 rounded-xl border border-amber-300/20 bg-amber-400/10 px-3 py-2.5 text-xs text-amber-100">
              <Clock className="mt-px h-3.5 w-3.5 shrink-0" />
              <span><strong>Janela de 24 horas fechada.</strong> O WhatsApp só permite resposta livre até 24 horas depois da última mensagem da pessoa.</span>
            </div>
          )}
        </footer>
      )}
    </main>
  )
}
