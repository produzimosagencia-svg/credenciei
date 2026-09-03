'use client'
import { useState } from 'react'
import { SignIn1 } from '@/components/ui/modern-stunning-sign-in'
import { mensagemAmigavel } from '@/lib/erros'

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  /*
   * Autentica em /api/auth/login (e-mail ou CPF + senha) e recarrega inteiro
   * em /admin: recarregar, e não navegar, garante que o cookie de sessão
   * recém-gravado vale pra primeira renderização do painel.
   */
  const entrar = async (usuario: string, senha: string) => {
    setLoading(true)
    setErro('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: usuario, senha }),
      })
      const json: { error?: string } = await res.json()
      if (!res.ok) throw new Error(json.error)
    } catch (e) {
      setErro(mensagemAmigavel(e))
      setLoading(false)
      return
    }
    window.location.href = '/admin'
  }

  return <SignIn1 onEntrar={entrar} carregando={loading} erro={erro} />
}
