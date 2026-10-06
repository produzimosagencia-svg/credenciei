import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { identificadorParaEmail } from '@/lib/usuario'
import { supabaseAdmin } from '@/lib/supabase-server'
import { mensagemAmigavel } from '@/lib/erros'

export async function POST(request: NextRequest) {
  const { email, senha } = await request.json()
  const digitado = String(email ?? '').trim()

  /*
   * CPF pela metade não é "senha errada".
   *
   * Quem entra por CPF e erra um dígito cai fora do formato reconhecido, o
   * identificador vira outra coisa, e o Supabase responde o genérico
   * "credenciais inválidas" — que a tela traduzia como senha incorreta. A
   * pessoa então tenta a senha de novo, várias vezes, no meio da operação,
   * enquanto o problema estava na linha de cima. Aconteceu na portaria.
   *
   * Só vale para quem digitou apenas números: aí a intenção era CPF, e a
   * contagem de dígitos é uma resposta melhor do que qualquer outra.
   */
  const soDigitos = /^[\d.\-\s]+$/.test(digitado)
  const digitos = digitado.replace(/\D/g, '')
  if (digitado && soDigitos && digitos.length !== 11) {
    return NextResponse.json(
      { error: `O CPF precisa ter 11 dígitos — você digitou ${digitos.length}. Confira e tente de novo.` },
      { status: 401 },
    )
  }

  // Sem "@" é nome de usuário de supervisor; com "@" é e-mail de admin/master.
  // A mesma tela atende os dois, sem a pessoa escolher tipo de conta.
  const identificador = identificadorParaEmail(digitado)

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

  let { data, error } = await supabase.auth.signInWithPassword({
    email: identificador,
    password: senha,
  })

  /*
   * CPF que não bate com o e-mail interno: conta com e-mail DE VERDADE.
   *
   * O login por CPF procura `CPF@supervisor.credenciei`, mas master e admin
   * têm o e-mail real (ex.: gabriel@credenciei.com). O "Esqueci a senha" por
   * CPF trocava a senha da conta certa e o login seguinte, por CPF, dizia
   * "senha incorreta" — a conta que recebeu a senha nova nunca era a que o
   * login consultava (06/10/2026, o próprio master). Então, quando o
   * identificador era um CPF e a primeira tentativa falhou, acha a conta pelo
   * CPF CADASTRADO e tenta com o e-mail dela. Nada é revelado: a resposta
   * continua sendo a mesma de "senha incorreta" se a segunda também falhar.
   */
  if (error && soDigitos && digitos.length === 11) {
    try {
      const { data: perfil } = await supabaseAdmin.from('perfis').select('id').eq('cpf', digitos).maybeSingle()
      if (perfil) {
        const { data: usuario } = await supabaseAdmin.auth.admin.getUserById(perfil.id as string)
        const emailReal = usuario?.user?.email
        if (emailReal && emailReal.toLowerCase() !== identificador.toLowerCase()) {
          const segunda = await supabase.auth.signInWithPassword({ email: emailReal, password: senha })
          if (!segunda.error) { data = segunda.data; error = null }
        }
      }
    } catch (e) {
      console.error('[login] busca da conta pelo CPF falhou', e)
    }
  }

  if (error) {
    return NextResponse.json({ error: mensagemAmigavel(error) }, { status: 401 })
  }

  if (!data?.session) {
    return NextResponse.json({ error: 'Não foi possível iniciar sua sessão. Tente entrar de novo.' }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}
