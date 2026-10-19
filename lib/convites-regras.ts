/*
 * CONVITE POR WHATSAPP E RESUMO DO SUPERVISOR — as regras, sem banco (testadas em testes/convites-e-resumo.mjs).
 * Servem à tela (ler a lista colada antes de enviar) e ao servidor (conferir de novo).
 */

/** Até quantos convites de uma vez. */
export const MAX_CONVITES_POR_VEZ = 100

/** Depois de quanto tempo sem cadastro o convite ganha UM lembrete. */
export const LEMBRETE_DEPOIS_MS = 24 * 60 * 60 * 1000

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

/** O mesmo número, com ou sem o 9 da frente (cadastros antigos guardam sem). */
export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizarTelefoneBR(a)
  const y = normalizarTelefoneBR(b)
  if (!x || !y) return false
  if (x === y) return true
  const sem9 = (t: string) => (t.length === 11 ? t.slice(0, 2) + t.slice(3) : t)
  return sem9(x) === sem9(y)
}

export type LinhaDeConvite = { linha: string; telefone: string | null; nome: string | null; erro: string | null }

const PADRAO_TELEFONE = /(?:\+?\s*55[\s.-]*)?\(?\s*\d{2}\s*\)?[\s.-]*9?[\s.-]*\d{4}[\s.-]*\d{4}/

/**
 * A lista colada pelo supervisor: um contato por linha, com ou sem o nome ("Ana Silva 27 99999-0000",
 * "(27) 99999-0000 - Ana"). Linha repetida sai uma vez; linha sem telefone válido volta com o motivo.
 */
export function lerListaDeConvites(texto: string): LinhaDeConvite[] {
  const vistos = new Set<string>()
  const saida: LinhaDeConvite[] = []
  for (const bruta of String(texto ?? '').split(/\r?\n|;/)) {
    const linha = bruta.trim()
    if (!linha) continue
    const achado = linha.match(PADRAO_TELEFONE)
    const telefone = achado ? normalizarTelefoneBR(achado[0]) : null
    const nome = (achado ? linha.replace(achado[0], ' ') : linha)
      .replace(/[^\p{L}\s'.-]/gu, ' ').replace(/\s+/g, ' ').replace(/^[\s.-]+|[\s.-]+$/g, '').trim() || null
    if (!telefone) { saida.push({ linha, telefone: null, nome, erro: 'Telefone não encontrado (DDD + número).' }); continue }
    if (vistos.has(telefone)) continue
    vistos.add(telefone)
    saida.push({ linha, telefone, nome: nome ? nome.slice(0, 80) : null, erro: null })
  }
  return saida
}

/** "(27) 9••••-0000" — o supervisor reconhece o número sem a tela expor o telefone inteiro. */
export function telefoneMascarado(t: string | null | undefined): string {
  const d = normalizarTelefoneBR(t)
  if (!d) return '—'
  return `(${d.slice(0, 2)}) ${d.length === 11 ? '9••••' : '••••'}-${d.slice(-4)}`
}

export type Pendencias = { aprovar: number; credenciaisFalharam: number; convidadosSemCadastro: number }

/**
 * O corpo do resumo do supervisor numa frase (sem quebra de linha — a Meta recusa quebra em parâmetro).
 * `null` quando não há nada pendente: aí não sai mensagem.
 */
export function textoDoResumo(p: Pendencias): string | null {
  const partes: string[] = []
  if (p.aprovar > 0) partes.push(`${p.aprovar} ${p.aprovar === 1 ? 'pessoa aguardando' : 'pessoas aguardando'} sua aprovação`)
  if (p.credenciaisFalharam > 0) partes.push(`${p.credenciaisFalharam} ${p.credenciaisFalharam === 1 ? 'credencial que não chegou' : 'credenciais que não chegaram'} no WhatsApp`)
  if (p.convidadosSemCadastro > 0) partes.push(`${p.convidadosSemCadastro} ${p.convidadosSemCadastro === 1 ? 'convidado que ainda não se cadastrou' : 'convidados que ainda não se cadastraram'}`)
  if (!partes.length) return null
  return partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`
}
