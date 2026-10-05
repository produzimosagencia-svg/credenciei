'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronRight, CalendarDays, MapPin, Building2 } from 'lucide-react'
import { formatarBR } from '@/lib/tz'
import { entrarNoEventoSupervisor } from '@/lib/actions'
import { Badge } from '@/components/ui/Superficie'
import { LogoLoading } from '@/components/LogoLoading'
import type { EventoEscolhivel } from '../EscolherEvento'

/**
 * Os cartões de "Meus eventos" — mesmo visual de `EscolherEvento`, mas com
 * DOIS comportamentos de clique, dependendo de ter ou não um vínculo de
 * supervisor NESTE evento:
 *
 *   - COM vínculo: clique grava o setor ali como ativo
 *     (`entrarNoEventoSupervisor`), senão as outras telas (que leem só
 *     `perfis.fornecedor_id`) não saberiam que a pessoa trocou. Ver
 *     `MeusSetores.tsx` — mesmo padrão de "navega primeiro, grava atrás".
 *   - SEM vínculo (evento que entrou só por `eventosDaOrganizacao` — ver
 *     `EscolherEvento.tsx` —, histórico de quem não é supervisor, ex.:
 *     operador de portão): não tem o que "entrar como supervisor" ali, e
 *     tentar dava "Sem permissão"/tela de erro (achado ao vivo, 05/10/2026,
 *     caso da Mara Lúcia, clicando no Henrique e Juliano). Vira link direto
 *     pra `/admin/atividades`, que já lista esse evento certinho pro papel
 *     dela — sem chamar a ação de entrar.
 */
export default function EscolherMeuEvento({ eventos, setoresPorEvento }: {
  eventos: EventoEscolhivel[]
  /** O(s) fornecedor(es) do supervisor DENTRO de cada evento — quem cobre dois no mesmo evento precisa saber qual vai abrir. */
  setoresPorEvento: Map<string, string[]>
}) {
  const [isPending, startTransition] = useTransition()
  const [carregando, setCarregando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  const escolher = (evento: EventoEscolhivel) => {
    setErro(null)
    setCarregando(evento.id)
    startTransition(async () => {
      const r = await entrarNoEventoSupervisor(evento.id)
      if (!r.ok) {
        setErro(r.error)
        setCarregando(null)
        return
      }
      router.push(`/admin/eventos/${r.eventoId}/fornecedor/${r.fornecedorId}`)
    })
  }

  return (
    <div className="p-2 space-y-1.5">
      {eventos.map(e => {
        const temVinculo = !!setoresPorEvento.get(e.id)?.length
        const conteudo = (
          <>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              e.ativo ? 'bg-brand-50 text-brand-600' : 'bg-slate-100 text-slate-400'
            }`}>
              <CalendarDays className="w-4 h-4" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-slate-800 font-semibold text-sm truncate flex items-center gap-2">
                {e.nome}
                {!e.ativo && <Badge tom="neutro">Encerrado</Badge>}
              </p>
              <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-500 text-xs mt-0.5">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="w-3 h-3 shrink-0 text-slate-300" />
                  {e.data_inicio ? formatarBR(e.data_inicio, 'data') : 'Sem data'}
                </span>
                {e.local && (
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <MapPin className="w-3 h-3 shrink-0 text-slate-300" />
                    <span className="truncate">{e.local}</span>
                  </span>
                )}
                {temVinculo ? (
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <Building2 className="w-3 h-3 shrink-0 text-slate-300" />
                    <span className="truncate">{setoresPorEvento.get(e.id)!.join(', ')}</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 min-w-0 text-slate-400">
                    Sem setor de supervisor aqui — só histórico
                  </span>
                )}
              </p>
            </div>
          </>
        )

        if (!temVinculo) {
          return (
            <Link
              key={e.id}
              href={`/admin/atividades?evento=${e.id}`}
              className="btn-press group w-full flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors border-slate-100 hover:border-slate-200 hover:bg-slate-50"
            >
              {conteudo}
              <div className="w-7 h-7 rounded-full bg-slate-50 group-hover:bg-brand-100 flex items-center justify-center shrink-0 transition-colors">
                <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600" />
              </div>
            </Link>
          )
        }

        return (
          <button
            key={e.id}
            type="button"
            disabled={isPending}
            onClick={() => escolher(e)}
            className={`btn-press group w-full flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-colors disabled:opacity-60 ${
              e.ativo
                ? 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/40'
                : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
            }`}
          >
            {conteudo}

            {carregando === e.id
              ? <LogoLoading tamanho={18} />
              : (
                <div className="w-7 h-7 rounded-full bg-slate-50 group-hover:bg-brand-100 flex items-center justify-center shrink-0 transition-colors">
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-brand-600" />
                </div>
              )}
          </button>
        )
      })}
      {erro && <p className="text-red-500 text-xs px-2 pt-1">{erro}</p>}
    </div>
  )
}
