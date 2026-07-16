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
    <div className="min-h-screen flex bg-[#0a0918]">
      {/* Painel visual — oculto em telas pequenas */}
      <div className="hidden md:block relative w-1/2 lg:w-3/5 overflow-hidden">
        <LoginArtwork />
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

// Posições fixas (não Math.random — evita mismatch de hidratação SSR/client)
// da "silhueta de multidão" no rodapé da arte, simulando o público de um evento.
const CABECAS = [
  20, 55, 95, 128, 158, 190, 226, 258, 292, 330, 365, 398, 432, 470, 505, 540,
  575, 610, 648, 682, 715, 750, 785, 820, 855, 890,
].map((x, i) => ({ x, r: 22 + ((i * 37) % 14), h: 30 + ((i * 53) % 20) }))

function LoginArtwork() {
  return (
    <svg
      viewBox="0 0 900 1200"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full"
      role="img"
      aria-label="Ilustração de um evento com credenciamento por QR code"
    >
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#05040d" />
          <stop offset="55%" stopColor="#160f3d" />
          <stop offset="100%" stopColor="#2f27a0" />
        </linearGradient>
        <radialGradient id="glowWarm" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fb923c" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#fb923c" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="glowBrand" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6f66e9" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#6f66e9" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="beam" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8ec5ff" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#8ec5ff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="footlights" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fb923c" stopOpacity="0" />
          <stop offset="55%" stopColor="#f97362" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#f97362" stopOpacity="0.55" />
        </linearGradient>
        <filter id="blurSoft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="40" />
        </filter>
        <filter id="blurMed" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <pattern id="qrDots" width="26" height="26" patternUnits="userSpaceOnUse">
          <rect width="10" height="10" x="0" y="0" fill="#ffffff" opacity="0.5" />
          <rect width="10" height="10" x="16" y="8" fill="#ffffff" opacity="0.3" />
        </pattern>
      </defs>

      {/* fundo */}
      <rect width="900" height="1200" fill="url(#bg)" />

      {/* feixes de luz de palco, cruzados, como num show */}
      <g filter="url(#blurSoft)" opacity="0.7">
        <polygon points="120,0 340,0 760,760 560,820" fill="url(#beam)" />
        <polygon points="520,0 660,0 900,520 780,600" fill="url(#beam)" opacity="0.6" />
      </g>

      {/* glows de palco */}
      <circle cx="230" cy="640" r="340" fill="url(#glowWarm)" filter="url(#blurSoft)" />
      <circle cx="700" cy="420" r="380" fill="url(#glowBrand)" filter="url(#blurSoft)" />

      {/* padrão QR discreto — remete ao credenciamento por QR code */}
      <rect x="580" y="40" width="300" height="300" fill="url(#qrDots)" opacity="0.05" />

      {/* anel de "leitura de QR", flutuando como elemento decorativo */}
      <g opacity="0.35">
        <circle cx="690" cy="330" r="86" fill="none" stroke="#ffffff" strokeWidth="2" />
        <circle cx="690" cy="330" r="86" fill="none" stroke="#ffffff" strokeWidth="10" strokeDasharray="4 14" opacity="0.5" />
      </g>

      {/* luz de palco vinda de baixo — cria contraste pra silhueta da multidão aparecer */}
      <rect x="0" y="880" width="900" height="320" fill="url(#footlights)" filter="url(#blurSoft)" />

      {/* silhueta da multidão, contra a luz do palco */}
      <g fill="#0a0716">
        {CABECAS.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={1080 - c.h} r={c.r} />
            <rect x={c.x - c.r * 1.3} y={1080 - c.h + c.r * 0.4} width={c.r * 2.6} height={80} rx={c.r} />
          </g>
        ))}
        <rect x="0" y="1080" width="900" height="120" />
      </g>

      {/* leve vinheta pra dar profundidade nas bordas */}
      <rect width="900" height="1200" fill="url(#bg)" opacity="0" />
      <g filter="url(#blurMed)" opacity="0.5">
        <rect x="-100" y="-100" width="1100" height="60" fill="#05040d" />
      </g>
    </svg>
  )
}
