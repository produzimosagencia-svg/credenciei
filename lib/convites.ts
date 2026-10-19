import 'server-only'
import { supabaseAdmin, buscarTudo } from './supabase-server'
import { modeloPronto, enfileirarModelo } from './resumo-supervisor'
import { mesmoTelefone, LEMBRETE_DEPOIS_MS } from './convites-regras'

/*
 * CONVITE POR WHATSAPP (com lembrete em 24h) — DESLIGADO POR ENQUANTO (Juan, 18/10/2026: "deixa isso comentado,
 * não vamos usar agora"). O código fica pronto, mas nada o chama: o botão na equipe e a varredura do lembrete no cron
 * estão comentados. Para ligar: descomentar `ConvidarPorWhatsApp` em app/admin/eventos/[id]/fornecedor/[fid]/page.tsx
 * e `processarLembretesDeConvite` em app/api/cron/enviar-mensagens/route.ts, rodar supabase/upgrade-convites-equipe.sql
 * e cadastrar na Meta os modelos `convite_cadastro_equipe` e `lembrete_convite_equipe`.
 *
 * Quem é chamado de novo pelo Monte sua equipe recebe a confirmação de escala que já existe (lib/actions-historico.ts).
 */

export { modeloPronto, enfileirarModelo }

export const MODELO_CONVITE = 'convite_cadastro_equipe'
export const MODELO_LEMBRETE = 'lembrete_convite_equipe'

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.com.br').replace(/\/+$/, '')

const ehTabelaAusente = (e: { code?: string; message?: string } | null) =>
  !!e && (['42P01', 'PGRST205'].includes(e.code ?? '') || /convites_equipe/.test(e.message ?? ''))

/** O link de cadastro da equipe — o mesmo do botão "Link cadastro". */
export function linkDeCadastro(tokenFormulario: string | null): string | null {
  const t = (tokenFormulario ?? '').trim()
  if (!t || !SITE_URL.startsWith('https://')) return null
  return `${SITE_URL}/form/${t}`
}

// ─── Quem já se cadastrou ─────────────────────────────────────────────────────

type ConviteAberto = { id: string; fornecedor_id: string; telefone: string }

/** Marca como cadastrado o convite cujo telefone já apareceu numa ficha da equipe. Devolve os ids marcados. */
export async function marcarCadastrados(convites: ConviteAberto[]): Promise<Set<string>> {
  const marcados = new Set<string>()
  const porEquipe = new Map<string, ConviteAberto[]>()
  for (const c of convites) porEquipe.set(c.fornecedor_id, [...(porEquipe.get(c.fornecedor_id) ?? []), c])
  for (const [fornecedorId, lista] of porEquipe) {
    const fichas = await buscarTudo<{ id: string; telefone: string | null }>((de, ate) => supabaseAdmin.from('funcionarios')
      .select('id, telefone').eq('fornecedor_id', fornecedorId).order('id').range(de, ate) as never)
    for (const c of lista) {
      const ficha = fichas.find(f => mesmoTelefone(f.telefone, c.telefone))
      if (!ficha) continue
      const { error } = await supabaseAdmin.from('convites_equipe')
        .update({ cadastrado_em: new Date().toISOString(), funcionario_id: ficha.id }).eq('id', c.id).is('cadastrado_em', null)
      if (!error) marcados.add(c.id)
    }
  }
  return marcados
}

const horaBRT = () => Number(new Date(Date.now() - 3 * 3600_000).toISOString().slice(11, 13))

async function fluxoDesligado(chave: string): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.from('sistema_estado').select('valor').eq('chave', 'fluxos').maybeSingle()
    return ((data?.valor ?? {}) as Record<string, boolean>)[chave] === false
  } catch { return false }
}

// ─── Lembrete do convite (varredura do cron) ──────────────────────────────────

/**
 * Convite sem cadastro há 24 horas ganha UM lembrete. Só entre 8h e 21h (ninguém recebe convite de madrugada), só
 * com o modelo aprovado, e nunca para quem já se cadastrou ou teve o lembrete cancelado pelo supervisor.
 */
export async function processarLembretesDeConvite(): Promise<void> {
  const hora = horaBRT()
  if (hora < 8 || hora >= 21) return
  if (await fluxoDesligado('lembrete_convite')) return
  const limite = new Date(Date.now() - LEMBRETE_DEPOIS_MS).toISOString()
  const { data: vencidos, error } = await supabaseAdmin.from('convites_equipe')
    .select('id, fornecedor_id, evento_id, telefone')
    .is('lembrado_em', null).is('cadastrado_em', null).is('cancelado_em', null)
    .lte('criado_em', limite).order('criado_em').limit(40)
  if (error || !vencidos?.length) return

  const cadastrados = await marcarCadastrados(vencidos as ConviteAberto[])
  const faltam = vencidos.filter(c => !cadastrados.has(c.id as string))
  if (!faltam.length || !(await modeloPronto(MODELO_LEMBRETE))) return

  const idsEquipes = [...new Set(faltam.map(c => c.fornecedor_id as string))]
  const { data: equipes } = await supabaseAdmin.from('fornecedores')
    .select('id, nome, token_formulario, link_ativo, eventos!inner(id, nome, ativo)').in('id', idsEquipes)
  const equipePorId = new Map((equipes ?? []).map(e => [e.id as string, e]))

  for (const c of faltam) {
    const e = equipePorId.get(c.fornecedor_id as string)
    const evento = e?.eventos as unknown as { id: string; nome: string; ativo: boolean | null } | undefined
    const link = e && (e as { link_ativo?: boolean | null }).link_ativo !== false ? linkDeCadastro(e.token_formulario as string | null) : null
    // Equipe sem link, evento encerrado: não há para onde mandar a pessoa — o convite fecha sem lembrete.
    if (!e || !evento || evento.ativo === false || !link) {
      await supabaseAdmin.from('convites_equipe').update({ lembrado_em: new Date().toISOString() }).eq('id', c.id)
      continue
    }
    // Marca ANTES de enfileirar: duas varreduras juntas não mandam dois lembretes.
    const { data: marcou } = await supabaseAdmin.from('convites_equipe')
      .update({ lembrado_em: new Date().toISOString() }).eq('id', c.id).is('lembrado_em', null).select('id')
    if (!marcou?.length) continue
    const id = await enfileirarModelo({
      eventoId: evento.id, telefone: c.telefone as string, modelo: MODELO_LEMBRETE,
      parametros: [String(e.nome ?? '').trim(), evento.nome, link], campanha: `lembrete-convite-${c.id}`,
    })
    if (id) await supabaseAdmin.from('convites_equipe').update({ lembrete_mensagem_id: id }).eq('id', c.id)
  }
}

export { ehTabelaAusente }
