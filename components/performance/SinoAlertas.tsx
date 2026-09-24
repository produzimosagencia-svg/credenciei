'use client'
import { useEffect, useState, useTransition } from 'react'
import { Bell, Check } from 'lucide-react'
import { contarAlertasNaoLidosAction, listarAlertasAction, marcarTodosAlertasLidos } from '@/lib/actions-performance'

/**
 * O sino de alertas do Painel de Performance — só quem tem `podeVerPerformance`
 * enxerga (ver AppShell.tsx). Poll de 60s pra contagem (o painel em si não é
 * tempo real, e alerta de infraestrutura não precisa de segundo a segundo).
 */
export default function SinoAlertas() {
  const [naoLidos, setNaoLidos] = useState(0)
  const [aberto, setAberto] = useState(false)
  const [alertas, setAlertas] = useState<Awaited<ReturnType<typeof listarAlertasAction>>>([])
  const [carregando, startCarregar] = useTransition()
  const [marcando, startMarcar] = useTransition()

  useEffect(() => {
    const buscar = () => { contarAlertasNaoLidosAction().then(setNaoLidos).catch(() => {}) }
    buscar()
    const id = setInterval(buscar, 60_000)
    return () => clearInterval(id)
  }, [])

  const abrir = () => {
    setAberto(a => !a)
    if (!aberto) startCarregar(() => listarAlertasAction(15).then(setAlertas))
  }

  const marcarTudo = () => {
    startMarcar(async () => {
      await marcarTodosAlertasLidos()
      setNaoLidos(0)
      setAlertas(a => a.map(x => ({ ...x, lidoEm: x.lidoEm ?? new Date().toISOString() })))
    })
  }

  return (
    <div className="relative">
      <button
        onClick={abrir}
        className="btn-press relative w-9 h-9 flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/10"
        aria-label={`${naoLidos} alertas`}
      >
        <Bell className="w-4.5 h-4.5" />
        {naoLidos > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {naoLidos > 9 ? '9+' : naoLidos}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white border border-slate-200 rounded-2xl shadow-xl z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 sticky top-0 bg-white">
              <p className="text-slate-800 font-semibold text-sm">Alertas</p>
              {naoLidos > 0 && (
                <button onClick={marcarTudo} disabled={marcando} className="text-2xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Marcar tudo como lido
                </button>
              )}
            </div>
            {carregando ? (
              <p className="text-slate-400 text-sm text-center py-8">Carregando…</p>
            ) : !alertas.length ? (
              <p className="text-slate-400 text-sm text-center py-8">Nenhum alerta ainda.</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {alertas.map(a => (
                  <div key={a.id} className={`px-4 py-3 ${a.lidoEm ? 'opacity-60' : ''}`}>
                    <p className="text-slate-800 text-sm font-medium">{a.titulo}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{a.mensagem}</p>
                    <p className="text-slate-300 text-2xs mt-1">{new Date(a.criadoEm).toLocaleString('pt-BR')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
