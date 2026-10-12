import { redirect } from 'next/navigation'
import Documento from '@/components/relatorio-doc/Documento'
import Folhas from '@/components/relatorio-doc/Folhas'
import { paginar, carimboDoSistema } from '@/lib/relatorio-doc'
import { obterDadosRelatorioSubevento, type Periodo } from '@/lib/relatorios'
import { montarSubgrupoDoc } from '@/lib/relatorio-doc-outros'
import { nomeBonito } from '@/lib/relatorio-doc-fechamento'
import { getPerfil } from '@/lib/supabase-server'

export const revalidate = 0

/** Relatório do subgrupo em PDF no padrão do modelo. `?de=&ate=` (período). */
export default async function SubgrupoPdf({
  params, searchParams,
}: {
  params: Promise<{ eventoId: string; subgrupoId: string }>
  searchParams: Promise<{ de?: string; ate?: string }>
}) {
  const { eventoId, subgrupoId } = await params
  const q = await searchParams
  if (!(await getPerfil())) redirect('/login')
  const valida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined)
  const periodo: Periodo | undefined = valida(q.de) && valida(q.ate) ? { de: q.de!, ate: q.ate! } : undefined
  const r = await obterDadosRelatorioSubevento(eventoId, subgrupoId, periodo)
  if ('erro' in r) return <p style={{ padding: 32, fontFamily: 'system-ui' }}>{r.erro}</p>
  return (
    <Documento nomeArquivo={`Subgrupo ${r.dados.subeventoNome} - ${r.dados.eventoNome}`}>
      <Folhas folhas={paginar(montarSubgrupoDoc(r.dados))} rotuloEvento={`${r.dados.eventoNome} · ${nomeBonito(r.dados.subeventoNome)}`} carimbo={carimboDoSistema()} />
    </Documento>
  )
}
