import { redirect } from 'next/navigation'
import Documento from '@/components/relatorio-doc/Documento'
import Folhas from '@/components/relatorio-doc/Folhas'
import { paginar, carimboDoSistema } from '@/lib/relatorio-doc'
import { obterRelatorioTravas } from '@/lib/actions'
import { montarLimitesDoc } from '@/lib/relatorio-doc-outros'
import { getPerfil } from '@/lib/supabase-server'

export const revalidate = 0

/** "Limite por dia" em PDF no padrão do modelo: aprovados / limite de cada fornecedor em cada dia. */
export default async function LimitesPdf({ params }: { params: Promise<{ eventoId: string }> }) {
  const { eventoId } = await params
  if (!(await getPerfil())) redirect('/login')
  const r = await obterRelatorioTravas(eventoId)
  if (!r.ok) return <p style={{ padding: 32, fontFamily: 'system-ui' }}>{r.error}</p>
  const { secoes, paisagem } = montarLimitesDoc(r.relatorio)
  return (
    <Documento nomeArquivo={`Limite por dia - ${r.eventoNome}`} paisagem={paisagem}>
      <Folhas folhas={paginar(secoes, { paisagem })} rotuloEvento={r.eventoNome} carimbo={carimboDoSistema()} />
    </Documento>
  )
}
