import { redirect } from 'next/navigation'
import Documento from '@/components/relatorio-doc/Documento'
import Folhas from '@/components/relatorio-doc/Folhas'
import { paginar, carimboDoSistema } from '@/lib/relatorio-doc'
import { obterRelatorioExtra, type TipoRelatorioExtra } from '@/lib/relatorios-extras'
import { montarExtra } from '@/lib/relatorio-doc-extra'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'

export const revalidate = 0

const TIPOS: TipoRelatorioExtra[] = ['aguardando', 'cadastros', 'hoje', 'pedidos_setor', 'veiculos', 'subeventos', 'bloqueios', 'auditoria']

/** Os "Outros relatórios" em PDF, no padrão do modelo (docs/modelo de relatorio .pdf). A permissão é a da planilha. */
export default async function ExtraPdf({ params }: { params: Promise<{ eventoId: string; tipo: string }> }) {
  const { eventoId, tipo } = await params
  if (!(await getPerfil())) redirect('/login')
  if (!TIPOS.includes(tipo as TipoRelatorioExtra)) return <p style={{ padding: 32, fontFamily: 'system-ui' }}>Relatório não encontrado.</p>
  const r = await obterRelatorioExtra(eventoId, tipo as TipoRelatorioExtra)
  if ('erro' in r) return <p style={{ padding: 32, fontFamily: 'system-ui' }}>{r.erro}</p>
  const { data: evento } = await supabaseAdmin.from('eventos').select('nome').eq('id', eventoId).maybeSingle()
  const { secoes, paisagem } = montarExtra(r.relatorio)
  return (
    <Documento nomeArquivo={r.relatorio.titulo} paisagem={paisagem}>
      <Folhas folhas={paginar(secoes, { paisagem })} rotuloEvento={(evento?.nome as string | undefined) ?? ''} carimbo={carimboDoSistema()} />
    </Documento>
  )
}
