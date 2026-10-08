import 'server-only'
import { supabaseAdmin } from './supabase-server'
import { diaBRT } from './janelas'
import { descreverDistancia } from './geo-local'

/**
 * O alerta de "bateu fora do local do evento" — pedido do Juan (08/10/2026): quando o aparelho de quem registrou
 * (operador ou a própria pessoa) estava fora do raio do local configurado em Editar evento, isso precisa aparecer
 * para quem administra, não só ficar escondido na ficha de cada pessoa. Só admin/master veem (a marca em si já é
 * assim — ver `app/admin/eventos/[id]/fornecedor/[fid]/page.tsx`).
 *
 * Tolerante: sem a migração (upgrade-geolocalizacao-operador.sql) ou sem local configurado, a consulta não acha
 * nada marcado — o alerta simplesmente não aparece, sem quebrar a tela.
 */
export type BatidaForaDoLocal = {
  id: string
  nome: string
  setorNome: string | null
  tipo: 'entrada' | 'meio' | 'fim'
  criadoEm: string
  distanciaTexto: string | null
}

const ROTULO_TIPO: Record<string, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

export async function batidasForaDoLocalHoje(eventoId: string): Promise<BatidaForaDoLocal[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('registros')
      .select('id, tipo, created_at, distancia_m, funcionarios!inner(nome, fornecedores(nome))')
      .eq('evento_id', eventoId)
      .eq('data_ref', diaBRT())
      .eq('fora_do_local', true)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return []
    return (data ?? []).map(r => ({
      id: r.id as string,
      nome: (r.funcionarios as unknown as { nome: string } | null)?.nome ?? '—',
      setorNome: (r.funcionarios as unknown as { fornecedores?: { nome?: string } | null } | null)?.fornecedores?.nome ?? null,
      tipo: (ROTULO_TIPO[r.tipo as string] ? (r.tipo as 'entrada' | 'meio' | 'fim') : 'entrada'),
      criadoEm: r.created_at as string,
      distanciaTexto: typeof r.distancia_m === 'number' ? descreverDistancia(r.distancia_m) : null,
    }))
  } catch {
    return []
  }
}

export { ROTULO_TIPO }
