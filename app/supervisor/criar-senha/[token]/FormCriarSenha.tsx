'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { CheckCircle2, Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { criarSenhaAction, type EstadoCriarSenha } from './actions'

const INICIAL: EstadoCriarSenha = { ok: false, mensagem: '' }

export default function FormCriarSenha({ token }: { token: string }) {
  const action = criarSenhaAction.bind(null, token)
  const [estado, formAction, pendente] = useActionState(action, INICIAL)
  const [mostrar, setMostrar] = useState(false)

  if (estado.ok) {
    return (
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-green-500/15 text-green-300 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <h2 className="text-white text-xl font-bold">Acesso pronto</h2>
        <p className="text-slate-400 text-sm mt-2 mb-6">Sua senha foi criada. Agora você já pode entrar usando seu CPF.</p>
        <Link href="/login" className="btn-press block w-full bg-brand-500 hover:bg-brand-400 text-white py-3.5 rounded-xl font-semibold text-sm">
          Ir para o login
        </Link>
      </div>
    )
  }

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="senha" className="text-sm font-medium text-slate-300">Crie sua senha</label>
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
            className="w-full bg-slate-50 border border-transparent rounded-xl px-4 py-3 pr-11 text-slate-800 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow"
          />
          <button
            type="button"
            onClick={() => setMostrar(v => !v)}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {mostrar ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-slate-500 text-xs">Use pelo menos uma letra e um número.</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="confirmacao" className="text-sm font-medium text-slate-300">Confirme a senha</label>
        <input
          id="confirmacao"
          name="confirmacao"
          type={mostrar ? 'text' : 'password'}
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          placeholder="Digite novamente"
          className="w-full bg-slate-50 border border-transparent rounded-xl px-4 py-3 text-slate-800 text-sm outline-none focus:ring-2 focus:ring-brand-400 transition-shadow"
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
        className="btn-press w-full bg-brand-500 hover:bg-brand-400 disabled:opacity-50 text-white py-3.5 rounded-xl font-semibold text-sm shadow-lg shadow-brand-500/30 flex items-center justify-center gap-2"
      >
        <LockKeyhole className="w-4 h-4" />
        {pendente ? 'Criando senha...' : 'Criar senha e acessar'}
      </button>
    </form>
  )
}
