import { redirect } from 'next/navigation'
import Documento from '@/components/relatorio-doc/Documento'
import Folhas from '@/components/relatorio-doc/Folhas'
import { paginar, carimboDoSistema } from '@/lib/relatorio-doc'
import { obterRelatorioForaDoLocal } from '@/lib/actions'
import { secaoForaDoLocal } from '@/lib/relatorio-doc-presenca'
import { getPerfil } from '@/lib/supabase-server'

export const revalidate = 0

/** "Fora do local" em PDF no padrão do modelo — só o que tem prova (GPS de até 100 m). */
export default async function ForaDoLocalPdf({ params }: { params: Promise<{ eventoId: string }> }) {
  const { eventoId } = await params
  if (!(await getPerfil())) redirect('/login')
  const r = await obterRelatorioForaDoLocal(eventoId)
  if (!r.ok) return <p style={{ padding: 32, fontFamily: 'system-ui' }}>{r.error}</p>
  const secao = { ...secaoForaDoLocal(r.relatorio.localConfigurado ? r.relatorio.linhas : null, r.relatorio.raioM), rotulo: `Fora do local · ${r.eventoInteiro ? 'todo o evento' : 'meus setores'}` }
  return (
    <Documento nomeArquivo={`Fora do local - ${r.eventoNome}`}>
      <Folhas folhas={paginar([secao])} rotuloEvento={r.eventoNome} carimbo={carimboDoSistema()} />
    </Documento>
  )
}
