'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus, Check, AlertCircle } from 'lucide-react'
import { atribuirColaboradorAoEvento } from '@/lib/actions'

export type SetorOpcao = { id: string; nome: string; eventoId: string }
export type EventoOpcao = { id: string; nome: string; ativo: boolean; data: string }

/**
 * Coloca uma pessoa da base dentro do evento de um cliente.
 *
 * Dois passos porque o segundo depende do primeiro: escolhe o evento, e só
 * então aparecem os setores DAQUELE evento. Uma lista única com todos os
 * setores da plataforma misturaria "Bar" de três clientes diferentes, e o
 * master escolheria o errado sem perceber.
 */
export default function AtribuirEvento({
  cpf, nome, eventos, setores, jaNosEventos,
}: {
  cpf: string
  nome: string
  eventos: EventoOpcao[]
  setores: SetorOpcao[]
  /** Eventos em que a pessoa já está — não dá pra atribuir duas vezes. */
  jaNosEventos: string[]
}) {
  const [eventoId, setEventoId] = useState('')
  const [setorId, setSetorId] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const setoresDoEvento = useMemo(
    () => setores.filter(s => s.eventoId === eventoId),
    [setores, eventoId]
  )

  const jaEsta = jaNosEventos.includes(eventoId)

  const atribuir = () => {
    setErro(null)
    setFeito(null)
    startTransition(async () => {
      try {
        const r = await atribuirColaboradorAoEvento(cpf, setorId)
        setFeito(
          `${nome} entrou em ${r.evento}, no setor ${r.setor}.` +
          (!r.ativo ? ' Entrou INATIVA porque o setor bateu o teto — ative na tela do setor.' : '') +
          (r.semTelefone ? ' Sem telefone cadastrado: ela não recebe o link da credencial.' : '')
        )
        setSetorId('')
        router.refresh()
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível atribuir. Tente de novo.')
      }
    })
  }

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-end">
        <label className="block min-w-0">
          <span className="text-slate-500 text-xs">Evento</span>
          <select
            value={eventoId}
            onChange={e => { setEventoId(e.target.value); setSetorId(''); setFeito(null); setErro(null) }}
            className="input mt-1"
          >
            <option value="">Escolha o evento…</option>
            {eventos.map(e => (
              <option key={e.id} value={e.id}>
                {e.nome} · {e.data}{e.ativo ? '' : ' (encerrado)'}
              </option>
            ))}
          </select>
        </label>

        <label className="block min-w-0">
          <span className="text-slate-500 text-xs">Setor</span>
          <select
            value={setorId}
            onChange={e => { setSetorId(e.target.value); setFeito(null); setErro(null) }}
            disabled={!eventoId || jaEsta}
            className="input mt-1 disabled:opacity-50"
          >
            <option value="">
              {!eventoId ? 'Escolha o evento primeiro' : setoresDoEvento.length ? 'Escolha o setor…' : 'Este evento não tem setores'}
            </option>
            {setoresDoEvento.map(s => (
              <option key={s.id} value={s.id}>{s.nome}</option>
            ))}
          </select>
        </label>

        <button
          onClick={atribuir}
          disabled={!setorId || pendente || jaEsta}
          className="btn btn-primario"
        >
          <CalendarPlus className="w-3.5 h-3.5 shrink-0" />
          {pendente ? 'Atribuindo…' : 'Atribuir'}
        </button>
      </div>

      {jaEsta && (
        <p className="flex items-start gap-1.5 text-aviso-700 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
          {nome} já está neste evento. Uma pessoa só entra uma vez por evento.
        </p>
      )}
      {erro && (
        <p className="flex items-start gap-1.5 text-erro-600 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}
      {feito && (
        <p className="flex items-start gap-1.5 text-sucesso-700 text-xs">
          <Check className="w-3.5 h-3.5 shrink-0 mt-px" /> {feito}
        </p>
      )}
    </div>
  )
}
