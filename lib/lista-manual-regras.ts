/*
 * LISTA MANUAL — entrada sem QR Code (Juan, 16/10/2026). Regras puras, sem banco e sem 'use server': a tela e as
 * actions (lib/actions-lista-manual.ts) usam as mesmas. A tabela é `lista_manual` (supabase/upgrade-lista-manual.sql).
 */
import { validarCpf, chaveBusca } from './format'

/** As categorias de sempre. Dá para digitar uma nova no cadastro — ela passa a ser oferecida no evento. */
export const CATEGORIAS_PADRAO = ['Convidado / Lista VIP', 'Prestador de serviço', 'Equipe / Colaborador', 'Outro'] as const

const TAMANHO_MAXIMO_CATEGORIA = 40

/** Uma pessoa da lista, como a tela recebe. `cpf` (inteiro) só vem para quem gerencia a lista; os outros só veem a máscara. */
export type PessoaDaLista = {
  id: string
  nome: string
  cpf: string | null
  cpfMascarado: string | null
  telefone: string | null
  categoria: string
  /** A entrada confirmada na portaria; nulo = ainda não chegou. */
  presenteEm: string | null
  confirmadoPor: string | null
  criadoEm: string
  criadoPor: string | null
}

export type DadosDaPessoa = { nome: string; cpf: string | null; telefone: string | null; categoria: string }

/** "***.456.789-**" — o meio, que dá para conferir com o documento sem expor o CPF inteiro. */
export function mascararCpf(cpf: string | null | undefined): string | null {
  const d = (cpf ?? '').replace(/\D/g, '')
  if (d.length !== 11) return null
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

/** A categoria como fica gravada: espaços arrumados, no máximo 40 letras, e com a grafia da padrão quando é uma delas. */
export function normalizarCategoria(c: unknown): string {
  const texto = String(c ?? '').replace(/\s+/g, ' ').trim().slice(0, TAMANHO_MAXIMO_CATEGORIA).trim()
  if (!texto) return ''
  return CATEGORIAS_PADRAO.find(p => chaveBusca(p) === chaveBusca(texto)) ?? texto
}

/** As categorias para escolher: as padrão e, depois, as que já foram criadas neste evento (sem repetir). */
export function categoriasParaEscolher(usadas: readonly string[]): string[] {
  const lista: string[] = [...CATEGORIAS_PADRAO]
  for (const c of usadas) {
    const n = normalizarCategoria(c)
    if (n && !lista.some(x => chaveBusca(x) === chaveBusca(n))) lista.push(n)
  }
  return lista
}

/** Telefone só com dígitos, com DDD — sem o 55 do país nem o 0 da operadora na frente. */
export function normalizarTelefone(t: unknown): string {
  let d = String(t ?? '').replace(/\D/g, '')
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2)
  if (d.length === 12 && d.startsWith('0')) d = d.slice(1)
  return d
}

/** Confere e normaliza o que veio do formulário — a mesma régua na tela e no servidor. */
export function lerPessoaDaLista(entrada: { nome?: unknown; cpf?: unknown; telefone?: unknown; categoria?: unknown }):
  { ok: true; dados: DadosDaPessoa } | { ok: false; erro: string } {
  const nome = String(entrada.nome ?? '').replace(/\s+/g, ' ').trim()
  if (!nome) return { ok: false, erro: 'Escreva o nome completo.' }
  if (nome.length > 120) return { ok: false, erro: 'Nome muito longo — confira o que foi digitado.' }
  if (/\d/.test(nome)) return { ok: false, erro: 'O nome não pode ter números.' }
  if (nome.split(' ').filter(p => p.length >= 2).length < 2) return { ok: false, erro: 'Escreva o nome completo (nome e sobrenome).' }

  const cpf = String(entrada.cpf ?? '').replace(/\D/g, '')
  if (cpf && !validarCpf(cpf)) return { ok: false, erro: 'CPF inválido. Confira os 11 dígitos — ou deixe em branco.' }

  const telefone = normalizarTelefone(entrada.telefone)
  if (telefone && (telefone.length < 10 || telefone.length > 11)) return { ok: false, erro: 'Telefone inválido — use o DDD e o número.' }

  const categoria = normalizarCategoria(entrada.categoria)
  if (!categoria) return { ok: false, erro: 'Escolha a categoria (ou escreva uma nova).' }

  return { ok: true, dados: { nome, cpf: cpf || null, telefone: telefone || null, categoria } }
}

/**
 * A pessoa bate com a busca? Nome sem acento nem caixa; e, para quem vê o CPF inteiro, os dígitos digitados contra o
 * CPF. (Quem só vê a máscara busca o CPF pelo servidor — ver `buscarCpfNaListaManual`.)
 */
export function bateComABusca(p: Pick<PessoaDaLista, 'nome' | 'cpf'>, termo: string): boolean {
  const t = chaveBusca(termo)
  if (!t) return true
  if (chaveBusca(p.nome).includes(t)) return true
  const digitos = termo.replace(/\D/g, '')
  return digitos.length >= 3 && !!p.cpf && p.cpf.includes(digitos)
}
