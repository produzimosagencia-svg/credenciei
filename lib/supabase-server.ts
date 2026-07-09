import { createServerClient } from '@supabase/ssr'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { cache } from 'react'
import { ehMaster, podeGerenciarEventos } from './permissions'

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
