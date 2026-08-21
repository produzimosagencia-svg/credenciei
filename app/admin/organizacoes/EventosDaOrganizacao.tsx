'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarDays, Plus, X, AlertCircle } from 'lucide-react'
import { atribuirEventoAOrganizacao } from '@/lib/actions'
import SeletorLista from '@/components/SeletorLista'

export type EventoResumo = { id: string; nome: string; data: string; ativo: boolean }

/**
 * Eventos de uma organização, com a possibilidade de anexar outros.
 *
 * Existe por um motivo concreto: evento criado pelo MASTER nascia sem
 * organização — ele não pertence a nenhuma — e evento sem dono não aparece na
 * tela de admin nenhum. Esta é a tela onde o master conserta isso e onde
 * transfere um evento de um cliente para outro.
 */
export default function EventosDaOrganizacao({
  organizacaoId, organizacaoNome, eventos, semDono,
}: {
  organizacaoId: string
  organizacaoNome: string
  eventos: EventoResumo[]
  /** Eventos sem organização, candidatos a serem anexados aqui. */
  semDono: EventoResumo[]
}) {
  const [abrindo, setAbrindo] = useState(false)
  const [escolhido, setEscolhido] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const mover = (eventoId: string, destino: string | null) => {
    setErro(null)
    startTransition(async () => {
      try {
        await atribuirEventoAOrganizacao(eventoId, destino)
        setEscolhido('')
        setAbrindo(false)
        router.refresh()
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível mover o evento.')
      }
    })
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="flex items-center gap-1.5 text-slate-500 text-2xs font-semibold uppercase tracking-wide">
          <CalendarDays className="w-3 h-3" /> Eventos ({eventos.length})
        </p>
        {!!semDono.length && !abrindo && (
          <button onClick={() => setAbrindo(true)} className="btn btn-secundario btn-sm">
            <Plus className="w-3.5 h-3.5 shrink-0" /> Anexar evento
          </button>
        )}
      </div>

      {/* Anexar: só aparece quando existe evento sem dono, senão seria um
          botão que nunca tem o que oferecer. */}
      {abrindo && (
        <div className="mb-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-slate-500 text-2xs font-semibold uppercase tracking-wide">
              Anexar evento a {organizacaoNome}
            </p>
            <button
              onClick={() => { setAbrindo(false); setEscolhido(''); setErro(null) }}
              aria-label="Cancelar"
              className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-200 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Mesmo desenho do seletor de data: botão que abre modal, e não o
              <select> nativo, que herda a aparência do sistema operacional e
              destoa do resto da tela. */}
          <SeletorLista
            opcoes={semDono.map(e => ({
              valor: e.id,
              rotulo: e.nome,
              detalhe: `${e.data}${e.ativo ? '' : ' · encerrado'}`,
            }))}
            valor={escolhido}
            onChange={setEscolhido}
            placeholder="Escolher evento sem organização…"
            titulo="Eventos sem organização"
            vazio="Todos os eventos já têm dono."
            busca={semDono.length > 6}
          />

          <button
            onClick={() => escolhido && mover(escolhido, organizacaoId)}
            disabled={!escolhido || pendente}
            className="btn btn-primario btn-sm w-full"
          >
            {pendente ? 'Anexando…' : 'Anexar ao cliente'}
          </button>
        </div>
      )}

      {erro && (
        <p className="flex items-start gap-1.5 text-erro-600 text-xs mb-2">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}

      {!eventos.length ? (
        <p className="text-slate-400 text-xs">Nenhum evento nesta organização.</p>
      ) : (
        <div className="space-y-1">
          {eventos.map(e => (
            <div key={e.id} className="flex items-center justify-between gap-2 text-xs">
              <Link href={`/admin/eventos/${e.id}`} className="text-brand-500 hover:underline truncate">
                {e.nome}
                <span className="text-slate-400"> · {e.data}{e.ativo ? '' : ' · encerrado'}</span>
              </Link>
              {/* Desanexar devolve o evento pra "sem organização", de onde ele
                  pode ser anexado a outro cliente. */}
              <button
                onClick={() => mover(e.id, null)}
                disabled={pendente}
                title="Desanexar desta organização"
                className="text-slate-400 hover:text-erro-600 shrink-0 disabled:opacity-50"
              >
                desanexar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
