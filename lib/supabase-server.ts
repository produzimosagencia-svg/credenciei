import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { ehMaster, podeGerenciarEventos, podeEscanear, podeAcompanhar } from './permissions'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}

export async function getSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return session
}

// Client com service role criado uma única vez (module scope).
// É o ÚNICO caminho de acesso ao banco no servidor: com RLS ligado, as tabelas
// ficam acessíveis somente pela service role. O isolamento por organização é
// garantido no código do servidor (filtros por organizacao_id + getPerfil).
// NUNCA importar isto em componentes de browser ('use client').
export const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const admin = supabaseAdmin

/**
 * Busca TODAS as linhas de uma consulta, sem o teto de 1000 do PostgREST.
 *
 * Descoberto em 03/09/2026: o Supabase/PostgREST tem um limite de linhas por
 * resposta (`db.max_rows` do projeto, 1000 aqui) que NENHUM `.limit()` do
 * lado do cliente consegue passar — pedir `.limit(20000)` e receber 1000 de
 * volta é esse teto agindo, não um bug de quem escreveu a consulta. Foi o
 * que fez "Funcionários na base" no Painel e a equipe de um evento com mais
 * de 1000 pessoas mostrarem 1000 fixo, escondendo o resto sem avisar —
 * mesma família do bug do teto de 300 em Encontre colaborador, só que este
 * vinha do próprio Supabase, não de um `.limit()` nosso.
 *
 * Só entra aqui quem precisa da LINHA em si — pra somar, agrupar,
 * deduplicar. Se o precisa é só uma contagem, `{ count: 'exact', head: true
 * }` já resolve sem paginar nada (é como `/admin/eventos/[id]` conta
 * "Funcionários do evento" sem cair neste teto).
 *
 * `tetoTotal` é opcional — pra quem quer manter um teto de segurança
 * proposital (ex.: "Encontre colaborador" já tinha um teto por design, não
 * por limitação do Supabase; ele continua existindo, só que agora paginando
 * de verdade até chegar nele, em vez de um `.limit()` que o Supabase ignora
 * acima de 1000).
 */
export async function buscarTudo<T>(
  montarPagina: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  { tamanhoDaPagina = 1000, tetoTotal = Infinity }: { tamanhoDaPagina?: number; tetoTotal?: number } = {},
): Promise<T[]> {
  const tudo: T[] = []
  let de = 0
  while (de < tetoTotal) {
    const ate = Math.min(de + tamanhoDaPagina, tetoTotal) - 1
    const { data, error } = await montarPagina(de, ate)
    if (error) throw new Error(error.message)
    if (!data || !data.length) break
    tudo.push(...data)
    if (data.length < ate - de + 1) break
    de += tamanhoDaPagina
  }
  return tudo
}

// cache() deduplica por requisição: layout e página compartilham o mesmo
// resultado em vez de repetir getUser + select em cada chamada.
export const getPerfil = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // Usa service role para bypassar RLS na leitura do perfil
  const { data } = await admin.from('perfis').select('*').eq('id', user.id).single()
  // Conta desativada (Status = Inativo) é tratada como não-logada em todo o app
  if (data && data.ativo === false) return null
  /*
   * Acesso com prazo (hoje só o suporte usa `acesso_expira_em`): passada a
   * data, mesmo tratamento de `ativo = false` — sem isso, um acesso
   * contratado só pro fim de semana do evento continuaria valendo pra
   * sempre, porque ninguém lembra de desligar na segunda-feira.
   */
  if (data?.acesso_expira_em && new Date(data.acesso_expira_em as string) < new Date()) return null
  if (!data) return data

  /*
   * As exceções de permissão da organização, junto do perfil.
   *
   * Vem daqui, e não de cada tela, porque `getPerfil` é `cache()`: uma
   * consulta por requisição, não uma por checagem de permissão. As funções
   * de `lib/permissions.ts` leem `perfil.permissoes` quando recebem o perfil
   * inteiro — ver `AlvoPermissao` lá.
   *
   * TOLERANTE A TUDO: sem a tabela (migração pendente) ou com erro na
   * consulta, o mapa fica vazio e todo papel se comporta como sempre se
   * comportou. Uma falha aqui não pode virar "ninguém pode nada" no meio de
   * um evento.
   */
  data.permissoes = await excecoesDePermissao(data.organizacao_id as string | null)
  return data
})

/*
 * Uma consulta por requisição já é barata; uma consulta que SEMPRE falha,
 * não. Enquanto a migração não rodar, a primeira tentativa marca isto e as
 * seguintes nem saem — senão toda página do sistema pagaria uma ida ao banco
 * pra receber o mesmo erro, e num dia de evento isso é latência de graça.
 * Reinicia junto com o processo, então rodar a migração passa a valer no
 * próximo deploy (ou na próxima instância fria).
 */
let tabelaDePermissoesAusente = false

async function excecoesDePermissao(organizacaoId: string | null): Promise<Record<string, boolean>> {
  if (tabelaDePermissoesAusente) return {}
  try {
    // Linha da organização E linha da plataforma (organizacao_id nulo).
    const { data, error } = await admin
      .from('permissoes_organizacao')
      .select('organizacao_id, role, chave, permitido')
      .or(organizacaoId ? `organizacao_id.is.null,organizacao_id.eq.${organizacaoId}` : 'organizacao_id.is.null')
    if (error) {
      if (/does not exist|schema cache|PGRST205/i.test(`${error.code ?? ''} ${error.message}`)) {
        tabelaDePermissoesAusente = true
      }
      return {}
    }
    if (!data.length) return {}

    // A da organização ganha da plataforma — por isso as genéricas entram
    // primeiro e as específicas sobrescrevem.
    const mapa: Record<string, boolean> = {}
    for (const linha of data) if (!linha.organizacao_id) mapa[`${linha.role}:${linha.chave}`] = linha.permitido as boolean
    for (const linha of data) if (linha.organizacao_id) mapa[`${linha.role}:${linha.chave}`] = linha.permitido as boolean
    return mapa
  } catch {
    return {}
  }
}

