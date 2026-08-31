import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  /*
   * Rotas públicas: sai imediatamente, sem tocar no Supabase.
   *
   * Toda rota que uma pessoa SEM CONTA precisa abrir entra aqui. Esquecer uma
   * não dá erro visível no desenvolvimento — dá um redirecionamento para o
   * login em produção, e quem está do outro lado conclui que o sistema quebrou.
   *
   * `/portaria/` é o cartaz impresso na entrada do evento: quem escaneia não
   * tem conta, não tem aplicativo, e está com fila atrás. Se esta linha sair,
   * o cartaz para de funcionar e ninguém percebe até alguém apontar a câmera.
   */
  if (
    pathname.startsWith('/form/') ||
    pathname.startsWith('/credential/') ||
    pathname.startsWith('/portaria/') ||
    pathname.startsWith('/supervisor/criar-senha/') ||
    pathname === '/login'
  ) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession lê o cookie localmente (rede só quando o token expira e precisa
  // de refresh). Serve apenas para o redirect otimista → a checagem autoritativa
  // de acesso continua no admin/layout via getPerfil() (auth.getUser no servidor).
  const { data: { session } } = await supabase.auth.getSession()

  // Sem sessão → login
  if (!session) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/).*)'],
}
