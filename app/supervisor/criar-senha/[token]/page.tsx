import Image from 'next/image'
import Link from 'next/link'
import { AlertTriangle, QrCode } from 'lucide-react'
import fotoLogin from '@/app/login/imgTela1.jpg'
import { consultarConviteSenhaSupervisor } from '@/lib/supervisor-convite'
import FormCriarSenha from './FormCriarSenha'

export const dynamic = 'force-dynamic'

export default async function CriarSenhaSupervisorPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const convite = await consultarConviteSenhaSupervisor(token)

  return (
    <main className="min-h-screen flex bg-[#0a0918]">
      <div className="hidden md:block relative w-1/2 lg:w-3/5 overflow-hidden">
        <Image src={fotoLogin} alt="Credencial VIP em um evento" fill priority sizes="60vw" className="object-cover" />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
        <div className="absolute left-10 bottom-9 flex items-center gap-3">
          <div className="logo-marca w-11 h-11 rounded-xl flex items-center justify-center shadow-lg">
            <QrCode className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-white font-bold text-xl leading-tight tracking-tight">Credenciei</p>
            <p className="text-slate-300 text-2xs tracking-[0.2em] uppercase">Credenciamento para eventos</p>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="md:hidden flex items-center gap-2.5 mb-10">
            <div className="logo-marca w-9 h-9 rounded-lg flex items-center justify-center"><QrCode className="w-4 h-4 text-white" /></div>
            <span className="font-bold text-white text-lg">Credenciei</span>
          </div>

          {convite.valido ? (
            <>
              <h1 className="text-white text-3xl font-bold">Crie sua senha</h1>
              <p className="text-slate-400 text-sm mt-1.5">Olá, {convite.nome}. Finalize seu acesso de supervisor.</p>
              <div className="my-6 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <p className="text-slate-200 font-medium">{convite.evento}</p>
                <p className="text-slate-500 text-xs mt-1">Setor: {convite.setor}</p>
              </div>

              {/* O login vem ANTES do formulário, e destacado.
                  Sem isso a pessoa cria a senha, chega no login e não sabe o
                  que digitar no primeiro campo — foi o que aconteceu. Dizer
                  aqui é o único momento em que ela está olhando a tela certa. */}
              {convite.cpf && (
                <div className="mb-5 rounded-xl border border-brand-400/30 bg-brand-500/10 px-4 py-3">
                  <p className="text-brand-200 text-2xs font-semibold uppercase tracking-wide">
                    Seu login é o CPF
                  </p>
                  <p className="text-white text-lg font-bold tabular-nums mt-0.5">{convite.cpf}</p>
                  <p className="text-slate-400 text-xs mt-1">
                    Guarde este número: é ele que você digita para entrar, junto com a senha que
                    vai criar agora.
                  </p>
                </div>
              )}
              <FormCriarSenha token={token} />
            </>
          ) : (
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-300 flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-6 h-6" /></div>
              <h1 className="text-white text-2xl font-bold">Link indisponível</h1>
              <p className="text-slate-400 text-sm mt-2 mb-6">
                {convite.motivo === 'usado'
                  ? 'Este link já foi utilizado. Entre com o CPF e a senha que você criou.'
                  : convite.motivo === 'expirado'
                    ? 'Este link expirou. Peça um novo convite ao responsável pelo evento.'
                    : 'Este endereço não é válido. Confira se o link foi copiado por inteiro.'}
              </p>
              <Link href="/login" className="text-brand-300 hover:text-brand-200 text-sm font-medium">Voltar para o login</Link>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
