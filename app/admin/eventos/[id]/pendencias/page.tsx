import { redirect } from 'next/navigation'

/**
 * Redirecionamento — esta tela virou a visão "Ainda não chegaram" de
 * `/presenca`. Ver o comentário no topo daquele arquivo: eram duas telas
 * respondendo "quem fez, quem não fez" de dois jeitos diferentes o bastante
 * pra confundir qual confiar.
 *
 * O redirect existe para quem tinha o link salvo (favorito, mensagem antiga
 * de WhatsApp já entregue) não cair num 404 depois da fusão. `dia` é o único
 * parâmetro que esta tela aceitava — repassado como está.
 */
export default async function PendenciasRedirect({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ dia?: string }>
}) {
  const { id } = await params
  const { dia } = await searchParams
  redirect(`/admin/eventos/${id}/presenca?ver=faltam${dia ? `&dia=${dia}` : ''}`)
}
