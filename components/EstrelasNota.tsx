'use client'
import { Star } from 'lucide-react'

/**
 * Estrelas de 1 a 5 — a avaliação do colaborador depois do evento.
 *
 * `Estrelas` só MOSTRA (aceita média quebrada: 4,3 pinta 4 cheias e a quinta
 * apagada). `EstrelasEditaveis` deixa tocar numa estrela pra dar a nota, com
 * alvo de toque grande — o supervisor avalia a equipe inteira pelo celular.
 */

const COR_CHEIA = 'text-amber-400 fill-amber-400'
const COR_VAZIA = 'text-slate-300'

export function Estrelas({ nota, tamanho = 'w-4 h-4' }: { nota: number | null; tamanho?: string }) {
  const cheias = nota == null ? 0 : Math.round(nota)
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={nota == null ? 'Sem nota' : `${nota} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} className={`${tamanho} ${n <= cheias ? COR_CHEIA : COR_VAZIA}`} />
      ))}
    </span>
  )
}

export function EstrelasEditaveis({ nota, onEscolher, desabilitado = false }: {
  nota: number | null
  onEscolher: (nota: number) => void
  desabilitado?: boolean
}) {
  return (
    <span className="inline-flex items-center" role="radiogroup" aria-label="Nota de 1 a 5 estrelas">
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={nota === n}
          aria-label={`${n} estrela${n === 1 ? '' : 's'}`}
          disabled={desabilitado}
          onClick={() => onEscolher(n)}
          className="btn-press p-1.5 -m-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Star className={`w-6 h-6 transition-colors ${nota != null && n <= nota ? COR_CHEIA : `${COR_VAZIA} hover:text-amber-300`}`} />
        </button>
      ))}
    </span>
  )
}
