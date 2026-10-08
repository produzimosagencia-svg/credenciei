// Framework-agnostic de propósito, igual a `lib/pendencias.ts` e
// `lib/mensagens.ts`: o worker de WhatsApp que roda na VPS (fora do Next.js)
// também precisa desta regra, e ele não tem os cookies de que
// `lib/supabase-server.ts` depende. Por isso o cliente é montado aqui.
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

/**
 * Quando o MEIO é pedido — a regra inteira, num lugar só.
 *
 * São DUAS chaves, e as duas precisam estar ligadas:
 *   • o SETOR da pessoa (`fornecedores.exige_meio`, nasce desligado) —
 *     ver supabase/upgrade-meio-por-setor.sql;
 *   • o DIA da operação (`jornada_dias.exige_meio`, nasce ligado) —
 *     ver supabase/upgrade-meio-por-dia.sql.
 *
 * Esta regra é lida em quatro lugares diferentes (credencial, pendências,
 * agendamento de WhatsApp e a tela de configuração). Espalhada, ela
 * divergiria no primeiro ajuste — e divergência aqui custa dinheiro: são
 * duas mensagens cobradas por pessoa por dia.
 *
 * ── Por que TODA leitura aqui é uma consulta separada e tolerante a erro ──
 *
 * As duas colunas são novas. No Supabase, pedir uma coluna que ainda não
 * existe derruba a consulta INTEIRA, não só aquele campo — foi assim que a
 * tela do evento apareceu com "nenhum fornecedor ainda" em produção, com 33
 * setores e 387 pessoas intactos no banco. Isoladas aqui, a falha custa no
 * máximo o recurso novo e nunca a tela.
 *
 * O fallback de cada uma segue o PADRÃO da respectiva coluna, não um valor
 * conveniente: setor sem resposta = não pede (padrão dele), dia sem resposta
 * = pede (padrão dele). Assim, antes de a migração rodar, o sistema se
 * comporta exatamente como se comportava antes dela.
 */

/** Quais destes setores pedem o meio. Erro/migração pendente ⇒ nenhum. */
export async function setoresComMeio(fornecedorIds: string[]): Promise<Set<string>> {
  if (!fornecedorIds.length) return new Set()
  const { data, error } = await supabase
    .from('fornecedores').select('id, exige_meio').in('id', fornecedorIds)
  if (error) return new Set()
  return new Set((data ?? []).filter(f => f.exige_meio === true).map(f => f.id as string))
}

/** Um setor específico pede o meio? Erro/migração pendente ⇒ não. */
export async function setorExigeMeio(fornecedorId: string | null | undefined): Promise<boolean> {
  if (!fornecedorId) return false
  const { data, error } = await supabase
    .from('fornecedores').select('exige_meio').eq('id', fornecedorId).maybeSingle()
  if (error) return false
  return data?.exige_meio === true
}

/**
 * MONTAGEM E DESMONTAGEM NÃO PEDEM O MEIO, a não ser que alguém LIGUE naquele dia (regra do Juan, 08/10/2026 —
 * VITAL: montagem de quinta a sexta, evento sábado e domingo):
 *   - dia do EVENTO (`tipo = 'principal'`): pede, a não ser que a chave do dia esteja desligada (`exige_meio`);
 *   - dia de montagem/desmontagem: só pede com `meio_fora_do_evento` ligado (nasce desligado —
 *     supabase/upgrade-meio-montagem.sql). Sem essa coluna no banco, não pede.
 */
type LinhaDia = { tipo?: string | null; exige_meio?: boolean | null; meio_fora_do_evento?: boolean | null }
export const diaPedeMeio = (d: LinhaDia) =>
  d.tipo === 'principal' ? d.exige_meio !== false : d.meio_fora_do_evento === true

/** As linhas de `jornada_dias` com as colunas do meio — tolerante: sem a coluna nova, lê sem ela. */
async function lerDias(eventoId: string, data?: string): Promise<{ ok: boolean; linhas: (LinhaDia & { data: string })[] }> {
  const consulta = (colunas: string) => {
    let q = supabase.from('jornada_dias').select(colunas).eq('evento_id', eventoId).eq('cancelado', false)
    if (data) q = q.eq('data', data)
    return q
  }
  const comNova = await consulta('data, tipo, exige_meio, meio_fora_do_evento')
  if (!comNova.error) return { ok: true, linhas: (comNova.data ?? []) as unknown as (LinhaDia & { data: string })[] }
  const semNova = await consulta('data, tipo, exige_meio')
  if (!semNova.error) return { ok: true, linhas: (semNova.data ?? []) as unknown as (LinhaDia & { data: string })[] }
  return { ok: false, linhas: [] }
}

/**
 * Este dia da operação pede o meio? Erro de consulta ⇒ SIM (o padrão da coluna antes desta regra: devolver `false`
 * silenciaria o meio do evento inteiro). Data sem linha nenhuma (evento sem dias configurados) também segue o padrão.
 */
export async function diaExigeMeio(eventoId: string, data: string): Promise<boolean> {
  const { ok, linhas } = await lerDias(eventoId, data)
  if (!ok || !linhas.length) return true
  return linhas.some(diaPedeMeio)
}

/** Os dias deste evento que pedem o meio. Erro ⇒ conjunto vazio com `ok: false` (quem chama decide). */
export async function diasComMeio(eventoId: string): Promise<{ ok: boolean; dias: Set<string> }> {
  const { ok, linhas } = await lerDias(eventoId)
  if (!ok) return { ok: false, dias: new Set() }
  return { ok: true, dias: new Set(linhas.filter(diaPedeMeio).map(d => d.data)) }
}
