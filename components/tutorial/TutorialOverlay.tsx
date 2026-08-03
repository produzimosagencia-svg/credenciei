'use client'
import { useLayoutEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { TutorialPasso } from './types'

type Retangulo = { top: number; left: number; width: number; height: number }

const MARGEM_ALVO = 8
const LARGURA_BALAO = 320
const ALTURA_ESTIMADA_BALAO = 170
const ESPACO_BALAO = 14

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

function calcularPosicaoBalao(rect: Retangulo, posicao: TutorialPasso['posicao'] = 'bottom') {
  let top: number
  let left: number
  switch (posicao) {
    case 'top':
      top = rect.top - ALTURA_ESTIMADA_BALAO - ESPACO_BALAO
      left = rect.left + rect.width / 2 - LARGURA_BALAO / 2
      break
    case 'left':
      top = rect.top + rect.height / 2 - ALTURA_ESTIMADA_BALAO / 2
      left = rect.left - LARGURA_BALAO - ESPACO_BALAO
      break
    case 'right':
      top = rect.top + rect.height / 2 - ALTURA_ESTIMADA_BALAO / 2
      left = rect.left + rect.width + ESPACO_BALAO
      break
    default:
      top = rect.top + rect.height + ESPACO_BALAO
      left = rect.left + rect.width / 2 - LARGURA_BALAO / 2
  }
  left = Math.min(Math.max(left, 16), window.innerWidth - LARGURA_BALAO - 16)
  top = Math.min(Math.max(top, 16), window.innerHeight - ALTURA_ESTIMADA_BALAO - 16)
  return { top, left }
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
  const balao = calcularPosicaoBalao(rect, passo.posicao)
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
        className="modal-pop-in fixed z-[51] bg-white border border-slate-200 rounded-2xl shadow-xl p-5 space-y-4"
        style={{ top: balao.top, left: balao.left, width: LARGURA_BALAO }}
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

        <div className="space-y-1">
          <h3 className="text-sm font-bold text-slate-800">{passo.titulo}</h3>
          <p className="text-xs text-slate-500 leading-relaxed">{passo.descricao}</p>
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
