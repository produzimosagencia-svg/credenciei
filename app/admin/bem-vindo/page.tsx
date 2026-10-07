import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ScanLine, ClipboardCheck } from 'lucide-react'
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
 * Não nomeia mais o evento (pedido do Juan, 04/10/2026): quem tem outro
 * papel além de operador de portão (ex.: vínculo de supervisor em outra
 * organização, caso da Mara Lúcia) via aqui um nome de evento que não
 * contava a história inteira dela, e parecia bug. "Bem-vindo ao
 * Credenciei", sempre — só o vínculo zero continua com aviso específico.
 *
 * A marca entra como imagem (pedido do Juan, 04/10/2026) — o laranja da
 * logo já tem contraste bom tanto no tema claro quanto no escuro, então
 * o mesmo arquivo serve pros dois sem precisar trocar por tema.
 */
export default async function BemVindoPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeAcompanhar(perfil)) redirect('/admin')

  const eventos = await eventosEscaneaveisSemData(perfil)

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/logo-laranja.png" alt="Credenciei" className="h-10 w-auto mx-auto mb-6" />

        <h1 className="text-slate-800 font-bold text-2xl">Boas-vindas ao <span className="text-brand-500">Credenciei</span></h1>
        {eventos.length === 0 ? (
          <p className="text-slate-500 text-sm mt-2">
            Você ainda não está vinculado a nenhum evento. Fale com quem te deu acesso.
          </p>
        ) : (
          <p className="text-slate-500 text-sm mt-2">
            Use o menu ao lado pra navegar a qualquer momento:
          </p>
        )}

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
