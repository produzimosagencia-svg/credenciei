import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { ehMaster, podeGerenciarEventos, podeEscanear } from './permissions'

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
  return data
})

/**
 * Quantas licenças de evento AINDA restam para a organização do usuário.
 * - master: Infinity (sem limite)
 * - admin/gestor: limite_eventos da org menos os eventos já criados
 * - org suspensa ou sem permissão: 0
 */
export async function licencasDeEventoRestantes(perfil: any): Promise<number> {
  if (!perfil) return 0
  if (ehMaster(perfil.role)) return Infinity
  if (!podeGerenciarEventos(perfil.role) || !perfil.organizacao_id) return 0

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

/** Lista {id, nome} dos eventos que o usuário tem permissão de escanear. */
export async function eventosEscaneaveis(perfil: any): Promise<{ id: string; nome: string }[]> {
  if (!perfil || !podeEscanear(perfil.role)) return []

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
  if (!perfil || !podeEscanear(perfil.role)) return false
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
