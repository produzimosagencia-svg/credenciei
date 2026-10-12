import { redirect } from 'next/navigation'
import Documento from '@/components/relatorio-doc/Documento'
import Folhas from '@/components/relatorio-doc/Folhas'
import { paginar, carimboDoSistema } from '@/lib/relatorio-doc'
import { obterDadosRelatorioEvento, obterDadosRelatorioSetor, type Periodo } from '@/lib/relatorios'
import { exigirAcessoAoEvento } from '@/lib/relatorios-acesso'
import { relatorioForaDoLocal } from '@/lib/alertas-local'
import { setoresComMeio, diasComMeio } from '@/lib/meio'
import { supabaseAdmin, buscarTudo } from '@/lib/supabase-server'
import { montarPresenca, montarAusentes } from '@/lib/relatorio-doc-presenca'
import { nomeBonito } from '@/lib/relatorio-doc-fechamento'

export const revalidate = 0

/**
 * Presença em PDF no padrão do modelo (docs/modelo de relatorio .pdf) — a versão resumida e completa do relatório; as
 * planilhas continuam. `?de=&ate=` (período), `?setor=` (um fornecedor só), `?quem=ausentes` (quem não bateu ponto).
 */
export default async function PresencaPdf({
  params, searchParams,
}: {
  params: Promise<{ eventoId: string }>
  searchParams: Promise<{ de?: string; ate?: string; setor?: string; quem?: string }>
}) {
  const { eventoId } = await params
  const q = await searchParams
  const valida = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined)
  const periodo: Periodo | undefined = valida(q.de) && valida(q.ate) ? { de: q.de!, ate: q.ate! } : undefined

  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) {
    if (acesso.erro === 'Não autenticado.') redirect('/login')
    return <p style={{ padding: 32, fontFamily: 'system-ui' }}>{acesso.erro}</p>
  }
  const r = q.setor ? await obterDadosRelatorioSetor(eventoId, q.setor, periodo) : await obterDadosRelatorioEvento(eventoId, periodo)
  if ('erro' in r) return <p style={{ padding: 32, fontFamily: 'system-ui' }}>{r.erro}</p>
  const dados = r.dados

  const { data: forns } = await supabaseAdmin.from('fornecedores').select('id, nome, subeventos(nome)').eq('evento_id', eventoId)
  const areaDoSetor = new Map((forns ?? []).map(f => [f.id as string, (f.subeventos as unknown as { nome?: string } | null)?.nome ?? '']))
  const ausentes = q.quem === 'ausentes'
  const umSetor = q.setor ? dados.setores.find(s => s.id === q.setor) : null
  const rotuloEvento = `${dados.eventoNome}${umSetor ? ` · ${nomeBonito(umSetor.nome)}` : ''}`
  const nomeArquivo = `${ausentes ? 'Quem não credenciou' : 'Presença'} - ${dados.eventoNome}${umSetor ? ` - ${umSetor.nome}` : ''}`

  if (ausentes) {
    return (
      <Documento nomeArquivo={nomeArquivo}>
        <Folhas folhas={paginar(montarAusentes(dados, areaDoSetor))} rotuloEvento={rotuloEvento} carimbo={carimboDoSistema()} />
      </Documento>
    )
  }

  // Os meios do período (o do bloco atual em `registros`; os de blocos anteriores ficam na pausa — meio por bloco).
  const idsDoRelatorio = new Set(dados.setores.flatMap(s => s.linhas.map(l => l.funcionarioId)))
  const meiosDoDia = new Map<string, string[]>()
  const juntar = (funcId: string, dia: string, quando: string) => {
    if (!idsDoRelatorio.has(funcId)) return
    const k = `${funcId}|${dia}`
    meiosDoDia.set(k, [...(meiosDoDia.get(k) ?? []), quando])
  }
  const meios = await buscarTudo<Record<string, unknown>>((de, ate) => supabaseAdmin.from('registros')
    .select('funcionario_id, data_ref, created_at').eq('evento_id', eventoId).eq('tipo', 'meio')
    .gte('data_ref', dados.periodo.de).lte('data_ref', dados.periodo.ate).order('id').range(de, ate) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>,
  ).catch(() => [] as Record<string, unknown>[])
  for (const m of meios) juntar(m.funcionario_id as string, m.data_ref as string, m.created_at as string)
  const { data: meiosDePausa, error: erroPausa } = await supabaseAdmin.from('pausas_turno')
    .select('funcionario_id, data_ref, meio_em').eq('evento_id', eventoId).not('meio_em', 'is', null)
    .gte('data_ref', dados.periodo.de).lte('data_ref', dados.periodo.ate)
  if (!erroPausa) for (const p of meiosDePausa ?? []) juntar(p.funcionario_id as string, p.data_ref as string, p.meio_em as string)

  const [comMeio, diasMeio] = await Promise.all([setoresComMeio(dados.setores.map(s => s.id)), diasComMeio(eventoId)])
  const pedeMeio = (setorId: string, dia: string) => comMeio.has(setorId) && (!diasMeio.ok || diasMeio.dias.has(dia))

  // Fora do local, com prova, no período e nos setores deste relatório.
  const setoresPermitidos = acesso.setoresPermitidos ? dados.setores.map(s => ({ id: s.id, nome: s.nome })) : null
  const fora = await relatorioForaDoLocal(eventoId, setoresPermitidos).catch(() => null)
  const idsSetores = new Set(dados.setores.map(s => s.id))
  const diaBRT = (iso: string) => new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const foraDoLocal = !fora || !fora.localConfigurado ? null : fora.linhas.filter(l =>
    (!l.setorId || idsSetores.has(l.setorId)) && diaBRT(l.quando) >= dados.periodo.de && diaBRT(l.quando) <= dados.periodo.ate)

  const secoes = montarPresenca(dados, { areaDoSetor, meiosDoDia, pedeMeio, foraDoLocal, raioM: fora?.raioM ?? null })
  return (
    <Documento nomeArquivo={nomeArquivo}>
      <Folhas folhas={paginar(secoes)} rotuloEvento={rotuloEvento} carimbo={carimboDoSistema()} />
    </Documento>
  )
}
