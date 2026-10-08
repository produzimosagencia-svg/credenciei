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
 * MONTAGEM E DESMONTAGEM NUNCA PEDEM O MEIO — só o DIA DO EVENTO (`jornada_dias.tipo = 'principal'`). Regra do
 * Juan, repetida em 08/10/2026 (VITAL: montagem de quinta a sexta, evento sábado e domingo). Vale antes da chave do
 * dia: um dia de montagem com `exige_meio` ligado continua sem meio.
 */
const ehDiaDoEvento = (tipo: unknown) => tipo === 'principal'

/**
 * Este dia da operação pede o meio? Só se for dia DO EVENTO e a chave do dia estiver ligada.
 *
 * Erro/migração pendente ⇒ SIM. O `true` no fallback não é descuido: é o padrão da coluna. Antes da migração, todo
 * dia pedia o meio — devolver `false` aqui silenciaria o meio do evento inteiro em vez de preservar o
 * comportamento anterior. Data sem linha nenhuma (evento sem dias configurados) também segue o padrão.
 */
export async function diaExigeMeio(eventoId: string, data: string): Promise<boolean> {
  const { data: linhas, error } = await supabase
    .from('jornada_dias').select('tipo, exige_meio')
    .eq('evento_id', eventoId).eq('data', data).eq('cancelado', false)
  if (error) return true
  if (!linhas?.length) return true
  return linhas.some(d => ehDiaDoEvento(d.tipo) && d.exige_meio !== false)
}

/** Os dias deste evento que pedem o meio — só dias DO EVENTO, com a chave ligada. Erro ⇒ todos (mesmo motivo acima). */
export async function diasComMeio(eventoId: string): Promise<{ ok: boolean; dias: Set<string> }> {
  const { data, error } = await supabase
    .from('jornada_dias').select('data, tipo, exige_meio').eq('evento_id', eventoId)
  if (error) return { ok: false, dias: new Set() }
  return { ok: true, dias: new Set((data ?? []).filter(d => ehDiaDoEvento(d.tipo) && d.exige_meio !== false).map(d => d.data as string)) }
}
