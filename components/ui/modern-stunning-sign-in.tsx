'use client'
import { useState } from 'react'
import { Eye, EyeOff, KeyRound, X, Check } from 'lucide-react'
import { LogoLoading } from '@/components/LogoLoading'
import { CpfInput } from '@/components/inputs'
import { solicitarRecuperacaoSenha } from '@/lib/actions'
import { mensagemAmigavel } from '@/lib/erros'

/**
 * Cartão de login — adaptado do template "modern stunning sign in".
 *
 * O que mudou em relação ao template: o ícone 3D da marca no lugar do logo
 * na bolinha, um slogan, o botão no gradiente laranja, e "Esqueci a senha"
 * abrindo o autoatendimento por CPF (ver `RecuperarSenha` abaixo) — antes
 * levava pro WhatsApp do suporte pra alguém resetar na mão (pedido do Juan,
 * 03/10/2026: tirar o humano do meio). Saíram o botão do Google e o "crie
 * sua conta". O campo aceita CPF ou e-mail, porque o supervisor entra com
 * CPF.
 *
 * Só desenha e coleta. Quem autentica é a página (`onEntrar`), que já sabe
 * falar com /api/auth/login.
 */

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
  const [recuperando, setRecuperando] = useState(false)

  return (
    <div
      className="min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center px-4 py-10 md:flex-row md:items-center md:justify-center md:gap-16 lg:gap-28 md:px-12"
      style={{ background: 'radial-gradient(1000px 520px at 30% 40%, rgba(255,74,15,.22), transparent 60%), radial-gradient(700px 420px at 100% 100%, rgba(163,27,5,.16), transparent 60%), #0d0c0c' }}
    >
      {/* Ícone 3D com a luz por trás. No celular fica pequeno, encaixado no
          topo do cartão; no desktop vira a coluna da esquerda, bem grande. */}
      <div className="relative z-10 -mb-12 md:mb-0 md:flex-none">
        <span className="absolute inset-0 rounded-full blur-2xl md:blur-3xl" style={{ background: 'radial-gradient(circle, rgba(255,74,15,.55), transparent 70%)' }} aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/iso-3d.png" alt="Credenciei" className="relative w-28 h-28 md:w-[min(40vw,520px)] md:h-[min(40vw,520px)] object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,.6)] md:drop-shadow-[0_40px_80px_rgba(0,0,0,.7)]" />
      </div>

      {/* Cartão de vidro */}
      <div className="relative z-0 w-full max-w-sm md:max-w-md md:flex-none rounded-[28px] bg-gradient-to-b from-white/[.08] to-white/[.02] border border-white/10 backdrop-blur-sm shadow-[0_40px_100px_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.08)] pt-16 md:pt-10 px-8 md:px-10 pb-8 md:pb-10 flex flex-col items-center">
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
            className="btn-press w-full px-5 py-3.5 mt-1 rounded-xl text-white font-extrabold text-sm disabled:opacity-50 hover:brightness-110 transition flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #A31B05 0%, #FF4A0F 60%, #FF8A4C 100%)', boxShadow: '0 10px 30px rgba(255,74,15,.45), inset 0 1px 0 rgba(255,255,255,.25)' }}
          >
            {carregando && <LogoLoading tamanho="xs" />}
            {carregando ? 'Entrando…' : 'Entrar'}
          </button>

          <button
            type="button"
            onClick={() => setRecuperando(true)}
            className="inline-flex items-center justify-center gap-1.5 text-xs text-white/55 hover:text-[#FF8A4C] transition mt-1"
          >
            <KeyRound className="w-3.5 h-3.5" />
            Esqueci a senha
          </button>
        </form>
      </div>

      {recuperando && <RecuperarSenha onFechar={() => setRecuperando(false)} />}

      <p className="relative z-10 mt-10 md:mt-0 md:absolute md:bottom-6 md:left-0 md:right-0 text-white/35 text-xs text-center">
        Credenciei © {new Date().getFullYear()} — Produzimos
      </p>
    </div>
  )
}

/**
 * "Esqueci a senha" — autoatendimento por CPF (pedido do Juan, 03/10/2026).
 *
 * A resposta do servidor é SEMPRE a mesma tela de sucesso, exista ou não o
 * CPF — não é esta tela que decide isso, é `solicitarRecuperacaoSenha` (ver
 * lib/actions.ts): nunca dar pra descobrir por tentativa se um CPF tem
 * conta aqui.
 */
function RecuperarSenha({ onFechar }: { onFechar: () => void }) {
  const [cpf, setCpf] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState('')

  const digitos = cpf.replace(/\D/g, '')

  const enviar = async () => {
    setErro('')
    setEnviando(true)
    try {
      const r = await solicitarRecuperacaoSenha(digitos)
      if ('error' in r) { setErro(r.error); return }
      setEnviado(true)
    } catch (e) {
      setErro(mensagemAmigavel(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={onFechar}>
      <div
        className="w-full max-w-sm rounded-[28px] bg-gradient-to-b from-[#1c1a19] to-[#141211] border border-white/10 shadow-[0_40px_100px_rgba(0,0,0,.6)] p-7"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-white font-extrabold text-lg">Esqueci a senha</h2>
          <button onClick={onFechar} aria-label="Fechar" className="text-white/40 hover:text-white/80 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {enviado ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-[#FF4A0F]/15 flex items-center justify-center mx-auto mb-4">
              <Check className="w-6 h-6 text-[#FF8A4C]" />
            </div>
            <p className="text-white text-sm leading-relaxed">
              Se este CPF tiver um acesso cadastrado, enviamos um link pelo WhatsApp do número cadastrado pra você criar uma senha nova.
            </p>
            <button
              onClick={onFechar}
              className="mt-6 w-full px-5 py-3 rounded-xl text-white font-bold text-sm hover:brightness-110 transition"
              style={{ background: 'linear-gradient(135deg, #A31B05 0%, #FF4A0F 60%, #FF8A4C 100%)' }}
            >
              Entendi
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-white/55 mt-1 mb-5">
              Digite o CPF do seu acesso — mandamos um link pelo WhatsApp já cadastrado pra você criar uma senha nova.
            </p>
            <CpfInput
              defaultValue={cpf}
              onValueChange={setCpf}
              placeholder="000.000.000-00"
              autoFocus
              className={CAMPO}
            />
            {erro && (
              <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5 mt-3">{erro}</div>
            )}
            <button
              onClick={enviar}
              disabled={enviando || digitos.length !== 11}
              className="btn-press w-full px-5 py-3.5 mt-5 rounded-xl text-white font-extrabold text-sm disabled:opacity-50 hover:brightness-110 transition flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #A31B05 0%, #FF4A0F 60%, #FF8A4C 100%)' }}
            >
              {enviando && <LogoLoading tamanho="xs" />}
              {enviando ? 'Enviando…' : 'Enviar link pelo WhatsApp'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
