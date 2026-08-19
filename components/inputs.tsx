'use client'
import { useRef, useState, type InputHTMLAttributes } from 'react'
import { formatCpf, formatCpfCnpj, formatTelefone, titleCaseNome } from '@/lib/format'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  defaultValue?: string
  /** Reflete o valor formatado para o pai a cada digitação (opcional). */
  onValueChange?: (value: string) => void
}

function makeFormattedInput(
  format: (v: string) => string,
  extraProps?: Partial<InputHTMLAttributes<HTMLInputElement>>,
) {
  return function FormattedInput({ defaultValue = '', onValueChange, ...props }: Props) {
    const [value, setValue] = useState(() => format(String(defaultValue)))
    /*
     * Acento morto e IME.
     *
     * Em teclado ABNT ou US-Internacional, "ç" e "ã" não chegam numa tecla só:
     * o navegador abre uma COMPOSIÇÃO (~ depois a) e vai emitindo onChange com
     * o estado intermediário. Como este input é controlado e reescrevia o valor
     * a cada onChange, ele cancelava a composição no meio — e "Segurança"
     * chegava ao banco como "Seguranã", sem ninguém perceber.
     *
     * Enquanto a composição está aberta, o valor passa cru; a formatação só
     * roda quando ela termina.
     */
    const compondo = useRef(false)

    const aplicar = (bruto: string) => {
      const v = format(bruto)
      setValue(v)
      onValueChange?.(v)
    }

    return (
      <input
        {...extraProps}
        {...props}
        value={value}
        onCompositionStart={() => { compondo.current = true }}
        onCompositionEnd={e => {
          compondo.current = false
          aplicar((e.target as HTMLInputElement).value)
        }}
        onChange={e => {
          if (compondo.current) {
            // Deixa o navegador conduzir a composição; nada de reformatar aqui.
            setValue(e.target.value)
            return
          }
          aplicar(e.target.value)
        }}
      />
    )
  }
}

/**
 * Props de um input controlado que formata o texto SEM quebrar acento morto.
 *
 * Existe porque o mesmo problema aparece fora deste arquivo: telas que montam
 * o valor no próprio estado (o formulário público, por exemplo) chamavam
 * `titleCaseNome` direto no onChange e corrompiam "Conceição" do mesmo jeito.
 *
 * Uso:
 *   const nome = useCampoFormatado(titleCaseNome, v => set('nome', v))
 *   <input value={form.nome} {...nome} />
 */
export function useCampoFormatado(
  format: (v: string) => string,
  aoMudar: (valor: string) => void
) {
  const compondo = useRef(false)
  return {
    onCompositionStart: () => { compondo.current = true },
    onCompositionEnd: (e: React.CompositionEvent<HTMLInputElement>) => {
      compondo.current = false
      aoMudar(format((e.target as HTMLInputElement).value))
    },
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      // Durante a composição o valor passa cru: reformatar aqui cancelaria a
      // acentuação no meio e gravaria o caractere errado.
      aoMudar(compondo.current ? e.target.value : format(e.target.value))
    },
  }
}

/** Nome próprio com Title Case (primeira letra de cada palavra maiúscula). */
export const NomeInput = makeFormattedInput(titleCaseNome)

/** CPF: 000.000.000-00 */
export const CpfInput = makeFormattedInput(formatCpf, { inputMode: 'numeric' })

/** CPF ou CNPJ, detectado pela quantidade de dígitos. */
export const CpfCnpjInput = makeFormattedInput(formatCpfCnpj, { inputMode: 'numeric' })

/** Telefone: (00) 00000-0000 */
export const TelefoneInput = makeFormattedInput(formatTelefone, { inputMode: 'tel' })
