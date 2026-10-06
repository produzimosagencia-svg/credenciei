import { consultarConviteSenhaSupervisor } from '@/lib/supervisor-convite'
import ConteudoCriarSenha from './ConteudoCriarSenha'

export const dynamic = 'force-dynamic'

/**
 * Criar senha — serve a DOIS links: o primeiro acesso do supervisor e o
 * "Esqueci a senha" (`finalidade` no convite). Mesma moldura do login
 * (`CartaoDeEntrada`); a recuperação não fala de evento nem de fornecedor.
 */
export default async function CriarSenhaSupervisorPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const convite = await consultarConviteSenhaSupervisor(token)
  return <ConteudoCriarSenha convite={convite} token={token} />
}
