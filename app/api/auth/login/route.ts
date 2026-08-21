import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { identificadorParaEmail } from '@/lib/usuario'
import { mensagemAmigavel } from '@/lib/erros'

export async function POST(request: NextRequest) {
  const { email, senha } = await request.json()
  // Sem "@" é nome de usuário de supervisor; com "@" é e-mail de admin/master.
  // A mesma tela atende os dois, sem a pessoa escolher tipo de conta.
  const identificador = identificadorParaEmail(String(email ?? ''))

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        },
      },
    }
  )

  const { data, error } = await supabase.auth.signInWithPassword({
    email: identificador,
    password: senha,
  })

  if (error) {
    return NextResponse.json({ error: mensagemAmigavel(error) }, { status: 401 })
  }

  if (!data.session) {
    return NextResponse.json({ error: 'Não foi possível iniciar sua sessão. Tente entrar de novo.' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
