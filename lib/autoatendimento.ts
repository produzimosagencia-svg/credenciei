// Framework-agnostic de propósito, igual a lib/meio.ts: o worker/outras pontas não precisam dos cookies de
// lib/supabase-server.ts. As regras puras moram em lib/autoatendimento-regras.ts (sem import de banco, testável
// sozinhas); aqui só a leitura, tolerante à migração pendente.
import { createClient } from '@supabase/supabase-js'
import { liberadoAgora, type ConfigAutoatendimento } from './autoatendimento-regras'

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

/** Atalho: está liberado AGORA neste evento? (combina `obterAutoatendimento` + `liberadoAgora`.) */
export async function autoatendimentoLiberadoAgora(eventoId: string | null | undefined): Promise<boolean> {
  return liberadoAgora(await obterAutoatendimento(eventoId))
}
