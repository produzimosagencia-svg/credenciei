'use client'
import { useState } from 'react'
import Image from 'next/image'
import { QrCode, Eye, EyeOff } from 'lucide-react'
import fotoLogin from './imgTela1.jpg'

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
    <div className="min-h-screen flex bg-[#0a0918]">
      {/* Painel visual — oculto em telas pequenas */}
      <div className="hidden md:block relative w-1/2 lg:w-3/5 overflow-hidden">
        <Image
          src={fotoLogin}
          alt="Credencial VIP em um evento"
          fill
          priority
          sizes="60vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/35" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        <div className="absolute left-10 bottom-9 flex items-center gap-3">
          <div className="w-11 h-11 bg-brand-500 rounded-xl flex items-center justify-center shadow-lg shadow-brand-500/40">
            <QrCode className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-xl leading-tight tracking-tight">Credenciei</p>
            <p className="text-slate-300 text-[11px] tracking-[0.2em] uppercase">Credenciamento para eventos</p>
          </div>
        </div>
      </div>

      {/* Formulário */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="md:hidden flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 bg-brand-500 rounded-lg flex items-center justify-center">
              <QrCode className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg">Credenciei</span>
          </div>

          <h1 className="text-white text-3xl font-bold">Entrar</h1>
          <p className="text-slate-400 text-sm mt-1.5 mb-8">Acesse o painel do seu evento</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">E-mail</label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                autoComplete="email"
                className="w-full bg-slate-50 border border-transparent rounded-xl px-4 py-3 text-slate-800 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-300">Senha</label>
              <div className="relative">
                <input
                  type={mostrarSenha ? 'text' : 'password'}
                  required
                  value={senha}
                  onChange={e => setSenha(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full bg-slate-50 border border-transparent rounded-xl px-4 py-3 pr-11 text-slate-800 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setMostrarSenha(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {erro && (
              <p className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
                {erro}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-brand-500 hover:bg-brand-400 active:bg-brand-600 disabled:opacity-50 text-white py-3.5 rounded-xl font-semibold transition-all text-sm shadow-lg shadow-brand-500/30"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-center text-slate-500 text-xs mt-8">
            Credenciei © {new Date().getFullYear()} — Produzimos
          </p>
        </div>
      </div>
    </div>
  )
}
