import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui/Superficie'
import { obterRelatorioBiometria } from '@/lib/biometria-relatorio'
import RelatorioBiometriaView from './RelatorioBiometriaView'

export const revalidate = 0

/**
 * Quantas tentativas de biometria deram certo, erraram e por quê — pra
 * calibrar `LIMIAR_PADRAO`/`MARGEM_MINIMA` (lib/biometria.ts) com dados
 * reais em vez de no chute.
 *
 * A checagem de acesso mora em `obterRelatorioBiometria` (mesma régua de
 * `lib/relatorios.ts`: master vê tudo, admin só a própria organização) —
 * não duplicada aqui, pelo mesmo motivo de sempre.
 */
export default async function BiometriaRelatorioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: eventoId } = await params
  const relatorio = await obterRelatorioBiometria(eventoId)
  if ('erro' in relatorio) redirect('/admin')

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Biometria — tentativas de reconhecimento"
        descricao={`${relatorio.eventoNome} — o quanto o reconhecimento facial está acertando`}
        voltarPara={`/admin/eventos/${eventoId}`}
      />
      <RelatorioBiometriaView relatorio={relatorio} />
    </div>
  )
}
