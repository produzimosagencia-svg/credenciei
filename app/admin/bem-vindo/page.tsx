import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ScanLine, ClipboardCheck, CalendarDays } from 'lucide-react'
import { getPerfil, eventosEscaneaveisSemData, eventosAcontecendoHoje } from '@/lib/supabase-server'
import { podeAcompanhar } from '@/lib/permissions'
import AutoatendimentoBotao from '@/components/AutoatendimentoBotao'

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
export default async function BemVindoPage({ searchParams }: { searchParams: Promise<{ evento?: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeAcompanhar(perfil)) redirect('/admin')

  const eventos = await eventosEscaneaveisSemData(perfil)
  const hoje = await eventosAcontecendoHoje(eventos.map(e => e.id))
  // Quem está acontecendo hoje vem primeiro: é nele que o operador provavelmente vai trabalhar.
  const ordenadosTodos = [...eventos].sort((a, b) => Number(hoje.has(b.id)) - Number(hoje.has(a.id)))
  // Vindo do seletor de evento do topo (`?evento=`): mostra só o escolhido, com um caminho de volta à lista.
  const { evento: eventoParam } = await searchParams
  const escolhido = eventoParam ? ordenadosTodos.find(e => e.id === eventoParam) : undefined
  const ordenados = escolhido ? [escolhido] : ordenadosTodos

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

        {/*
          * O operador escolhe o EVENTO em que vai trabalhar (pedido do Juan, 07/10/2026): antes
          * a tela não dizia qual evento estava valendo, e o menu levava a telas sem evento. Cada
          * evento abre direto o Scanner ou o Registro de ponto JÁ dentro dele.
          */}
        {ordenados.length > 0 && (
          <div className="mt-5 text-left">
            <p className="text-slate-800 font-semibold text-sm flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-brand-500" /> {escolhido ? 'Evento escolhido' : 'Em qual evento você vai trabalhar?'}
            </p>
            <div className="mt-3 space-y-3">
              {ordenados.map(e => (
                <div key={e.id} className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-slate-800 font-semibold text-sm min-w-0 break-words">{e.nome}</p>
                    {hoje.has(e.id)
                      ? <span className="indicador-selo selo-sucesso shrink-0">Acontecendo hoje</span>
                      : <span className="indicador-selo selo-neutro shrink-0">Fora do dia</span>}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {/* O Scanner só lista evento que está acontecendo hoje: fora do dia o botão não levaria a lugar nenhum. */}
                    {hoje.has(e.id) ? (
                      <Link href={`/scan?evento=${e.id}`} className="btn btn-primario justify-center">
                        <ScanLine className="w-4 h-4 shrink-0" /> Scanner
                      </Link>
                    ) : (
                      <span className="btn btn-secundario justify-center opacity-50 cursor-not-allowed" aria-disabled="true">
                        <ScanLine className="w-4 h-4 shrink-0" /> Scanner
                      </span>
                    )}
                    <Link href={`/admin/localizar?evento=${e.id}`} className="btn btn-secundario justify-center">
                      <ClipboardCheck className="w-4 h-4 shrink-0" /> Registrar ponto
                    </Link>
                  </div>
                  {/*
                    * "Estou indo embora" / "Cheguei" (pedido do Juan, 08/10/2026) — fica embaixo dos botões de
                    * cima de propósito: não é o uso de todo dia, é o que o operador aperta uma vez, no fim do
                    * turno. Só no evento de hoje, mesmo motivo do Scanner acima.
                    */}
                  {hoje.has(e.id) && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <AutoatendimentoBotao eventoId={e.id} tema="claro" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {escolhido && ordenadosTodos.length > 1 && (
              <Link href="/admin/bem-vindo" className="block text-center text-brand-600 text-sm font-semibold hover:underline mt-3">
                Ver todos os eventos
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
