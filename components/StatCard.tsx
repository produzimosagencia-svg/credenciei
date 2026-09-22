'use client'
/**
 * Cartão de indicador (KPI).
 *
 * Cartão claro com um fio da cor no topo, um bloco colorido no ícone e um
 * fundo levemente tingido. A cor vem do SIGNIFICADO do número — o que precisa
 * de atenção é âmbar, o que está bem é verde, o que só conta coisa é azul —
 * nunca de uma cor por posição na fileira.
 *
 * O número continua quase preto de propósito: número colorido lê pior, e ele
 * é o conteúdo do cartão. A cor emoldura, não substitui.
 *
 * A aparência mora nas classes `.indicador*` do globals.css.
 *
 * ─── `sensivel` ──────────────────────────────────────────────────────────────
 *
 * Cartões de dinheiro (valor cobrado, custo de disparo) ficam visíveis em
 * tela compartilhada/print sem querer. Com `sensivel`, um olho aparece do
 * lado do rótulo pra tampar o valor na hora — estado por cartão, começa
 * visível (não muda o comportamento de sempre até alguém clicar).
 */

import { useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'

const TONS = {
  neutro: '',
  acento: 'indicador-acento',
  info: 'indicador-info',
  sucesso: 'indicador-sucesso',
  aviso: 'indicador-aviso',
  erro: 'indicador-erro',
} as const

export type TomStat = keyof typeof TONS

export default function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tom = 'neutro',
  small,
  href,
  sensivel,
}: {
  label: string
  value: string | number
  sub?: string
  icon?: React.ElementType
  tom?: TomStat
  /** Valor em texto longo (dinheiro, por exemplo) pede um degrau a menos. */
  small?: boolean
  /**
   * Para onde o cartão leva, quando o número tem uma lista por trás.
   *
   * Opcional de propósito: nem todo indicador tem detalhe que valha uma tela
   * (o total de setores, por exemplo, já está logo abaixo). Sem `href` o
   * cartão continua sendo o que sempre foi — um retângulo que não clica.
   */
  href?: string
  /** Mostra um olho pra tampar o valor (dado sensível — dinheiro, custo). */
  sensivel?: boolean
}) {
  const [revelado, setRevelado] = useState(true)
  const oculto = !!sensivel && !revelado

  const conteudo = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="indicador-rotulo truncate">{label}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {sensivel && (
            <button
              type="button"
              onClick={e => { e.preventDefault(); e.stopPropagation(); setRevelado(r => !r) }}
              aria-label={revelado ? 'Ocultar valor' : 'Mostrar valor'}
              className="indicador-icone hover:opacity-70 transition-opacity"
            >
              {revelado ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            </button>
          )}
          {Icon && (
            <span className="indicador-icone" aria-hidden="true">
              <Icon className="w-3.5 h-3.5" />
            </span>
          )}
        </div>
      </div>
      <p
        className="indicador-valor"
        style={small ? { fontSize: '1.625rem' } : undefined}
      >
        {oculto ? '••••••' : value}
      </p>
      {sub && <p className="indicador-sub">{oculto ? 'valor oculto' : sub}</p>}
    </>
  )

  if (!href) return <div className={`indicador ${TONS[tom]}`}>{conteudo}</div>

  // `block` e `text-left` porque `.indicador` foi desenhado para uma div:
  // sem eles o link vira inline e o cartão encolhe até o tamanho do texto.
  return (
    <Link href={href} className={`indicador ${TONS[tom]} block text-left hover:border-white/20 transition-colors`}>
      {conteudo}
    </Link>
  )
}
