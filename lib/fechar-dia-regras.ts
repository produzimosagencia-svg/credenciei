import { ehMaster } from './permissions'

/**
 * Quem pode usar o "Fechar o dia" (lib/actions-fechar-dia.ts). Por enquanto SÓ O MASTER (Juan, 14/10/2026: "deixa
 * habilitado no momento somente para o master; quando eu conversar com os sócios, subimos para o supervisor").
 * Para liberar para quem gerencia o evento e o supervisor da equipe, troque para `false` — o resto da regra (o
 * supervisor só fecha o dia da própria equipe) já está pronto no servidor.
 */
export const FECHAR_DIA_SO_MASTER = true

export function podeUsarFecharDia(role: string | null | undefined): boolean {
  return !FECHAR_DIA_SO_MASTER || ehMaster(role as string)
}
