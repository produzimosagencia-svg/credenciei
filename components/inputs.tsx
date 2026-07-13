'use client'
import { useState, type InputHTMLAttributes } from 'react'
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
    return (
      <input
        {...extraProps}
        {...props}
        value={value}
        onChange={e => {
          const v = format(e.target.value)
          setValue(v)
          onValueChange?.(v)
        }}
      />
    )
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
