import { redirect } from 'next/navigation'

/**
 * A lista de eventos foi para dentro do Painel (/admin).
 *
 * Eram duas telas pro mesmo conteúdo: o Painel já mostrava uma lista
 * encolhida com "ver todos", e esta repetia a mesma coisa por inteiro.
 *
 * A rota continua existindo só para redirecionar — link antigo, favorito e
 * histórico do navegador continuam funcionando em vez de dar 404. As rotas
 * filhas (/admin/eventos/novo e /admin/eventos/[id]) não são afetadas.
 */
export default function EventosPage() {
  redirect('/admin')
}
