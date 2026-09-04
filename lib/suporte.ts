import { supabaseAdmin } from './supabase-server'

/**
 * O escopo de um perfil de suporte: em quais organizações e/ou eventos ele
 * pode agir. Ver `suporte_escopo` em supabase/upgrade-suporte.sql.
 *
 * Esta é a MESMA função chamada por toda action sensível quando
 * `perfil.role === 'suporte'` — um lugar só, pra nunca divergir entre "o CPF
 * corrige" e "o setor move" sobre quem tem acesso a quê. Master/admin não
 * passam por aqui: eles já têm a checagem deles (organização inteira, ou
 * tudo, no caso do master).
 */
export async function suporteTemEscopo(
  perfilId: string,
  alvo: { eventoId?: string; organizacaoId?: string },
): Promise<boolean> {
  if (!alvo.eventoId && !alvo.organizacaoId) return false

  // Escopo por evento avulso: bate direto.
  if (alvo.eventoId) {
    const { data: direto } = await supabaseAdmin
      .from('suporte_escopo').select('id').eq('perfil_id', perfilId).eq('evento_id', alvo.eventoId).maybeSingle()
    if (direto) return true
  }

  // Escopo por organização inteira: descobre a organização do evento (se só
  // o evento foi passado) e confere contra as linhas de organização.
  const organizacaoId = alvo.organizacaoId ?? (alvo.eventoId ? await organizacaoDoEvento(alvo.eventoId) : null)
  if (!organizacaoId) return false

  const { data: porOrg } = await supabaseAdmin
    .from('suporte_escopo').select('id').eq('perfil_id', perfilId).eq('organizacao_id', organizacaoId).maybeSingle()
  return !!porOrg
}

async function organizacaoDoEvento(eventoId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from('eventos').select('organizacao_id').eq('id', eventoId).maybeSingle()
  return (data?.organizacao_id as string | null) ?? null
}

/**
 * Confere permissão + escopo pra uma ação sensível de suporte, num só lugar.
 *
 * `podeSempre` é a checagem que já existia pro papel que sempre pôde (master,
 * ou master+admin conforme a ação) — passa direto sem checar escopo. Suporte
 * só passa se tiver o escopo do evento/organização informado.
 */
export async function exigirAcessoSuporteOuSempre(
  perfil: { id: string; role?: string } | null,
  podeSempre: boolean,
  alvo: { eventoId?: string; organizacaoId?: string },
): Promise<void> {
  if (podeSempre) return
  if (!perfil || perfil.role !== 'suporte') throw new Error('Sem permissão para esta ação.')
  if (!(await suporteTemEscopo(perfil.id, alvo))) {
    throw new Error('Este evento não está no seu escopo de atendimento.')
  }
}

// Os rótulos e motivos moram em lib/auditoria-rotulos.ts — texto puro, sem
// import, pra poderem ser usados também no navegador. Reexportados aqui pra
// não quebrar quem já os importava daqui (Server Components).
export { ACAO_LABELS, MOTIVOS_PADRAO } from './auditoria-rotulos'
