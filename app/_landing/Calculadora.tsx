'use client'
import { useState } from 'react'
import s from './landing.module.css'

const TAXA_FIXA = 500
const POR_PESSOA = 1
const MIN = 50
const MAX = 3000
const PASSO = 10

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/**
 * O preço em slider: a pessoa arrasta a quantidade de gente e vê o total
 * subir. A conta é a da página — R$ 500 fixo + R$ 1 por credenciado.
 */
export default function Calculadora() {
  const [pessoas, setPessoas] = useState(300)
  const total = TAXA_FIXA + pessoas * POR_PESSOA
  const pct = ((pessoas - MIN) / (MAX - MIN)) * 100

  return (
    <>
      <div className={s.calculadora}>
        <div className={s.calculadoraTopo}>
          <p className={s.exemploRotulo}>Simule o seu evento</p>
          <p className={s.exemploTexto}>
            <strong className={s.calculadoraPessoas}>{pessoas.toLocaleString('pt-BR')}</strong> pessoas credenciadas
          </p>
        </div>
        <input
          type="range"
          min={MIN}
          max={MAX}
          step={PASSO}
          value={pessoas}
          onChange={e => setPessoas(Number(e.target.value))}
          aria-label="Quantidade de pessoas credenciadas"
          className={s.slider}
          style={{ '--pct': `${pct}%` } as React.CSSProperties}
        />
        <div className={s.sliderLegenda}><span>{MIN}</span><span>{MAX.toLocaleString('pt-BR')}+</span></div>
      </div>

      {/* O total fora da caixa, do tamanho dos outros valores: é o número
          que a pessoa veio ver. */}
      <div className={s.totalBloco}>
        <p className={s.precoRotulo}>Valor total</p>
        <p className={s.precoLinha}>
          <span className={`${s.precoValor} ${s.totalValor}`} aria-live="polite">{brl(total)}</span>
          <span className={s.precoDesc}>para {pessoas.toLocaleString('pt-BR')} pessoas · taxa fixa + R$ 1 por pessoa</span>
        </p>
      </div>
    </>
  )
}
