'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldBan, Plus, AlertTriangle, Check } from 'lucide-react'
import { bloquearCpf, desbloquearCpf, type CpfBloqueado } from '@/lib/actions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Secao } from '@/components/ui/Superficie'

/** O formulário e a lista. A explicação do que é isto mora na página. */
export default function PainelBloqueio({
  eventoId, bloqueados,
}: {
  eventoId: string
  bloqueados: CpfBloqueado[]
}) {
  const router = useRouter()
  const [cpf, setCpf] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const bloquear = (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setOk(null)
    iniciar(async () => {
      const r = await bloquearCpf(eventoId, cpf, motivo)
      if (r.error) { setErro(r.error); return }
      setOk(`${formatCpf(r.cpf!)} bloqueado neste evento.`)
      setCpf('')
      setMotivo('')
      router.refresh()
    })
  }

  const liberar = (id: string) => {
    setErro(null)
    setOk(null)
    iniciar(async () => {
      const r = await desbloquearCpf(id, eventoId)
      if (r.error) { setErro(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <Secao
        tom="aviso"
        icone={<ShieldBan className="w-3.5 h-3.5" />}
        titulo="Bloquear um CPF"
        descricao="Vale só para este evento"
        corpoClassName="p-5 space-y-3"
      >
        <form onSubmit={bloquear} className="flex flex-col sm:flex-row gap-2">
          <input
            required value={cpf} onChange={e => { setCpf(formatCpf(e.target.value)); setErro(null) }}
            placeholder="CPF" className="input sm:w-48" inputMode="numeric" autoComplete="off"
          />
          <input
            value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Motivo (opcional) — ex.: tentou entrar sem estar escalado"
            className="input flex-1" autoComplete="off"
          />
          <button type="submit" disabled={pendente} className="btn btn-primario shrink-0">
            <Plus className="w-4 h-4" />
            {pendente ? 'Aguarde…' : 'Bloquear'}
          </button>
        </form>

        {erro && (
          <p className="flex items-start gap-1.5 text-red-600 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
          </p>
        )}
        {ok && (
          <p className="flex items-start gap-1.5 text-green-700 text-xs">
            <Check className="w-3.5 h-3.5 shrink-0 mt-px" /> {ok}
          </p>
        )}
      </Secao>

      <Secao
        icone={<ShieldBan className="w-3.5 h-3.5" />}
        titulo={`${bloqueados.length} CPF${bloqueados.length === 1 ? '' : 's'} bloqueado${bloqueados.length === 1 ? '' : 's'}`}
        descricao="Liberar devolve o acesso na hora"
        corpoClassName={bloqueados.length ? 'p-2' : 'p-5'}
      >
        {!bloqueados.length ? (
          <p className="text-slate-500 text-sm">Nenhum CPF bloqueado neste evento.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {bloqueados.map(b => (
              <li key={b.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800 text-sm font-semibold tabular-nums">{formatCpf(b.cpf)}</p>
                  <p className="text-slate-400 text-2xs truncate">
                    {b.motivo ? `${b.motivo} · ` : ''}
                    {b.bloqueadoPor ? `por ${b.bloqueadoPor} · ` : ''}
                    {formatarBR(b.criadoEm, 'curto')}
                  </p>
                </div>
                <button onClick={() => liberar(b.id)} disabled={pendente} className="btn btn-secundario btn-sm shrink-0">
                  Liberar
                </button>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  )
}
