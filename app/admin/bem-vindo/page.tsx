import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ScanLine, ClipboardCheck, CalendarDays, ChevronRight, ListChecks, UserCheck, Clock, LogIn, Camera, LogOut } from 'lucide-react'
import { getPerfil, eventosEscaneaveisSemData, eventosAcontecendoHoje } from '@/lib/supabase-server'
import { podeAcompanhar, podeConferirListaManual } from '@/lib/permissions'
import { quantasNaListaManual } from '@/lib/lista-manual'
import AutoatendimentoBotao from '@/components/AutoatendimentoBotao'
import StatCard from '@/components/StatCard'
import AtualizarSozinho from '@/components/AtualizarSozinho'
import { numerosDoEvento } from '@/lib/numeros-do-evento'

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
  // Com um evento só, já entra nele (nada pra escolher).
  const escolhido = eventoParam ? ordenadosTodos.find(e => e.id === eventoParam) : ordenadosTodos.length === 1 ? ordenadosTodos[0] : undefined
  const ordenados = escolhido ? [escolhido] : ordenadosTodos
  // Lista manual (entrada sem QR Code): o botão só aparece quando o evento tem alguém na lista.
  const naListaManual = escolhido && podeConferirListaManual(perfil) ? await quantasNaListaManual(escolhido.id) : 0
  // Os números do evento no dia (Juan, 18/10/2026: o operador também precisa saber o que está acontecendo no evento).
  const numeros = escolhido && hoje.has(escolhido.id) ? await numerosDoEvento(escolhido.id).catch(() => null) : null
  const pct = (v: number) => (numeros && numeros.equipe > 0 ? Math.round((v / numeros.equipe) * 100) : 0)

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
        {/*
          * Dois passos (Juan, 15/10/2026: "clica no evento… aí dentro do evento tem que ter essas opções"): primeiro a
          * lista de eventos; tocando num deles, abre o evento com o Scanner, o Registrar ponto e o autoatendimento.
          */}
        {!escolhido && ordenados.length > 0 && (
          <div className="mt-5 text-left">
            <p className="text-slate-800 font-semibold text-sm flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4 text-brand-500" /> Em qual evento você vai trabalhar?
            </p>
            <div className="mt-3 space-y-3">
              {ordenados.map(e => (
                <Link
                  key={e.id}
                  href={`/admin/bem-vindo?evento=${e.id}`}
                  className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-2xl p-4 hover:border-brand-300 hover:shadow-sm transition"
                >
                  <span className="min-w-0">
                    <span className="block text-slate-800 font-semibold text-sm break-words">{e.nome}</span>
                    {hoje.has(e.id)
                      ? <span className="indicador-selo selo-sucesso mt-1.5 inline-block">Acontecendo hoje</span>
                      : <span className="indicador-selo selo-neutro mt-1.5 inline-block">Fora do dia</span>}
                  </span>
                  <ChevronRight className="w-5 h-5 text-slate-300 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {escolhido && (
          <div className="mt-5 text-left">
            <div className="bg-white border border-slate-200 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="text-slate-800 font-bold text-base min-w-0 break-words">{escolhido.nome}</p>
                {hoje.has(escolhido.id)
                  ? <span className="indicador-selo selo-sucesso shrink-0">Acontecendo hoje</span>
                  : <span className="indicador-selo selo-neutro shrink-0">Fora do dia</span>}
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* O Scanner só lista evento que está acontecendo hoje: fora do dia o botão não levaria a lugar nenhum. */}
                {hoje.has(escolhido.id) ? (
                  <Link href={`/scan?evento=${escolhido.id}`} className="btn btn-primario justify-center py-3">
                    <ScanLine className="w-4 h-4 shrink-0" /> Scanner
                  </Link>
                ) : (
                  <span className="btn btn-secundario justify-center py-3 opacity-50 cursor-not-allowed" aria-disabled="true">
                    <ScanLine className="w-4 h-4 shrink-0" /> Scanner
                  </span>
                )}
                <Link href={`/admin/localizar?evento=${escolhido.id}`} className="btn btn-secundario justify-center py-3">
                  <ClipboardCheck className="w-4 h-4 shrink-0" /> Registrar ponto
                </Link>
                {naListaManual > 0 && (
                  <Link href={`/admin/lista-manual?evento=${escolhido.id}`} className="btn btn-secundario justify-center py-3 sm:col-span-2">
                    <ListChecks className="w-4 h-4 shrink-0" /> Lista manual <span className="text-slate-400 font-normal">({naListaManual})</span>
                  </Link>
                )}
              </div>
              {!hoje.has(escolhido.id) && (
                <p className="text-slate-400 text-xs mt-2">O Scanner abre nos dias de operação do evento.</p>
              )}
              {/*
                * "Estou indo embora" / "Cheguei" (pedido do Juan, 08/10/2026) — embaixo dos botões de cima de propósito:
                * não é o uso de todo dia, é o que o operador aperta uma vez, no fim do turno. Só no dia do evento.
                */}
              {hoje.has(escolhido.id) && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <AutoatendimentoBotao eventoId={escolhido.id} tema="claro" />
                </div>
              )}
            </div>
            {/*
              * OS NÚMEROS DO EVENTO, os mesmos cinco da tela do evento (lib/numeros-do-evento.ts). "Presentes" em cima,
              * na linha inteira: é a pergunta do portão. Os outros em dupla — cabe igual no celular e no computador.
              */}
            {numeros && (
              <div className="mt-4 space-y-2">
                <AtualizarSozinho segundos={30} />
                <p className="text-slate-500 text-2xs uppercase tracking-wide font-semibold px-1">
                  Como está o evento · {numeros.dia.slice(8, 10)}/{numeros.dia.slice(5, 7)}
                </p>
                <StatCard emLinha label="Presentes no momento" value={numeros.presentes} sub="entraram e ainda não saíram" icon={Clock} tom="sucesso" />
                <div className="grid grid-cols-2 gap-2">
                  <StatCard label="Funcionários" value={numeros.funcionariosDoEvento} icon={UserCheck} tom="neutro" small />
                  <StatCard label="Entradas" value={`${numeros.entradas}/${numeros.equipe}`} sub={`${pct(numeros.entradas)}% da equipe`} icon={LogIn} tom="acento" small />
                  <StatCard label="Batida do meio" value={`${numeros.meio}/${numeros.equipe}`} sub={`${pct(numeros.meio)}% da equipe`} icon={Camera} tom="info" small />
                  <StatCard label="Saídas" value={`${numeros.saidas}/${numeros.equipe}`} sub={`${pct(numeros.saidas)}% da equipe`} icon={LogOut} tom="aviso" small />
                </div>
                <p className="text-slate-400 text-2xs px-1">Atualiza sozinho a cada 30 segundos.</p>
              </div>
            )}
            {ordenadosTodos.length > 1 && (
              <Link href="/admin/bem-vindo" className="block text-center text-brand-600 text-sm font-semibold hover:underline mt-3">
                Trocar de evento
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
