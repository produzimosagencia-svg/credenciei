export type Papel = 'user' | 'assistant'
/**
 * `tipo` só muda a cara do cartão: exclusão pede vermelho e alarme, criação em
 * lote pede um aviso sóbrio. A trava é a mesma nos dois casos.
 */
export type Confirmacao = {
  operacao: string
  resumo: string
  impacto: Record<string, unknown>
  tipo?: 'excluir' | 'criar'
}
export type Mensagem = {
  papel: Papel
  texto: string
  ferramenta?: string | null
  confirmacoes?: Confirmacao[]
  erro?: string
}

export type Conversa = {
  id: string
  titulo: string
  atualizadaEm: number
  mensagens: Mensagem[]
}

/**
 * Histórico das conversas com a IA.
 *
 * Fica no navegador, separado por usuário — mesma escolha do tutorial. Não vai
 * pro banco de propósito: conversa de suporte é rascunho, e guardar no servidor
 * significaria reter CPF e telefone que apareceram na conversa por tempo
 * indeterminado. Custo: o histórico não acompanha a pessoa entre aparelhos.
 */
const LIMITE = 30

function chave(usuarioId: string) {
  return `credenciei:ia:conversas:${usuarioId}`
}

export function carregarConversas(usuarioId: string): Conversa[] {
  if (typeof window === 'undefined') return []
  try {
    const bruto = localStorage.getItem(chave(usuarioId))
    if (!bruto) return []
    const lista = JSON.parse(bruto)
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

/** Título = primeira coisa que a pessoa perguntou, cortada. */
export function tituloDe(mensagens: Mensagem[]): string {
  const primeira = mensagens.find(m => m.papel === 'user' && m.texto.trim())
  if (!primeira) return 'Conversa'
  const t = primeira.texto.trim().replace(/\s+/g, ' ')
  return t.length > 46 ? t.slice(0, 46) + '…' : t
}

export function salvarConversa(usuarioId: string, conversa: Conversa): Conversa[] {
  if (typeof window === 'undefined') return []
  // Conversa sem pergunta nenhuma não vira histórico.
  if (!conversa.mensagens.some(m => m.papel === 'user' && m.texto.trim())) {
    return carregarConversas(usuarioId)
  }
  const atual = carregarConversas(usuarioId).filter(c => c.id !== conversa.id)
  const lista = [{ ...conversa, titulo: tituloDe(conversa.mensagens), atualizadaEm: Date.now() }, ...atual]
    .slice(0, LIMITE)
  try {
    localStorage.setItem(chave(usuarioId), JSON.stringify(lista))
  } catch {
    // localStorage cheio: descarta as mais antigas e tenta de novo uma vez.
    try {
      localStorage.setItem(chave(usuarioId), JSON.stringify(lista.slice(0, 10)))
    } catch { /* desiste em silêncio — perder histórico não pode quebrar o chat */ }
  }
  return lista
}

export function apagarConversa(usuarioId: string, id: string): Conversa[] {
  const lista = carregarConversas(usuarioId).filter(c => c.id !== id)
  try {
    localStorage.setItem(chave(usuarioId), JSON.stringify(lista))
  } catch { /* idem */ }
  return lista
}

export function novaConversa(): Conversa {
  return {
    id: (globalThis.crypto?.randomUUID?.() ?? String(Date.now())),
    titulo: 'Nova conversa',
    atualizadaEm: Date.now(),
    mensagens: [],
  }
}

export function quandoRelativo(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'ontem'
  if (d < 7) return `há ${d} dias`
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}
