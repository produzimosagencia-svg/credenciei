'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { criarSenhaAction, type EstadoCriarSenha } from './actions'

const INICIAL: EstadoCriarSenha = { ok: false, mensagem: '' }

// Mesmos campos e botão do login (components/ui/modern-stunning-sign-in.tsx).
const CAMPO =
  'w-full px-5 py-3.5 rounded-xl bg-white/[.06] border border-white/10 text-white placeholder-white/35 text-sm outline-none ' +
  'focus:border-[#FF4A0F]/70 focus:ring-4 focus:ring-[#FF4A0F]/15 transition ' +
  '[&:-webkit-autofill]:[-webkit-text-fill-color:#fff] [&:-webkit-autofill]:[box-shadow:0_0_0_1000px_#1c1a19_inset] [&:-webkit-autofill]:[caret-color:#fff]'
const BOTAO_STYLE = {
  background: 'linear-gradient(135deg, #A31B05 0%, #FF4A0F 60%, #FF8A4C 100%)',
  boxShadow: '0 10px 30px rgba(255,74,15,.45), inset 0 1px 0 rgba(255,255,255,.25)',
}

export default function FormCriarSenha({ token }: { token: string }) {
  const action = criarSenhaAction.bind(null, token)
  const [estado, formAction, pendente] = useActionState(action, INICIAL)
  const [mostrar, setMostrar] = useState(false)

  if (estado.ok) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-[#FF4A0F]/15 text-[#FF8A4C] flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-white text-xl font-extrabold">Senha criada</h2>
        <p className="text-white/55 text-sm mt-2 mb-6">Pronto. Agora você já pode entrar usando seu CPF e a senha nova.</p>
        <Link href="/login" className="btn-press block w-full px-5 py-3.5 rounded-xl text-white font-extrabold text-sm hover:brightness-110 transition" style={BOTAO_STYLE}>
          Ir para o login
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="senha" className="text-sm font-medium text-white/70">Crie sua senha</label>
        <div className="relative">
          <input
            id="senha"
            name="senha"
            type={mostrar ? 'text' : 'password'}
            required
            minLength={8}
            maxLength={128}
            autoComplete="new-password"
            placeholder="Mínimo de 8 caracteres"
            className={`${CAMPO} pr-12`}
          />
          <button
            type="button"
            onClick={() => setMostrar(v => !v)}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/85 transition"
            aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-white/40 text-xs">Use pelo menos uma letra e um número.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirmacao" className="text-sm font-medium text-white/70">Confirme a senha</label>
        <input
          id="confirmacao"
          name="confirmacao"
          type={mostrar ? 'text' : 'password'}
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          placeholder="Digite novamente"
          className={CAMPO}
        />
      </div>

      {estado.mensagem && (
        <p role="alert" aria-live="polite" className="text-red-300 text-sm bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
          {estado.mensagem}
        </p>
      )}

      <button
        type="submit"
        disabled={pendente}
        className="btn-press w-full px-5 py-3.5 rounded-xl text-white font-extrabold text-sm disabled:opacity-50 hover:brightness-110 transition flex items-center justify-center gap-2"
        style={BOTAO_STYLE}
      >
        <LockKeyhole className="w-4 h-4" />
        {pendente ? 'Criando senha...' : 'Criar senha e acessar'}
      </button>
    </form>
  )
}
