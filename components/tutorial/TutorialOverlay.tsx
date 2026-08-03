'use client'
import { useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { TutorialPasso } from './types'

type Retangulo = { top: number; left: number; width: number; height: number }

const MARGEM_ALVO = 8
const ESPACO_BALAO = 14
const MARGEM_TELA = 16
/** Só o palpite do primeiro frame — logo em seguida medimos a altura real. */
const ALTURA_INICIAL_BALAO = 200

/** As telas do funcionário são de celular — o balão nunca pode passar da tela. */
function larguraBalao(): number {
  return Math.min(320, window.innerWidth - 32)
}

function medirAlvo(id: string): Retangulo | null {
  const el = document.querySelector(`[data-tutorial="${id}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    top: r.top - MARGEM_ALVO,
    left: r.left - MARGEM_ALVO,
    width: r.width + MARGEM_ALVO * 2,
    height: r.height + MARGEM_ALVO * 2,
  }
}

/**
 * Onde encaixar o balão. `altura` é a altura REAL medida depois do primeiro
 * render — usar estimativa fixa aqui é o que fazia o balão passar da tela em
 * passos com texto mais longo.
 *
 * A ordem de prioridade é: respeitar a posição pedida no roteiro → se não
 * couber, tentar o lado oposto → se não couber em lado nenhum, ficar onde há
 * mais espaço. Em qualquer caso o balão termina inteiro dentro da tela: pode
 * encostar no alvo, mas nunca ser cortado.
 */
function calcularPosicaoBalao(
  rect: Retangulo,
  posicao: TutorialPasso['posicao'] = 'bottom',
  altura: number
) {
  const largura = larguraBalao()
  const { innerWidth: vw, innerHeight: vh } = window
  const telaEstreita = vw < 768

  const espaco = {
    abaixo: vh - (rect.top + rect.height) - ESPACO_BALAO - MARGEM_TELA,
    acima: rect.top - ESPACO_BALAO - MARGEM_TELA,
    direita: vw - (rect.left + rect.width) - ESPACO_BALAO - MARGEM_TELA,
    esquerda: rect.left - ESPACO_BALAO - MARGEM_TELA,
  }

  // Em celular não existe espaço lateral útil: lateral vira vertical.
  let alvo = posicao
  if (telaEstreita && (alvo === 'left' || alvo === 'right')) alvo = 'bottom'
  if (alvo === 'right' && espaco.direita < largura) alvo = espaco.esquerda >= largura ? 'left' : 'bottom'
  if (alvo === 'left' && espaco.esquerda < largura) alvo = espaco.direita >= largura ? 'right' : 'bottom'
  if (alvo === 'bottom' && espaco.abaixo < altura && espaco.acima >= altura) alvo = 'top'
  if (alvo === 'top' && espaco.acima < altura && espaco.abaixo >= altura) alvo = 'bottom'
  // Não cabe nem em cima nem embaixo (alvo alto demais): usa o lado mais folgado.
  if ((alvo === 'bottom' || alvo === 'top') && espaco.abaixo < altura && espaco.acima < altura) {
    alvo = espaco.abaixo >= espaco.acima ? 'bottom' : 'top'
  }

  const centroX = rect.left + rect.width / 2 - largura / 2
  const centroY = rect.top + rect.height / 2 - altura / 2

  let top: number
  let left: number
  switch (alvo) {
    case 'top':    top = rect.top - altura - ESPACO_BALAO;      left = centroX; break
    case 'left':   top = centroY; left = rect.left - largura - ESPACO_BALAO;    break
    case 'right':  top = centroY; left = rect.left + rect.width + ESPACO_BALAO; break
    default:       top = rect.top + rect.height + ESPACO_BALAO; left = centroX
  }

  const limite = (v: number, tamanho: number, total: number) =>
    Math.min(Math.max(v, MARGEM_TELA), Math.max(MARGEM_TELA, total - tamanho - MARGEM_TELA))

  return {
    top: limite(top, altura, vh),
    left: limite(left, largura, vw),
    largura,
    // Texto absurdamente longo em tela baixa: rola dentro do balão em vez de
    // vazar pra fora da tela.
    alturaMaxima: vh - MARGEM_TELA * 2,
  }
}

export default function TutorialOverlay({
  passos, indice, onMudarIndice, onFinalizar,
}: {
  passos: TutorialPasso[]
  indice: number
  onMudarIndice: (i: number) => void
  onFinalizar: () => void
}) {
  const [rect, setRect] = useState<Retangulo | null>(null)
  const [alturaBalao, setAlturaBalao] = useState(ALTURA_INICIAL_BALAO)
  const balaoRef = useRef<HTMLDivElement>(null)
  const passo = passos[indice]

  useLayoutEffect(() => {
    if (!passo) return
    let cancelado = false
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const medir = () => {
      if (cancelado) return
      const r = medirAlvo(passo.alvo)
      if (!r) {
        // alvo não existe nessa tela agora (ex: campo condicional) — pula o passo
        if (indice < passos.length - 1) onMudarIndice(indice + 1)
        else onFinalizar()
        return
      }
      setRect(r)
    }

    const el = document.querySelector(`[data-tutorial="${passo.alvo}"]`)
    if (el) {
      el.scrollIntoView({ block: 'center', behavior: reduzido ? 'auto' : 'smooth' })
      setTimeout(medir, reduzido ? 0 : 250)
    } else {
      medir()
    }

    const aoRedimensionar = () => medir()
    window.addEventListener('resize', aoRedimensionar)
    window.addEventListener('scroll', aoRedimensionar, true)
    return () => {
      cancelado = true
      window.removeEventListener('resize', aoRedimensionar)
      window.removeEventListener('scroll', aoRedimensionar, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indice, passo?.alvo])

  // Mede a altura real do balão depois que o texto do passo renderizou. Sem
  // isso, um passo com descrição longa era posicionado como se fosse curto e
  // acabava cortado na base da tela.
  useLayoutEffect(() => {
    if (!balaoRef.current) return
    const medir = () => {
      const h = balaoRef.current?.offsetHeight
      if (h) setAlturaBalao(a => (Math.abs(a - h) > 1 ? h : a))
    }
    medir()
    const observer = new ResizeObserver(medir)
    observer.observe(balaoRef.current)
    return () => observer.disconnect()
  }, [indice, rect])

  useLayoutEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFinalizar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onFinalizar])

  if (!passo || !rect) return null

  const reduzido = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const transicaoSpotlight = reduzido ? 'none' : 'top 200ms ease-in-out, left 200ms ease-in-out, width 200ms ease-in-out, height 200ms ease-in-out'
  const balao = calcularPosicaoBalao(rect, passo.posicao, alturaBalao)
  const ultimoPasso = indice === passos.length - 1

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      {/* Recorte com brilho — 70% de escurecimento + anel de destaque na marca */}
      <div
        className="tutorial-spotlight fixed rounded-2xl pointer-events-none overlay-fade-in"
        style={{ ...rect, transition: transicaoSpotlight }}
      />

      {/* Bloqueadores de clique nas 4 bordas ao redor do alvo — só o elemento destacado continua clicável */}
      <div className="fixed pointer-events-auto" style={{ top: 0, left: 0, width: '100vw', height: Math.max(rect.top, 0) }} />
      <div className="fixed pointer-events-auto" style={{ top: rect.top + rect.height, left: 0, width: '100vw', bottom: 0 }} />
      <div className="fixed pointer-events-auto" style={{ top: rect.top, left: 0, width: Math.max(rect.left, 0), height: rect.height }} />
      <div className="fixed pointer-events-auto" style={{ top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height }} />

      {/* Balão explicativo */}
      <div
        ref={balaoRef}
        className="modal-pop-in fixed z-[51] bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-4 overflow-y-auto"
        style={{ top: balao.top, left: balao.left, width: balao.largura, maxHeight: balao.alturaMaxima }}
      >
        <div className="space-y-2">
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-500 rounded-full transition-[width] duration-200 ease-out"
              style={{ width: `${((indice + 1) / passos.length) * 100}%` }}
            />
          </div>
          <p className="text-[11px] font-semibold text-slate-400">Passo {indice + 1} de {passos.length}</p>
        </div>

        <div className="flex items-start gap-3">
          {passo.icone && (
            <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
              <passo.icone className="w-4 h-4" />
            </div>
          )}
          <div className="space-y-1 min-w-0">
            <h3 className="text-sm font-bold text-slate-800">{passo.titulo}</h3>
            <p className="text-xs text-slate-500 leading-relaxed">{passo.descricao}</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 pt-1">
          <button type="button" onClick={onFinalizar} className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors">
            Pular tutorial
          </button>
          <div className="flex items-center gap-1.5">
            {indice > 0 && (
              <button
                type="button"
                onClick={() => onMudarIndice(indice - 1)}
                className="btn-press w-7 h-7 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
                aria-label="Voltar"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={() => ultimoPasso ? onFinalizar() : onMudarIndice(indice + 1)}
              className="btn-press flex items-center gap-1 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg shadow-sm shadow-brand-200 transition-colors"
            >
              {ultimoPasso ? 'Finalizar' : 'Próximo'}
              {!ultimoPasso && <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
