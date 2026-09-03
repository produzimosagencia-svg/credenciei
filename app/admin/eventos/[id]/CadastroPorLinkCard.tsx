'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Link2Off, AlertTriangle } from 'lucide-react'
import { alternarCadastroPorLink } from '@/lib/actions'

/**
 * O interruptor do cadastro por link.
 *
 * Os links dos setores circulam em grupo de WhatsApp e não têm como ser
 * "recolhidos". Quando a lista fecha, este botão faz todos os formulários do
 * evento (e o cartaz da portaria) recusarem cadastro novo, de uma vez — sem
 * trocar link nenhum e sem mexer em quem já está dentro. Reabrir é o mesmo
 * botão.
 */
export default function CadastroPorLinkCard({ eventoId, suspenso }: { eventoId: string; suspenso: boolean }) {
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  const alternar = () => {
    setErro(null)
    iniciar(async () => {
      try {
        await alternarCadastroPorLink(eventoId, !suspenso)
        setConfirmando(false)
        router.refresh()
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível. Tente de novo.')
      }
    })
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 mb-4 flex flex-col sm:flex-row sm:items-center gap-3 ${suspenso ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${suspenso ? 'bg-amber-500/15 text-amber-500' : 'bg-brand-50 text-brand-500'}`}>
          {suspenso ? <Link2Off className="w-4 h-4" /> : <Link2 className="w-4 h-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-slate-800 text-sm font-extrabold">
            Cadastro por link {suspenso ? 'suspenso' : 'aberto'}
          </p>
          <p className="text-slate-500 text-xs mt-0.5">
            {suspenso
              ? 'Os links dos setores e o cartaz da portaria estão recusando cadastro novo. Quem já está na equipe continua normal.'
              : 'Os links dos setores e o cartaz da portaria aceitam cadastro. Suspenda quando a lista fechar — os links continuam os mesmos.'}
          </p>
          {erro && <p className="text-red-500 text-xs mt-1.5">{erro}</p>}
        </div>
      </div>

      {!confirmando ? (
        <button
          type="button"
          onClick={() => (suspenso ? alternar() : setConfirmando(true))}
          disabled={pendente}
          className={`btn shrink-0 ${suspenso ? 'btn-primario' : 'btn-secundario'}`}
        >
          {suspenso ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
          {pendente ? 'Aguarde…' : suspenso ? 'Reabrir cadastro' : 'Suspender cadastro'}
        </button>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:flex items-center gap-1 text-amber-600 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> Ninguém mais consegue se cadastrar.</span>
          <button type="button" onClick={alternar} disabled={pendente} className="btn btn-perigo btn-sm">
            {pendente ? 'Suspendendo…' : 'Suspender'}
          </button>
          <button type="button" onClick={() => setConfirmando(false)} disabled={pendente} className="btn btn-secundario btn-sm">Cancelar</button>
        </div>
      )}
    </div>
  )
}
