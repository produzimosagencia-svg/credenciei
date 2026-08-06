'use client'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreHorizontal } from 'lucide-react'

/**
 * Menu de ações ("...") que não é cortado pelo container.
 *
 * O menu é renderizado num portal no <body>, com posição fixa medida a partir
 * do botão. Posicionado como `absolute` dentro do próprio botão, ele era
 * recortado por qualquer ancestral com `overflow: hidden` ou `overflow-y:
 * auto` — e há vários: o corpo das seções (que usa overflow pra manter os
 * cantos arredondados), as listas com rolagem e as tabelas. O sintoma era
 * sempre o mesmo: clicava no "..." e metade do menu sumia.
 *
 * Reposiciona no scroll e no resize em vez de fechar: fechar na rolagem faz o
 * menu piscar no celular, onde o toque quase sempre rola um pixel.
 */
export function MenuAcoes({
  children,
  disabled,
  className = '',
  rotulo = 'Abrir ações',
}: {
  /** Recebe uma função pra fechar o menu depois de escolher a ação. */
  children: (fechar: () => void) => React.ReactNode
  disabled?: boolean
  className?: string
  rotulo?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const botao = useRef<HTMLButtonElement>(null)

  const medir = () => {
    const r = botao.current?.getBoundingClientRect()
    if (!r) return
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
  }

  // useLayoutEffect: mede antes da pintura, senão o menu aparece no canto
  // superior esquerdo por um quadro antes de saltar pro lugar certo.
  useLayoutEffect(() => {
    if (aberto) medir()
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    window.addEventListener('scroll', medir, true)
    window.addEventListener('resize', medir)
    document.addEventListener('keydown', tecla)
    return () => {
      window.removeEventListener('scroll', medir, true)
      window.removeEventListener('resize', medir)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  const fechar = () => setAberto(false)

  return (
    <>
      <button
        ref={botao}
        type="button"
        onClick={e => { e.preventDefault(); setAberto(v => !v) }}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label={rotulo}
        className={`p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 ${className}`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {aberto && pos && createPortal(
        <>
          {/* Captura o clique fora. z abaixo do menu, acima do resto. */}
          <div className="fixed inset-0 z-[60]" onClick={fechar} />
          <div
            role="menu"
            style={{ top: pos.top, right: pos.right }}
            className="modal-pop-in fixed z-[61] w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 overflow-hidden"
          >
            {children(fechar)}
          </div>
        </>,
        document.body
      )}
    </>
  )
}

/** Item do menu. `tom="perigo"` para a ação destrutiva. */
export function ItemMenu({
  onClick, href, tom = 'normal', children,
}: {
  onClick?: () => void
  href?: string
  tom?: 'normal' | 'perigo'
  children: React.ReactNode
}) {
  const cor = tom === 'perigo'
    ? 'text-erro-600 hover:bg-erro-50'
    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
  const classe = `w-full flex items-center gap-2.5 px-3.5 py-2.5 text-sm transition-colors ${cor}`

  if (href) return <a href={href} className={classe} role="menuitem">{children}</a>
  return <button type="button" role="menuitem" onClick={onClick} className={classe}>{children}</button>
}