/**
 * Quantas licenças de evento AINDA restam para a organização do usuário.
 * - master: Infinity (sem limite)
 * - admin/gestor: limite_eventos da org menos os eventos já criados
 * - org suspensa ou sem permissão: 0
 */
export async function licencasDeEventoRestantes(perfil: any): Promise<number> {
  if (!perfil) return 0
  if (ehMaster(perfil.role)) return Infinity
  if (!podeGerenciarEventos(perfil) || !perfil.organizacao_id) return 0

  const [{ count }, { data: org }] = await Promise.all([
    admin.from('eventos').select('id', { count: 'exact', head: true }).eq('organizacao_id', perfil.organizacao_id),
    admin.from('organizacoes').select('limite_eventos, ativo').eq('id', perfil.organizacao_id).single(),
  ])
  if (!org || !org.ativo) return 0
  return Math.max(0, org.limite_eventos - (count ?? 0))
}

// ─── Scanner e escopo por SETOR (fornecedor) ──────────────────────────────────
// master  → todos os eventos ativos
// admin/gerente/cliente → eventos ativos da própria organização
// supervisor → apenas o setor (fornecedor) ao qual foi vinculado na criação,
//              e portanto só o evento dono desse setor.

/** O setor (fornecedor) do supervisor logado, com o evento a que pertence. Null se não for supervisor de setor. */
export async function meuSetor(perfil: any): Promise<{ id: string; nome: string; evento_id: string; evento_nome: string } | null> {
  if (!perfil || perfil.role !== 'supervisor' || !perfil.fornecedor_id) return null
  const { data } = await admin
    .from('fornecedores')
    .select('id, nome, evento_id, eventos(nome)')
    .eq('id', perfil.fornecedor_id)
    .single()
  if (!data) return null
  return { id: data.id, nome: data.nome, evento_id: data.evento_id, evento_nome: (data.eventos as any)?.nome ?? '' }
}

/**
 * TODOS os setores que este supervisor pode acessar.
 *
 * `meuSetor` (singular) devolve o que ele está vendo AGORA; esta devolve o
 * cardápio. A diferença é o que permite um login só cobrir vários setores —
 * ver supabase/upgrade-supervisor-multi-setor.sql.
 *
 * Tolerante à migração ainda não aplicada: sem a tabela, cai no setor único
 * de sempre, e o sistema segue funcionando como antes.
 */
export async function meusSetores(perfil: any): Promise<{ id: string; nome: string; evento_id: string }[]> {
  if (!perfil || perfil.role !== 'supervisor') return []

  const { data: vinculos, error } = await admin
    .from('supervisor_setores').select('fornecedor_id').eq('perfil_id', perfil.id)

  const ids = new Set<string>()
  if (!error) for (const v of vinculos ?? []) ids.add(v.fornecedor_id as string)
  // O setor ativo entra sempre: se a migração não rodou, ou se o vínculo se
  // perdeu, o supervisor não pode ficar sem enxergar onde já está.
  if (perfil.fornecedor_id) ids.add(perfil.fornecedor_id as string)
  if (!ids.size) return []

  const { data } = await admin
    .from('fornecedores').select('id, nome, evento_id').in('id', [...ids]).order('nome')
  return (data ?? []).map(f => ({ id: f.id as string, nome: f.nome as string, evento_id: f.evento_id as string }))
}

/** Lista {id, nome} dos eventos que o usuário tem permissão de escanear. */
export async function eventosEscaneaveis(perfil: any): Promise<{ id: string; nome: string }[]> {
  if (!perfil || !podeAcompanhar(perfil)) return []

  if (ehMaster(perfil.role)) {
    const { data } = await admin
      .from('eventos')
      .select('id, nome')
      .eq('ativo', true)
      .order('data_inicio', { ascending: false })
    return data ?? []
  }

  if (perfil.role === 'supervisor') {
    const setor = await meuSetor(perfil)
    if (!setor) return []
    const { data: evento } = await admin.from('eventos').select('id, nome, ativo').eq('id', setor.evento_id).single()
    return evento?.ativo ? [{ id: evento.id, nome: evento.nome }] : []
  }

  // admin / gerente / cliente → eventos ativos da própria organização
  if (!perfil.organizacao_id) return []
  const { data } = await admin
    .from('eventos')
    .select('id, nome')
    .eq('ativo', true)
    .eq('organizacao_id', perfil.organizacao_id)
    .order('data_inicio', { ascending: false })
  return data ?? []
}

/** Este usuário pode escanear ESTE evento? (checa o setor do supervisor / org do admin) */
export async function podeEscanearEvento(perfil: any, eventoId: string): Promise<boolean> {
  if (!perfil || !podeEscanear(perfil)) return false
  if (ehMaster(perfil.role)) return true

  if (perfil.role === 'supervisor') {
    const setor = await meuSetor(perfil)
    return setor?.evento_id === eventoId
  }

  // admin / gerente / cliente → evento tem que ser da própria organização
  const { data: evento } = await admin
    .from('eventos')
    .select('organizacao_id')
    .eq('id', eventoId)
    .single()
  return !!evento && !!perfil.organizacao_id && evento.organizacao_id === perfil.organizacao_id
}
