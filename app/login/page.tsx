'use client'
import { useState } from 'react'
import { QrCode, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErro('')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    })

    const json = await res.json()

    if (!res.ok) {
      setErro(`Erro: ${json.error}`)
      setLoading(false)
      return
    }

    window.location.href = '/admin'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-500 rounded-2xl mb-4 shadow-lg shadow-orange-200">
            <QrCode className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">Credenciei</h1>
          <p className="text-slate-500 text-sm mt-1">Sistema de credenciamento para eventos</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200 border border-slate-100 p-7 space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="input"
              autoComplete="email"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Senha</label>
            <div className="relative">
              <input
                type={mostrarSenha ? 'text' : 'password'}
                required
                value={senha}
                onChange={e => setSenha(e.target.value)}
                placeholder="••••••••"
                className="input pr-10"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {erro && (
            <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              {erro}
            </p>
          )}

          <button
            type="button"
            onClick={handleLogin as any}
            disabled={loading}
            className="w-full bg-orange-500 hover:bg-orange-600 active:bg-orange-700 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-all text-sm shadow-md shadow-orange-200"
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </div>

        <p className="text-center text-slate-400 text-xs mt-6">
          Credenciei © {new Date().getFullYear()} — Produzimos
        </p>
      </div>
    </div>
  )
}
