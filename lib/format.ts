// Formatação de campos de entrada (CPF, CNPJ, telefone e nomes).
// Usado pelos inputs em components/inputs.tsx.

/** Formata CPF conforme o usuário digita: 000.000.000-00 */
export function formatCpf(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

/** Formata CNPJ: 00.000.000/0000-00 */
export function formatCnpj(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14)
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

/** Detecta CPF (até 11 dígitos) ou CNPJ (12+) e formata de acordo. */
export function formatCpfCnpj(value: string): string {
  const d = value.replace(/\D/g, '')
  return d.length <= 11 ? formatCpf(value) : formatCnpj(value)
}

/** Formata telefone: (00) 00000-0000 ou (00) 0000-0000 */
export function formatTelefone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 10) {
    return d
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return d
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
}

// Conectores que ficam minúsculos no meio do nome (mas maiúsculo se for a 1ª palavra).
const CONECTORES = new Set(['de', 'da', 'do', 'das', 'dos', 'e'])

/**
 * Deixa a primeira letra de cada palavra maiúscula (Title Case).
 * Conectores comuns ("de", "da", "dos"...) ficam minúsculos, exceto no início.
 * Preserva espaços em branco enquanto o usuário digita.
 */
export function titleCaseNome(value: string): string {
  return value
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((palavra, i) => {
      if (palavra === '') return palavra
      if (i > 0 && CONECTORES.has(palavra)) return palavra
      return palavra.charAt(0).toLocaleUpperCase('pt-BR') + palavra.slice(1)
    })
    .join(' ')
}
