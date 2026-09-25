import { redirect } from 'next/navigation'
import { QrCode } from 'lucide-react'
import { getPerfil, eventosEscaneaveis } from '@/lib/supabase-server'
import { podeEscanear } from '@/lib/permissions'
import { PageHeader, Secao, EmptyState } from '@/components/ui/Superficie'
import ScannerView from '@/app/scan/ScannerView'

export const revalidate = 0

/**
 * O mesmo scanner do portão (`/scan`), só que DENTRO do painel, com o menu do
 * lado — pedido do Juan (25/09/2026): admin e supervisor escaneiam sem sair
 * do sistema. O operador de portão continua na tela cheia de `/scan`, que é
 * o posto de trabalho dele no celular.
 *
 * Mesmas regras de `/scan`: só eventos acontecendo hoje (`eventosEscaneaveis`),
 * e o servidor confere tudo de novo a cada leitura — o supervisor só registra
 * a própria equipe (ver `registrarPresencaQR`).
 */
export default async function ScannerNoPainelPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const [{ evento }, perfil] = await Promise.all([searchParams, getPerfil()])
  if (!perfil) redirect('/login')
  if (!podeEscanear(perfil)) redirect('/admin')

  const eventos = await eventosEscaneaveis(perfil)
  const descricao = perfil.role === 'supervisor'
    ? 'Leia o QR da credencial de quem é da sua equipe — entrada e saída.'
    : 'Leia o QR da credencial ou do veículo — entrada e saída.'

  return (
    <div className="space-y-5">
      <PageHeader titulo="Scanner" descricao={descricao} />
      {!eventos.length ? (
        <Secao>
          <EmptyState
            icone={<QrCode className="w-8 h-8" />}
            titulo="Nenhum evento acontecendo hoje"
            descricao="O scanner só abre no dia do evento (ou num dia de montagem e desmontagem)."
          />
        </Secao>
      ) : (
        <ScannerView eventos={eventos} initialEventoId={evento} noPainel />
      )}
    </div>
  )
}
