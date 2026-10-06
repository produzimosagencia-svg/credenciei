import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import type { ConviteSupervisorPublico } from '@/lib/supervisor-convite'
import CartaoDeEntrada from '@/components/ui/CartaoDeEntrada'
import FormCriarSenha from './FormCriarSenha'

const DESTAQUE = 'bg-clip-text text-transparent'
const GRADIENTE = { backgroundImage: 'linear-gradient(135deg,#FF8A4C,#FF4A0F 55%,#E9C58A)' }

/**
 * O que a tela de criar senha mostra, dado o convite já consultado. Fica à
 * parte da página só pra poder ser desenhada sem um convite de verdade.
 */
export default function ConteudoCriarSenha({ convite, token }: { convite: ConviteSupervisorPublico; token: string }) {
  const recuperacao = convite.finalidade === 'recuperacao'
  return (
    <CartaoDeEntrada>
      {convite.valido ? (
        <>
          <h1 className="text-white text-[22px] font-extrabold tracking-tight text-center leading-tight">
            {recuperacao
              ? <>Crie sua <span className={DESTAQUE} style={GRADIENTE}>senha nova.</span></>
              : <>Crie sua senha e <span className={DESTAQUE} style={GRADIENTE}>acesse.</span></>}
          </h1>
          <p className="text-sm text-white/55 mt-2 mb-6 text-center">
            {recuperacao
              ? <>Olá, {convite.nome}. Escolha a senha que você vai usar para entrar.</>
              : <>Olá, {convite.nome}. Finalize seu acesso de supervisor.</>}
          </p>

          {/* Primeiro acesso: onde a pessoa vai atuar. Na recuperação isso não é assunto. */}
          {!recuperacao && (
            <div className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
              <p className="text-white/90 font-medium">{convite.evento}</p>
              <p className="text-white/45 text-xs mt-1">Fornecedor: {convite.setor}</p>
            </div>
          )}

          {/* O login vem ANTES do formulário, e destacado: sem isso a pessoa
              cria a senha, chega no login e não sabe o que digitar no primeiro
              campo — foi o que aconteceu. */}
          {convite.cpf && (
            <div className="mb-5 rounded-xl border border-[#FF4A0F]/30 bg-[#FF4A0F]/10 px-4 py-3">
              <p className="text-[#FF8A4C] text-2xs font-semibold uppercase tracking-wide">Seu login é o CPF</p>
              <p className="text-white text-lg font-bold tabular-nums mt-0.5">{convite.cpf}</p>
              <p className="text-white/50 text-xs mt-1">
                Guarde este número: é ele que você digita para entrar, junto com a senha que vai criar agora.
              </p>
            </div>
          )}
          <FormCriarSenha token={token} />
        </>
      ) : (
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-300 flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-6 h-6" /></div>
          <h1 className="text-white text-xl font-extrabold">Link indisponível</h1>
          <p className="text-white/55 text-sm mt-2 mb-6">
            {convite.motivo === 'usado'
              ? 'Este link já foi utilizado. Entre com o CPF e a senha que você criou.'
              : convite.motivo === 'expirado'
                ? 'Este link expirou. Volte ao login e toque em "Esqueci a senha" para receber um novo.'
                : 'Este endereço não é válido. Confira se o link foi copiado por inteiro.'}
          </p>
          <Link href="/login" className="text-[#FF8A4C] hover:brightness-125 text-sm font-medium">Voltar para o login</Link>
        </div>
      )}
    </CartaoDeEntrada>
  )
}
