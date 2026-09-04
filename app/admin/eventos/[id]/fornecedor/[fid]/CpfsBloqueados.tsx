'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldBan, Plus, X, AlertTriangle } from 'lucide-react'
import { bloquearCpf, desbloquearCpf, type CpfBloqueado } from '@/lib/actions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Secao } from '@/components/ui/Superficie'

/**
 * Os CPFs barrados NESTE setor.
 *
 * Tirar da equipe resolve o vínculo de hoje; o bloqueio é o que impede a
 * pessoa de se cadastrar de novo pelo mesmo link cinco minutos depois, e o
 * que faz o QR dela ser recusado no portão.
 *
 * Fica recolhido até alguém abrir: numa tela que o supervisor usa o dia
 * inteiro pra conferir presença, uma lista de exceções aberta por padrão
 * competiria com o que ele veio ver — e na maior parte dos setores ela é
 * vazia.
 */
export default function CpfsBloqueados({
  eventoId, fornecedorId, bloqueados,
}: {
  eventoId: string
  fornecedorId: string
  bloqueados: CpfBloqueado[]
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(bloqueados.length > 0)
  const [cpf, setCpf] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  const bloquear = (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    iniciar(async () => {
      const r = await bloquearCpf(eventoId, fornecedorId, cpf, motivo)
      if (r.error) { setErro(r.error); return }
      setCpf('')
      setMotivo('')
      router.refresh()
    })
  }

  const liberar = (id: string) => {
    setErro(null)
    iniciar(async () => {
      const r = await desbloquearCpf(id, eventoId, fornecedorId)
      if (r.error) { setErro(r.error); return }
      router.refresh()
    })
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-xs font-semibold"
      >
        <ShieldBan className="w-3.5 h-3.5" />
        Bloquear um CPF neste setor
      </button>
    )
  }

  return (
    <Secao
      tom="aviso"
      icone={<ShieldBan className="w-3.5 h-3.5" />}
      titulo={`CPFs bloqueados neste setor${bloqueados.length ? ` (${bloqueados.length})` : ''}`}
      descricao="Não conseguem se cadastrar por link nem entrar pelo QR neste setor"
      corpoClassName="p-4 space-y-3"
      acoes={
        <button onClick={() => setAberto(false)} className="text-slate-400 hover:text-slate-600" aria-label="Recolher">
          <X className="w-4 h-4" />
        </button>
      }
    >
      <form onSubmit={bloquear} className="flex flex-col sm:flex-row gap-2">
        <input
          required value={cpf} onChange={e => { setCpf(formatCpf(e.target.value)); setErro(null) }}
          placeholder="CPF a bloquear" className="input sm:w-48" inputMode="numeric" autoComplete="off"
        />
        <input
          value={motivo} onChange={e => setMotivo(e.target.value)}
          placeholder="Motivo (opcional)" className="input flex-1" autoComplete="off"
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

      {!bloqueados.length ? (
        <p className="text-slate-500 text-xs">Nenhum CPF bloqueado neste setor.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {bloqueados.map(b => (
            <li key={b.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-slate-800 text-sm font-semibold tabular-nums">{formatCpf(b.cpf)}</p>
                <p className="text-slate-400 text-2xs truncate">
                  {b.motivo ? `${b.motivo} · ` : ''}
                  {b.bloqueadoPor ? `por ${b.bloqueadoPor} · ` : ''}
                  {formatarBR(b.criadoEm, 'curto')}
                </p>
              </div>
              <button
                onClick={() => liberar(b.id)}
                disabled={pendente}
                className="btn btn-secundario btn-sm shrink-0"
              >
                Liberar
              </button>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  )
}
