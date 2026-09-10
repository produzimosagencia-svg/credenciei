/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  AUTORIZAÇÃO — a cola entre a MATRIZ e o banco (escopo de evento/setor)   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * A decisão por PAPEL (+ overrides) vive em lib/autorizacao-matriz.ts, que é
 * puro e testável. AQUI só o que precisa do banco: resolver se o perfil
 * ALCANÇA um evento/setor, e o guard `exigirAcesso` que carrega o perfil.
 *
 * ⚠️ EM DESENVOLVIMENTO — 10/09/2026. NÃO É USADO por nenhuma tela ou action
 * ainda. Fundação da revisão de permissões; liga fase a fase, numa janela sem
 * evento ao vivo. Ver docs/autorizacao.md.
 *
 * ─── POR QUE TODO O PESO ESTÁ AQUI, E NÃO NO RLS ────────────────────────────
 *
 * O banco é lockdown total (upgrade-rls-lockdown.sql): RLS ligado, zero
 * políticas, só a service role entra — e a service role IGNORA o RLS. Ou
 * seja: a barreira real é este código rodando no servidor. Toda Server Action
 * e todo RSC chamam `exigirAcesso` no topo, senão a linha do menu é a única
 * proteção — e menu não é segurança.
 */

import 'server-only'
import { getPerfil, supabaseAdmin } from './supabase-server'
import {
  MATRIZ, acaoLimitadaAoSetor, temAcaoPeloPapel,
  type Acao, type PerfilParaMatriz,
} from './autorizacao-matriz'

export {
  MATRIZ, ACOES, acaoLimitadaAoSetor, temAcaoPeloPapel, acoesDoPapel,
  type Acao, type Escopo, type RegraAcao,
} from './autorizacao-matriz'

type PerfilAutorizavel = (PerfilParaMatriz & {
  id: string
  organizacao_id?: string | null
  fornecedor_id?: string | null
}) | null | undefined

// ─── Resolvedor de escopo (a dimensão "Evento" e "Setor" da matriz) ─────────

/**
 * Este perfil ALCANÇA este evento?
 *
 *   master           → sempre
 *   admin/ger/cli    → evento da própria organização
 *   supervisor       → evento onde ele tem ao menos um setor
 *   operador_portao  → evento da própria organização (Fase 3: vínculo direto)
 *   suporte          → evento no `suporte_escopo` (avulso, ou org do escopo)
 */
export async function alcancaEvento(perfil: PerfilAutorizavel, eventoId: string): Promise<boolean> {
  const role = perfil?.role
  if (!perfil || !role || !eventoId) return false
  if (role === 'master') return true

  const { data: evento } = await supabaseAdmin
    .from('eventos').select('id, organizacao_id').eq('id', eventoId).maybeSingle()
  if (!evento) return false

  if (role === 'supervisor') {
    const eventos = await eventosDoSupervisor(perfil.id, perfil.fornecedor_id ?? null)
    return eventos.has(eventoId)
  }

  if (role === 'suporte') {
    const { data: escopos } = await supabaseAdmin
      .from('suporte_escopo').select('organizacao_id, evento_id').eq('perfil_id', perfil.id)
    return (escopos ?? []).some(e =>
      e.evento_id === eventoId ||
      (e.organizacao_id != null && e.organizacao_id === evento.organizacao_id),
    )
  }

  // admin / gerente / cliente / operador_portao → pela organização
  return !!perfil.organizacao_id && evento.organizacao_id === perfil.organizacao_id
}

/**
 * Este perfil ALCANÇA este setor? (e, por consequência, a equipe dele)
 *
 * Supervisor: tem que ser setor DELE. Os demais que alcançam o evento
 * alcançam todos os setores. `bloquear_cpf` não passa por aqui — usa
 * `alcancaEvento` de propósito (efeito no evento inteiro).
 */
