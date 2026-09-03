'use client'
import { useState } from 'react'
import { Eye, EyeOff, MessageCircle } from 'lucide-react'

/**
 * Cartão de login — adaptado do template "modern stunning sign in".
 *
 * O que mudou em relação ao template: o ícone 3D da marca no lugar do logo
 * na bolinha, um slogan, o botão no gradiente laranja, e "Esqueci a senha"
 * levando ao WhatsApp da equipe (não há troca de senha pelo site). Saíram o
 * botão do Google e o "crie sua conta". O campo aceita CPF ou e-mail,
 * porque o supervisor entra com CPF.
 *
 * Só desenha e coleta. Quem autentica é a página (`onEntrar`), que já sabe
 * falar com /api/auth/login.
 */

/** Trocar quando o número for definido. */
const WHATSAPP_SUPORTE = 'https://wa.me/5500000000000?text=Esqueci%20minha%20senha%20do%20Credenciei'

const CAMPO =
  'w-full px-5 py-3.5 rounded-xl bg-white/[.06] border border-white/10 text-white placeholder-white/35 text-sm outline-none ' +
  'focus:border-[#FF4A0F]/70 focus:ring-4 focus:ring-[#FF4A0F]/15 transition ' +
  // Chrome pinta o campo preenchido automaticamente de azul-claro; isto força
  // o fundo escuro e o texto branco também nesse estado.
  '[&:-webkit-autofill]:[-webkit-text-fill-color:#fff] [&:-webkit-autofill]:[box-shadow:0_0_0_1000px_#1c1a19_inset] [&:-webkit-autofill]:[caret-color:#fff]'

export function SignIn1({ onEntrar, carregando, erro }: {
  onEntrar: (usuario: string, senha: string) => void
  carregando?: boolean
  erro?: string
}) {
  const [usuario, setUsuario] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden w-full px-4 py-10"
      style={{ background: 'radial-gradient(1000px 520px at 50% -10%, rgba(255,74,15,.24), transparent 60%), radial-gradient(700px 420px at 100% 100%, rgba(163,27,5,.16), transparent 60%), #0d0c0c' }}
    >
      {/* Ícone 3D flutuando acima do cartão, com a luz por trás. */}
      <div className="relative z-10 -mb-12">
        <span className="absolute inset-0 rounded-full blur-2xl" style={{ background: 'radial-gradient(circle, rgba(255,74,15,.55), transparent 70%)' }} aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/iso-3d.png" alt="Credenciei" className="relative w-28 h-28 object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,.6)]" style={{ animation: 'flutua-login 6s ease-in-out infinite' }} />
      </div>

      {/* Cartão de vidro */}
      <div className="relative z-0 w-full max-w-sm rounded-[28px] bg-gradient-to-b from-white/[.08] to-white/[.02] border border-white/10 backdrop-blur-sm shadow-[0_40px_100px_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.08)] pt-16 px-8 pb-8 flex flex-col items-center">
        <h1 className="text-white text-[22px] font-extrabold tracking-tight text-center leading-tight">
          Toda a equipe do seu evento, <span className="bg-clip-text text-transparent" style={{ backgroundImage: 'linear-gradient(135deg,#FF8A4C,#FF4A0F 55%,#E9C58A)' }}>credenciada.</span>
        </h1>
        <p className="text-sm text-white/55 mt-2 mb-7 text-center">Entre para acessar o painel do seu evento</p>

        <form
          className="flex flex-col w-full gap-4"
          onSubmit={e => { e.preventDefault(); onEntrar(usuario.trim(), senha) }}
        >
          <div className="w-full flex flex-col gap-3">
            <input
              placeholder="CPF (supervisor) ou e-mail"
              type="text"
              required
              autoComplete="username"
              value={usuario}
              onChange={e => setUsuario(e.target.value)}
              className={CAMPO}
            />
            <div className="relative">
              <input
                placeholder="Senha"
                type={mostrarSenha ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={senha}
                onChange={e => setSenha(e.target.value)}
                className={`${CAMPO} pr-12`}
              />
              <button
                type="button"
                onClick={() => setMostrarSenha(v => !v)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/85 transition"
              >
                {mostrarSenha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {erro && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">{erro}</div>
            )}
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="btn-press w-full px-5 py-3.5 mt-1 rounded-full text-white font-extrabold text-sm disabled:opacity-50 hover:brightness-110 transition"
            style={{ background: 'linear-gradient(135deg, #A31B05 0%, #FF4A0F 60%, #FF8A4C 100%)', boxShadow: '0 10px 30px rgba(255,74,15,.45), inset 0 1px 0 rgba(255,255,255,.25)' }}
          >
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>

          <a
            href={WHATSAPP_SUPORTE}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center justify-center gap-1.5 text-xs text-white/55 hover:text-[#FF8A4C] transition mt-1"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            Esqueci a senha
          </a>
        </form>
      </div>

      <p className="relative z-10 mt-10 text-white/35 text-xs text-center">
        Credenciei © {new Date().getFullYear()} — Produzimos
      </p>

      <style>{`@keyframes flutua-login { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-8px) } } @media (prefers-reduced-motion: reduce) { img[alt="Credenciei"] { animation: none !important } }`}</style>
    </div>
  )
}
