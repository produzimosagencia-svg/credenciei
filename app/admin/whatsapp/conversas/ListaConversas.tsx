'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, CheckCheck, Search } from 'lucide-react'
import { marcarConversaComoLida } from '@/lib/actions-whatsapp'
import type { Conversa } from '@/lib/whatsapp-painel'
import { formatarBR } from '@/lib/tz'

function formatarTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, '')
  const local = d.startsWith('55') ? d.slice(2) : d
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`
  return bruto
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  return (partes.length > 1 ? `${partes[0][0]}${partes.at(-1)?.[0]}` : partes[0]?.slice(0, 2) || '?').toUpperCase()
}

function StatusEnvio({ status }: { status: Conversa['ultimoStatus'] }) {
  if (!status) return null
  const config = status === 'failed'
    ? { texto: 'Falhou', Icone: AlertCircle, cor: 'text-red-500' }
    : status === 'read'
      ? { texto: 'Visualizada', Icone: CheckCheck, cor: 'text-blue-500' }
      : status === 'delivered'
        ? { texto: 'Entregue', Icone: CheckCheck, cor: 'text-slate-400' }
        : { texto: 'Enviada', Icone: Check, cor: 'text-slate-400' }
  return (
    <span aria-label={config.texto} title={config.texto} className="mr-1 inline-flex align-text-bottom">
      <config.Icone className={`w-3.5 h-3.5 ${config.cor}`} />
    </span>
  )
}

export default function ListaConversas({ lista, selecionado }: { lista: Conversa[]; selecionado?: string }) {
  const [busca, setBusca] = useState('')
  const [, iniciarTransicao] = useTransition()
  const router = useRouter()
  const filtrada = useMemo(() => {
    const termo = busca.trim().toLocaleLowerCase('pt-BR')
    if (!termo) return lista
    return lista.filter(c => `${c.nome ?? ''} ${c.telefone} ${c.ultimoTexto ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo))
  }, [busca, lista])

  function abrir(telefone: string) {
    iniciarTransicao(async () => {
      try { await marcarConversaComoLida(telefone) } finally {
        router.push(`/admin/whatsapp/conversas/${telefone}`)
      }
    })
  }

  return (
    <aside className="min-h-[650px] border-r border-slate-200 bg-white">
      <div className="p-3 border-b border-slate-200">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Pesquisar conversa"
            aria-label="Pesquisar conversa"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>

      <div className="max-h-[590px] overflow-y-auto">
        {!filtrada.length ? (
          <p className="px-5 py-10 text-center text-sm text-slate-400">
            {lista.length ? 'Nenhuma conversa encontrada.' : 'Nenhuma conversa ainda.'}
          </p>
        ) : filtrada.map(c => {
          const nome = c.nome || formatarTelefone(c.telefone)
          const ativa = selecionado === c.telefone
          return (
            <button
              key={c.telefone}
              type="button"
              onClick={() => abrir(c.telefone)}
              className={`w-full flex items-center gap-3 px-3.5 py-3 text-left border-b border-slate-100 transition-colors ${
                ativa ? 'bg-brand-50' : 'hover:bg-slate-50'
              }`}
            >
              <span className="flex w-10 h-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                {iniciais(nome)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-sm ${c.naoLidas ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{nome}</span>
                  <span className={`shrink-0 text-2xs tabular-nums ${c.naoLidas ? 'font-semibold text-green-600' : 'text-slate-400'}`}>
                    {formatarBR(c.ultimaEm, 'curto')}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                    {c.ultimaDirecao === 'enviada' && <StatusEnvio status={c.ultimoStatus} />}
                    {c.ultimoTexto?.replace(/\s+/g, ' ') || '(mensagem sem texto)'}
                  </span>
                  {c.naoLidas > 0 && (
                    <span className="flex min-w-5 h-5 shrink-0 items-center justify-center rounded-full bg-green-500 px-1.5 text-2xs font-bold text-white">
                      {c.naoLidas > 99 ? '99+' : c.naoLidas}
                    </span>
                  )}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