export async function alcancaSetor(perfil: PerfilAutorizavel, setorId: string): Promise<boolean> {
  const role = perfil?.role
  if (!perfil || !role || !setorId) return false
  if (role === 'master') return true

  const { data: setor } = await supabaseAdmin
    .from('fornecedores').select('id, evento_id').eq('id', setorId).maybeSingle()
  if (!setor) return false

  if (role === 'supervisor') {
    if (perfil.fornecedor_id === setorId) return true
    const { data: vinculo } = await supabaseAdmin
      .from('supervisor_setores')
      .select('fornecedor_id')
      .eq('perfil_id', perfil.id)
      .eq('fornecedor_id', setorId)
      .maybeSingle()
    return !!vinculo
  }

  return alcancaEvento(perfil, setor.evento_id as string)
}

async function eventosDoSupervisor(perfilId: string, fornecedorAtivo: string | null): Promise<Set<string>> {
  const ids = new Set<string>()
  const { data: vinculos } = await supabaseAdmin
    .from('supervisor_setores')
    .select('fornecedores(evento_id)')
    .eq('perfil_id', perfilId)
  for (const v of vinculos ?? []) {
    const eid = (v.fornecedores as unknown as { evento_id?: string } | null)?.evento_id
    if (eid) ids.add(eid)
  }
  if (fornecedorAtivo) {
    const { data: f } = await supabaseAdmin
      .from('fornecedores').select('evento_id').eq('id', fornecedorAtivo).maybeSingle()
    if (f?.evento_id) ids.add(f.evento_id as string)
  }
  return ids
}

// ─── A API pública ─────────────────────────────────────────────────────────

export type AlvoEscopo = { eventoId?: string; setorId?: string }

/**
 * Este perfil pode executar esta ação (neste alvo)?
 *
 *   podeExecutar(perfil, 'whatsapp')                    → só a dimensão Perfil
 *   podeExecutar(perfil, 'avisos', { setorId })         → Perfil + Setor
 *   podeExecutar(perfil, 'editar_evento', { eventoId }) → Perfil + Evento
 *
 * Sem alvo numa ação que exige escopo, responde só "o papel tem?" — é o modo
 * do menu (decidir se MOSTRA o item). Pra BARRAR de verdade, a action sempre
 * passa o alvo.
 */
export async function podeExecutar(
  perfil: PerfilAutorizavel, acao: Acao, alvo?: AlvoEscopo,
): Promise<boolean> {
  if (!temAcaoPeloPapel(perfil, acao)) return false
  if (perfil?.role === 'master') return true
  if (MATRIZ[acao].escopo === 'nenhum') return true

  if (alvo?.setorId) return alcancaSetor(perfil, alvo.setorId)
  if (alvo?.eventoId) {
    // Ação de setor pedida por evento: o supervisor precisa de um setor NELE.
    if (acaoLimitadaAoSetor(acao) && perfil?.role === 'supervisor') {
      const eventos = await eventosDoSupervisor(perfil.id, perfil.fornecedor_id ?? null)
      return eventos.has(alvo.eventoId)
    }
    return alcancaEvento(perfil, alvo.eventoId)
  }
  return true // sem alvo → modo menu
}

/** Só a dimensão de perfil, síncrona — pro menu e componentes de cliente. */
export function podePeloPapel(perfil: PerfilParaMatriz, acao: Acao): boolean {
  return temAcaoPeloPapel(perfil, acao)
}

/**
 * O guard das Server Actions e dos RSC: primeira linha, antes de qualquer
 * leitura ou escrita. Devolve o perfil carregado, ou LANÇA (a mensagem chega
 * na tela e a operação não começa).
 *
 *   export async function editarColaborador(setorId: string, ...) {
 *     const perfil = await exigirAcesso('editar_colaborador', { setorId })
 *     ...
 *   }
 */
export async function exigirAcesso(acao: Acao, alvo?: AlvoEscopo) {
  const perfil = await getPerfil()
  if (!perfil) throw new Error('Sua sessão expirou. Entre no sistema de novo.')
  const ok = await podeExecutar(perfil as PerfilAutorizavel, acao, alvo)
  if (!ok) throw new Error('Você não tem acesso a esta ação.')
  return perfil
}
