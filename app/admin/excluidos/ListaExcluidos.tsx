'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'
import { restaurarExcluido } from '@/lib/actions-lixeira'
import type { Excluido } from '@/lib/lixeira'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Badge } from '@/components/ui/Superficie'

export default function ListaExcluidos({ excluidos }: { excluidos: Excluido[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [retorno, setRetorno] = useState<Record<string, { tipo: 'ok' | 'erro'; texto: string }>>({})

  const restaurar = async (e: Excluido) => {
    setOcupado(e.id)
    const r = await restaurarExcluido(e.id)
    setOcupado(null)
    setConfirmando(null)
    if ('erro' in r) { setRetorno(m => ({ ...m, [e.id]: { tipo: 'erro', texto: r.erro } })); return }
    setRetorno(m => ({ ...m, [e.id]: { tipo: 'ok', texto: r.avisos.length ? `Restaurada, com avisos: ${r.avisos.join('; ')}` : 'Restaurada — o QR antigo voltou a valer.' } }))
    router.refresh()
  }

  return (
    <ul className="divide-y divide-slate-100">
      {excluidos.map(e => (
        <li key={e.id} className="px-4 py-3 space-y-1.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-slate-800 text-sm font-semibold">{e.nome} <span className="text-slate-500 font-normal tabular-nums">· CPF {formatCpf(e.cpf)}</span></p>
              <p className="text-slate-500 text-xs">{e.fornecedorNome ?? 'Setor ?'} · {e.eventoNome ?? 'Evento ?'} · {e.batidas} batida{e.batidas === 1 ? '' : 's'} guardada{e.batidas === 1 ? '' : 's'}</p>
              <p className="text-slate-400 text-2xs">Excluído por {e.excluidoPor ?? '—'} em {formatarBR(e.excluidoEm, 'completo')}{e.motivo ? ` · Motivo: ${e.motivo}` : ''}</p>
            </div>
            {e.restauradoEm ? (
              <Badge tom="positivo">Restaurado {formatarBR(e.restauradoEm, 'curto')}{e.restauradoPor ? ` por ${e.restauradoPor}` : ''}</Badge>
            ) : confirmando === e.id ? (
              <span className="flex items-center gap-2">
                <button type="button" onClick={() => restaurar(e)} disabled={ocupado === e.id} className="btn btn-primario btn-sm">
                  {ocupado === e.id ? 'Restaurando…' : 'Confirmar'}
                </button>
                <button type="button" onClick={() => setConfirmando(null)} className="btn btn-secundario btn-sm">Cancelar</button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmando(e.id)} className="btn btn-secundario btn-sm">
                <RotateCcw className="w-3.5 h-3.5" /> Restaurar
              </button>
            )}
          </div>
          {retorno[e.id] && <p className={`text-xs ${retorno[e.id].tipo === 'erro' ? 'text-red-600' : 'text-green-700'}`}>{retorno[e.id].texto}</p>}
        </li>
      ))}
    </ul>
  )
}
