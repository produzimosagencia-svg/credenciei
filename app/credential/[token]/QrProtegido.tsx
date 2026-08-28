'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { EyeOff, ShieldAlert, RefreshCw, Loader2 } from 'lucide-react'
import { renovarQrCredencial } from '@/lib/actions'

/**
 * O QR Code da credencial, com as proteções que a plataforma web permite.
 *
 * ─── O QUE REALMENTE PROTEGE ────────────────────────────────────────────────
 *
 * O código dentro do QR tem prazo e é renovado enquanto esta tela estiver
 * aberta (ver lib/credencial-qr.ts). Essa é a única defesa que funciona de
 * verdade: nenhum navegador consegue impedir um print, e mesmo que
 * conseguisse, sempre dá para fotografar a tela com um segundo celular. O que
 * dá para fazer é a imagem capturada PARAR DE VALER.
 *
 * ─── O QUE APENAS DIFICULTA ─────────────────────────────────────────────────
 *
 * - salvar/copiar a imagem: menu de contexto, arrastar e seleção bloqueados;
 * - impressão: o QR some no `@media print`, então Ctrl+P não leva nada;
 * - tela em segundo plano: some e volta só com um toque, o que atrapalha
 *   gravação de tela e quem passa o aparelho para outra pessoa.
 *
 * O navegador NÃO avisa quando alguém tira um print — não existe API para
 * isso em iOS nem em Android. Sair de foco é o sinal mais próximo disponível,
 * e é o que este componente usa.
 */

type Props = {
  token: string
  /** Primeiro código, já renderizado no servidor — a tela nunca abre vazia. */
  inicial: { dataUrl: string; expiraEm: number }
}

/** Renova com folga: um terço do tempo restante dá três chances antes de expirar. */
function proximaRenovacaoMs(expiraEm: number): number {
  const restante = expiraEm - Date.now()
  return Math.max(30_000, Math.floor(restante / 3))
}

export default function QrProtegido({ token, inicial }: Props) {
  const [dataUrl, setDataUrl] = useState(inicial.dataUrl)
  const [expiraEm, setExpiraEm] = useState(inicial.expiraEm)
  const [oculto, setOculto] = useState(false)
  const [renovando, setRenovando] = useState(false)
  const [semRede, setSemRede] = useState(false)
  const [expirado, setExpirado] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const renovar = useCallback(async () => {
    setRenovando(true)
    try {
      const r = await renovarQrCredencial(token)
      if (r.dataUrl && r.expiraEm) {
        setDataUrl(r.dataUrl)
        setExpiraEm(r.expiraEm)
        setSemRede(false)
        setExpirado(false)
      } else {
        setSemRede(true)
      }
    } catch {
      // Falhar aqui não apaga o código atual: ele ainda vale por alguns
      // minutos, e derrubar o QR por uma oscilação de rede seria pior que a
      // renovação atrasada.
      setSemRede(true)
    } finally {
      setRenovando(false)
    }
  }, [token])

  // Ciclo de renovação. Reagenda a cada código novo, sempre com folga.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void renovar() }, proximaRenovacaoMs(expiraEm))
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [expiraEm, renovar])

  // Marca o código como vencido quando o prazo passa sem renovação — sem isso
  // a tela mostraria um QR que o scanner vai recusar, e a pessoa só
  // descobriria no portão.
  useEffect(() => {
    const restante = expiraEm - Date.now()
    if (restante <= 0) { setExpirado(true); return }
    const t = setTimeout(() => setExpirado(true), restante)
    return () => clearTimeout(t)
  }, [expiraEm])

  // Esconde quando a tela sai de foco. É o sinal mais próximo de "alguém está
  // capturando" que a web oferece, e cobre também o caso de passar o aparelho
  // desbloqueado para outra pessoa.
  useEffect(() => {
    const esconder = () => setOculto(true)
    const aoTrocarVisibilidade = () => {
      if (document.visibilityState === 'hidden') { esconder(); return }
      // Voltou: se o código está perto de vencer, renova antes de a pessoa
      // chegar no portão em vez de deixá-la descobrir lá que expirou.
      if (expiraEm - Date.now() < 60_000) void renovar()
    }
    document.addEventListener('visibilitychange', aoTrocarVisibilidade)
    window.addEventListener('blur', esconder)
    return () => {
      document.removeEventListener('visibilitychange', aoTrocarVisibilidade)
      window.removeEventListener('blur', esconder)
    }
  }, [expiraEm, renovar])

  const mostrar = () => { setOculto(false); if (expirado) void renovar() }

  return (
    <div className="text-center" data-tutorial="cred-qr">
      <div
        className="relative mx-auto w-[200px] h-[200px] rounded-xl border border-slate-100 overflow-hidden select-none"
        style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
        onContextMenu={e => e.preventDefault()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={dataUrl}
          alt="QR code da credencial"
          width={200}
          height={200}
          draggable={false}
          onDragStart={e => e.preventDefault()}
          // print:hidden — o QR não sai em impressão nem em "salvar como PDF".
          className={`w-full h-full print:hidden transition-all ${oculto || expirado ? 'blur-xl scale-110' : ''}`}
          style={{ pointerEvents: 'none' }}
        />

        {(oculto || expirado) && (
          <button
            onClick={mostrar}
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-slate-900/80 text-white px-3"
          >
            {renovando ? <Loader2 className="w-6 h-6 animate-spin" /> : oculto ? <EyeOff className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
            <span className="font-bold text-xs">
              {oculto ? 'QR ocultado por segurança' : 'Código expirado'}
            </span>
            <span className="text-white/70 text-2xs leading-tight">
              {oculto ? 'Toque para mostrar de novo' : 'Toque para gerar um código novo'}
            </span>
          </button>
        )}

        {/* Substitui o QR no papel, para o print sair sem nada aproveitável. */}
        <div className="hidden print:flex absolute inset-0 items-center justify-center text-center px-4 border border-dashed border-slate-300 rounded-xl">
          <span className="text-slate-500 text-xs">
            O QR Code não pode ser impresso. Ele muda a cada poucos minutos e só vale ao vivo, na tela.
          </span>
        </div>
      </div>

      <p className="text-slate-400 text-xs mt-2">
        Apresente este QR code na <strong>entrada</strong> e na <strong>saída</strong> do evento
      </p>

      <p className="text-slate-400 text-2xs mt-1.5 flex items-center justify-center gap-1">
        <ShieldAlert className="w-3 h-3 shrink-0" />
        Este código muda sozinho. Print não funciona — mostre a tela ao vivo.
      </p>

      {semRede && (
        <button
          onClick={() => void renovar()}
          disabled={renovando}
          className="mt-2 inline-flex items-center gap-1.5 text-amber-600 text-2xs font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${renovando ? 'animate-spin' : ''}`} />
          Sem conexão para atualizar o código. Tocar para tentar de novo.
        </button>
      )}
    </div>
  )
}
