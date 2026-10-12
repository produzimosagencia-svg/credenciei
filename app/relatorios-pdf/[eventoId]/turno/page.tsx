import { redirect } from 'next/navigation'
import Documento from '@/components/relatorio-doc/Documento'
import Folhas from '@/components/relatorio-doc/Folhas'
import { paginar, carimboDoSistema } from '@/lib/relatorio-doc'
import { relatorioFechamentoDoTurno } from '@/lib/relatorio-doc-turno'

export const revalidate = 0

/** Fechamento do turno em PDF, no padrão do modelo (docs/modelo de relatorio .pdf). `?dia=AAAA-MM-DD`. */
export default async function FechamentoDoTurnoPdf({
  params, searchParams,
}: {
  params: Promise<{ eventoId: string }>
  /** `?dia=AAAA-MM-DD` e `?escopo=todas` (padrão: só as equipes pagas por pessoa, como o modelo). */
  searchParams: Promise<{ dia?: string; escopo?: string }>
}) {
  const { eventoId } = await params
  const { dia, escopo } = await searchParams
  const r = await relatorioFechamentoDoTurno(eventoId, dia, escopo === 'todas' ? 'todas' : 'pagas')
  if ('erro' in r) {
    if (r.erro === 'Não autenticado.') redirect('/login')
    return <p style={{ padding: 32, fontFamily: 'system-ui' }}>{r.erro}</p>
  }
  return (
    <Documento nomeArquivo={`Fechamento do turno - ${r.eventoNome} - ${r.dia.split('-').reverse().join('-')}`}>
      <Folhas folhas={paginar(r.secoes)} rotuloEvento={r.rotuloEvento} carimbo={carimboDoSistema()} />
    </Documento>
  )
}
