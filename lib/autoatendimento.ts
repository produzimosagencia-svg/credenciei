// Framework-agnostic de propósito, igual a lib/meio.ts: o worker/outras pontas não precisam dos cookies de
// lib/supabase-server.ts. As regras puras moram em lib/autoatendimento-regras.ts (sem import de banco, testável
// sozinhas); aqui só a leitura, tolerante à migração pendente.
import { createClient } from '@supabase/supabase-js'
import { janelaLiberada, type ConfigAutoatendimento } from './autoatendimento-regras'

export * from './autoatendimento-regras'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

const CONFIG_VAZIA: ConfigAutoatendimento = { habilitado: false, inicio: null, fim: null, ativadoEm: null, ativadoPor: null }

/** A configuração do evento. Tolerante: sem a migração, ou evento não encontrado, devolve tudo desligado. */
export async function obterAutoatendimento(eventoId: string | null | undefined): Promise<ConfigAutoatendimento> {
  if (!eventoId) return CONFIG_VAZIA
  try {
    const { data, error } = await supabase
      .from('eventos')
      .select('autoatendimento_habilitado, autoatendimento_inicio, autoatendimento_fim, autoatendimento_ativado_em, autoatendimento_ativado_por')
      .eq('id', eventoId).maybeSingle()
    if (error || !data) return CONFIG_VAZIA
    const d = data as Record<string, unknown>
    return {
      habilitado: d.autoatendimento_habilitado === true,
      inicio: (d.autoatendimento_inicio as string | null) ?? null,
      fim: (d.autoatendimento_fim as string | null) ?? null,
      ativadoEm: (d.autoatendimento_ativado_em as string | null) ?? null,
      ativadoPor: (d.autoatendimento_ativado_por as string | null) ?? null,
    }
  } catch {
    return CONFIG_VAZIA
  }
}

export type DiaAutoatendimento = {
  data: string
  tipo: 'principal' | 'preparacao'
  fase: 'montagem' | 'evento' | 'desmontagem'
  /** Autoatendimento ligado NESTE dia — nunca true para `tipo === 'principal'` (ver `diaPermiteAutoatendimento`). */
  habilitado: boolean
}

/**
 * Os dias deste evento e se cada um tem autoatendimento ligado (`jornada_dias.autoatendimento_dia`, pedido do
 * Juan, 08/10/2026: "precisa ter como colocar mais de um dia" — um horário só não bastava, porque nem toda
 * montagem/desmontagem precisa do recurso). Tolerante à migração pendente: sem a coluna, devolve `ok: false` e
 * nenhum dia habilitado — quem chama decide o que fazer (a tela avisa que a migração falta rodar).
 */
export async function diasAutoatendimentoDoEvento(eventoId: string): Promise<{ ok: boolean; dias: DiaAutoatendimento[] }> {
  try {
    const { data, error } = await supabase
      .from('jornada_dias').select('data, tipo, autoatendimento_dia')
      .eq('evento_id', eventoId).eq('cancelado', false).order('data')
    if (error) return { ok: false, dias: [] }
    const linhas = data ?? []
    const primeiraPrincipal = linhas.find(d => d.tipo === 'principal')?.data as string | undefined
    return {
      ok: true,
      dias: linhas.map(d => {
        const tipo: DiaAutoatendimento['tipo'] = d.tipo === 'principal' ? 'principal' : 'preparacao'
        return {
          data: d.data as string,
          tipo,
          fase: tipo === 'principal' ? 'evento' : (d.data as string) < (primeiraPrincipal ?? '9999') ? 'montagem' : 'desmontagem',
          habilitado: tipo !== 'principal' && d.autoatendimento_dia === true,
        }
      }),
    }
  } catch {
    return { ok: false, dias: [] }
  }
}

/** Este dia específico tem autoatendimento ligado? Dia principal nunca permite, mesmo que a coluna diga true. */
export async function diaPermiteAutoatendimento(eventoId: string, dia: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('jornada_dias').select('tipo, autoatendimento_dia')
      .eq('evento_id', eventoId).eq('data', dia).eq('cancelado', false).maybeSingle()
    if (error || !data) return false
    return data.tipo !== 'principal' && data.autoatendimento_dia === true
  } catch {
    return false
  }
}

/**
 * Atalho: está liberado AGORA neste evento? Horário de Brasília dentro da janela, ativação do operador valendo
 * para ESTA janela, e o dia em que a janela COMEÇOU marcado em "Em quais dias" — numa janela das 18:00 às 00:25,
 * às 00:10 o dia que conta é o de ontem (é a noite de ontem). Ver lib/autoatendimento-regras.ts.
 */
export async function autoatendimentoLiberadoAgora(eventoId: string | null | undefined): Promise<boolean> {
  if (!eventoId) return false
  const janela = janelaLiberada(await obterAutoatendimento(eventoId))
  if (!janela) return false
  return diaPermiteAutoatendimento(eventoId, janela.diaInicio)
}
