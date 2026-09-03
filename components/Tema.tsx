'use client'
import { useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'

/**
 * Tema claro / escuro do sistema interno.
 *
 * O escuro (Arena) é o padrão. O claro é uma escolha da pessoa, guardada no
 * navegador dela — não é configuração de conta, é conforto de leitura.
 *
 * Como funciona: o atributo `data-tema="claro"` no <html> liga o bloco de
 * sobrescritas do globals.css. O layout raiz tem um script que lê o
 * localStorage e põe o atributo ANTES da primeira pintura, senão a tela
 * abriria escura e piscaria pra clara.
 */
export const CHAVE_TEMA = 'credenciei-tema'
export type Tema = 'escuro' | 'claro'

export function lerTema(): Tema {
  if (typeof document === 'undefined') return 'escuro'
  return document.documentElement.getAttribute('data-tema') === 'claro' ? 'claro' : 'escuro'
}

export function aplicarTema(tema: Tema) {
  const html = document.documentElement
  if (tema === 'claro') html.setAttribute('data-tema', 'claro')
  else html.removeAttribute('data-tema')
  try { localStorage.setItem(CHAVE_TEMA, tema) } catch { /* modo privado etc. */ }
}

/** Avisa quem está inscrito quando o atributo do <html> muda. */
function assinar(avisar: () => void) {
  const obs = new MutationObserver(avisar)
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tema'] })
  return () => obs.disconnect()
}

export function useTema(): [Tema, () => void] {
  // O <html> é a fonte da verdade (é ele que o CSS lê); o servidor sempre
  // responde "escuro", e o cliente corrige na hidratação sem re-render extra.
  const tema = useSyncExternalStore(assinar, lerTema, () => 'escuro' as Tema)
  const alternar = () => aplicarTema(tema === 'claro' ? 'escuro' : 'claro')
  return [tema, alternar]
}

/** Linha do menu do usuário: alterna entre os dois temas. */
export function BotaoTema({ className = '' }: { className?: string }) {
  const [tema, alternar] = useTema()
  const claro = tema === 'claro'
  return (
    <button
      type="button"
      role="menuitem"
      onClick={alternar}
      aria-pressed={claro}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors ${className}`}
    >
      {claro ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      {claro ? 'Tema escuro' : 'Tema claro'}
    </button>
  )
}
