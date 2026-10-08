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
    // Pedido de setor (link público do evento) e a página onde o fornecedor acompanha a resposta: quem abre não tem conta.
    pathname.startsWith('/pedido-setor/') ||
    pathname.startsWith('/credential/') ||
    pathname.startsWith('/portaria/') ||
    pathname.startsWith('/supervisor/criar-senha/') ||
    // Autocadastro de veículo (link público) e a página que o QR do veículo
    // aponta — as duas são pra quem nunca logou (motorista, hóspede, pessoa
    // do lounge). Mesmo risco do /portaria/: sem esta linha, o link vira
    // redirect pro login e ninguém percebe até alguém escanear o QR.
    pathname.startsWith('/veiculo-cadastro/') ||
    pathname.startsWith('/veiculo/') ||
    // Respostas de um disparo, compartilhadas com o cliente dono da lista por
    // link com prazo. Ele não tem conta: sem esta linha o link cai no login.
    pathname.startsWith('/respostas/') ||
    // Guia do supervisor: público de propósito (decisão do Juan, 07/10/2026) — é o link que se manda a quem ainda não tem conta.
    pathname === '/guia-supervisor' ||
    pathname === '/guia-operador' ||
    pathname === '/guia-encarregado' ||
    pathname === '/login' ||
    // A landing é pública: é a porta de entrada de quem ainda não tem conta.
    pathname === '/' ||
    // Os arquivos da marca (public/marca) servem a landing e o login, que
    // não têm sessão — sem isto o logo vira um redirect pra /login.
    pathname.startsWith('/marca/') ||
    /*
     * Os PESOS do reconhecimento facial (public/models/), pro navegador
     * baixar (face-api.js) — servem o AUTOATENDIMENTO na credencial
     * (`/credential/[token]`), que é PÚBLICO, sem sessão nenhuma.
     *
     * Sem esta linha, o próprio funcionário nunca conseguia bater a entrada
     * por biometria pelo celular dele: o arquivo virava um redirect pra
     * /login (o navegador tenta baixar um .json e recebe HTML de login no
     * lugar) e a câmera nunca chegava a abrir. Achado só depois do deploy —
     * o Scanner do PORTÃO (autenticado) nunca sentiu o problema, porque o
     * operador sempre tem sessão.
     */
    pathname.startsWith('/models/') ||
    /*
     * Vídeos da landing (public/videos/) — mesmo motivo de /marca/: a
     * landing (`/`) é pública, sem sessão, e sem esta linha o arquivo de
     * vídeo (e o poster) viravam redirect pra /login. Foi exatamente isso
     * que aconteceu com o vídeo de abertura do app (30/09/2026): o elemento
     * <video> carregava, mas a resposta era a PÁGINA DE LOGIN em vez do
     * .mp4 — por isso nem o poster nem o autoplay funcionavam em lugar
     * nenhum, não só no celular.
     */
    pathname.startsWith('/videos/') ||
    // `/wa` é o atalho rastreável pro WhatsApp comercial: é o endereço que
    // está no link da bio do Instagram e em toda divulgação. Quem clica não
    // tem conta. Se esta linha sair, o link da bio cai no login e o comercial
    // para de receber conversa sem ninguém entender por quê.
    pathname === '/wa'
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
