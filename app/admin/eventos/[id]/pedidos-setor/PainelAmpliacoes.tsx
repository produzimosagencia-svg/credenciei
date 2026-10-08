'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, X, UserPlus } from 'lucide-react'
import { aprovarAmpliacao, negarAmpliacao } from '@/lib/actions-pedidos-setor'
import type { Ampliacao } from '@/lib/pedidos-setor-consulta'
import { formatarBR } from '@/lib/tz'
import { Badge, Secao } from '@/components/ui/Superficie'

/**
 * Pedidos de MAIS colaboradores dos supervisores. O admin aprova com o número que decidir (pode ser menos que o
 * pedido — vira o combinado do setor) ou nega com motivo; o supervisor vê a resposta na tela dele e no WhatsApp.
 */
export default function PainelAmpliacoes({ eventoId, ampliacoes }: { eventoId: string; ampliacoes: Ampliacao[] }) {
  const pendentes = ampliacoes.filter(a => a.status === 'pendente')
  const decididas = ampliacoes.filter(a => a.status !== 'pendente').slice(0, 20)
  if (!ampliacoes.length) return null

  return (
    <Secao
      tom={pendentes.length ? 'aviso' : 'neutro'}
      icone={<UserPlus className="w-3.5 h-3.5" />}
      titulo={`Mais colaboradores${pendentes.length ? ` — ${pendentes.length} aguardando` : ''}`}
      descricao="Pedidos dos supervisores para aumentar a equipe do setor"
      corpoClassName="p-0"
    >
      <ul className="divide-y divide-slate-100">
        {pendentes.map(a => <Pendente key={a.id} a={a} eventoId={eventoId} />)}
        {decididas.map(a => (
          <li key={a.id} className="px-4 py-3 flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-slate-800 text-sm font-semibold">{a.setorNome}{a.subeventoNome && <span className="text-slate-500 font-normal"> · {a.subeventoNome}</span>}</p>
              <p className="text-slate-500 text-xs">
                {a.solicitante} pediu {a.quantidadeDesejada} (tinha {a.quantidadeAtual ?? '—'})
                {a.status === 'aprovado' ? <> — aprovado <strong>{a.quantidadeAprovada}</strong></> : <> — negado: {a.motivoNegacao}</>}
                {a.decididoEm && ` · ${formatarBR(a.decididoEm, 'curto')}`}
              </p>
            </div>
            <Badge tom={a.status === 'aprovado' ? 'positivo' : 'negativo'}>{a.status === 'aprovado' ? 'Aprovado' : 'Negado'}</Badge>
          </li>
        ))}
      </ul>
    </Secao>
  )
}

function Pendente({ a, eventoId }: { a: Ampliacao; eventoId: string }) {
  const router = useRouter()
  const [quantidade, setQuantidade] = useState(String(a.quantidadeDesejada))
  const [negando, setNegando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const decidir = async (fn: () => Promise<{ ok: true; mensagem: boolean } | { erro: string }>) => {
    setOcupado(true)
    setErro(null)
    const r = await fn()
    setOcupado(false)
    if ('erro' in r) { setErro(r.erro); return }
    router.refresh()
  }

  return (
    <li className="px-4 py-3 space-y-2 bg-amber-50/40">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-slate-800 text-sm font-semibold">
            <Link href={`/admin/eventos/${eventoId}/fornecedor/${a.fornecedorId}`} className="hover:underline">{a.setorNome}</Link>
            {a.subeventoNome && <span className="text-slate-500 font-normal"> · {a.subeventoNome}</span>}
          </p>
          <p className="text-slate-600 text-xs">
            {a.solicitante} · {formatarBR(a.criadoEm, 'curto')} · combinado {a.quantidadeAtual ?? '—'} · cadastrados {a.cadastrados ?? '—'} · <strong>pede {a.quantidadeDesejada}</strong>
          </p>
          <p className="text-slate-700 text-xs mt-1">“{a.motivo}”</p>
        </div>
        <Badge tom="atencao">Aguardando</Badge>
      </div>
      {!negando ? (
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-slate-600 flex items-center gap-1.5">
            Aprovar
            <input type="number" inputMode="numeric" min={1} value={quantidade} onChange={e => setQuantidade(e.target.value)} className="input w-20 tabular-nums py-1" />
            colaboradores
          </label>
          <button type="button" disabled={ocupado} onClick={() => decidir(() => aprovarAmpliacao(a.id, quantidade))} className="btn btn-primario btn-sm">
            <Check className="w-3.5 h-3.5" /> {ocupado ? 'Aguarde…' : 'Aprovar'}
          </button>
          <button type="button" disabled={ocupado} onClick={() => setNegando(true)} className="btn btn-secundario btn-sm text-red-600">
            <X className="w-3.5 h-3.5" /> Negar
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea rows={2} maxLength={300} autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} className="input" placeholder="Motivo (o supervisor recebe)" />
          <div className="flex gap-2">
            <button type="button" disabled={ocupado || motivo.trim().length < 3} onClick={() => decidir(() => negarAmpliacao(a.id, motivo))} className="btn btn-perigo btn-sm">
              {ocupado ? 'Negando…' : 'Confirmar'}
            </button>
            <button type="button" disabled={ocupado} onClick={() => setNegando(false)} className="btn btn-secundario btn-sm">Cancelar</button>
          </div>
        </div>
      )}
      {erro && <p className="text-red-600 text-xs">{erro}</p>}
    </li>
  )
}
