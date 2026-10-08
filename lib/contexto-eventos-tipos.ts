/** Tipos do seletor de evento do topo — sem código de servidor, pra o componente de tela importar. */
export type NoSetor = { id: string; nome: string }
export type NoSubevento = { id: string | null; nome: string | null; setores: NoSetor[] }
export type NoEvento = { id: string; nome: string; ativo: boolean; subeventos: NoSubevento[] }
export type ContextoDeEventos = {
  /** Define o que um toque faz: supervisor entra no setor; Encarregado abre o setor; os demais abrem o evento. */
  modo: 'supervisor' | 'encarregado' | 'organizacao' | 'portao'
  eventos: NoEvento[]
  /** Onde a pessoa está agora, quando o sistema sabe (supervisor: o setor ativo). */
  atual: { eventoId: string | null; setorId: string | null }
}
