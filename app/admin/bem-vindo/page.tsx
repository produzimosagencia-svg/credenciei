import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ScanLine, ClipboardCheck, PartyPopper } from 'lucide-react'
import { getPerfil, eventosEscaneaveisSemData } from '@/lib/supabase-server'
import { podeAcompanhar } from '@/lib/permissions'

export const revalidate = 0

/**
 * Tela de boas-vindas do operador de portão — pedido do Juan, 02/10/2026,
 * um dia antes de um evento: ele testou o acesso de um porteiro antes do
 * dia do evento e caiu em "Nenhum evento ativo disponível" (o scanner só
 * lista eventos ACONTECENDO HOJE — `eventosAcontecendoHoje`), uma tela sem
 * nome de evento nem orientação nenhuma, "muito feia" pra quem está vendo
 * o sistema pela primeira vez.
 *
 * Esta tela resolve os eventos do operador SEM o filtro de "hoje"
 * (`eventosEscaneaveisSemData` — mesma função que já alimenta o scanner,
 * só sem a segunda peneira) justamente pra poder dizer o nome do evento
 * ANTES de ele começar. Navegação de verdade (escanear, registrar ponto)
 * continua nos mesmos lugares de sempre — esta tela só aponta pra eles.
 */
export default async function BemVindoPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeAcompanhar(perfil)) redirect('/admin')

  const eventos = await eventosEscaneaveisSemData(perfil)

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-5">
          <PartyPopper className="w-7 h-7 text-brand-500" />
        </div>

        {eventos.length === 0 ? (
          <>
            <h1 className="text-slate-800 font-bold text-2xl">Bem-vindo ao Credenciei</h1>
            <p className="text-slate-500 text-sm mt-2">
              Você ainda não está vinculado a nenhum evento. Fale com quem te deu acesso.
            </p>
          </>
        ) : eventos.length === 1 ? (
          <>
            <h1 className="text-slate-800 font-bold text-2xl">Bem-vindo ao</h1>
            <p className="text-brand-500 font-extrabold text-3xl mt-1">{eventos[0].nome}</p>
          </>
        ) : (
          <>
            <h1 className="text-slate-800 font-bold text-2xl">Bem-vindo!</h1>
            <p className="text-slate-500 text-sm mt-2">Você pode atuar nestes eventos:</p>
            <p className="text-brand-500 font-bold text-lg mt-1">
              {eventos.map(e => e.nome).join(' · ')}
            </p>
          </>
        )}

        <p className="text-slate-500 text-sm mt-6">
          Use o menu ao lado pra navegar a qualquer momento:
        </p>

        <div className="mt-4 space-y-3">
          <Link
            href="/scan"
            className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-brand-300 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <ScanLine className="w-5 h-5 text-brand-500" />
            </div>
            <div className="min-w-0">
              <p className="text-slate-800 font-semibold text-sm">Scanner</p>
              <p className="text-slate-500 text-xs mt-0.5">Leia o QR Code da credencial no portão</p>
            </div>
          </Link>

          <Link
            href="/admin/localizar"
            className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-brand-300 transition-colors"
          >
            <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-5 h-5 text-brand-500" />
            </div>
            <div className="min-w-0">
              <p className="text-slate-800 font-semibold text-sm">Registro de ponto</p>
              <p className="text-slate-500 text-xs mt-0.5">Procure por nome ou CPF e registre manualmente</p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
