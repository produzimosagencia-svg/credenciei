/*
 * RESUMO DIÁRIO DO SUPERVISOR — as regras, sem banco (testadas em testes/resumo-supervisor.mjs).
 */

/**
 * O telefone brasileiro em DDD + número (10 ou 11 dígitos, sem o 55), ou `null` quando não serve. O genérico de
 * destravar cadastro (DDD + zeros, ex.: 27 0000-0000) não serve.
 */
export function normalizarTelefoneBR(bruto: string | null | undefined): string | null {
  let d = String(bruto ?? '').replace(/\D/g, '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return null
  if (d[0] === '0' || d[2] === '0') return null
  if (/^\d{2}0{8,9}$/.test(d)) return null
  // Celular com 11 dígitos começa com 9 depois do DDD.
  if (d.length === 11 && d[2] !== '9') return null
  return d
}

export type Pendencias = { aprovar: number; credenciaisFalharam: number }

/**
 * O corpo do resumo do supervisor numa frase (sem quebra de linha — a Meta recusa quebra em parâmetro).
 * `null` quando não há nada pendente: aí não sai mensagem.
 */
export function textoDoResumo(p: Pendencias): string | null {
  const partes: string[] = []
  if (p.aprovar > 0) partes.push(`${p.aprovar} ${p.aprovar === 1 ? 'pessoa aguardando' : 'pessoas aguardando'} sua aprovação`)
  if (p.credenciaisFalharam > 0) partes.push(`${p.credenciaisFalharam} ${p.credenciaisFalharam === 1 ? 'credencial que não chegou' : 'credenciais que não chegaram'} no WhatsApp`)
  if (!partes.length) return null
  return partes.join(' e ')
}
