'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, LockOpen, AlertTriangle } from 'lucide-react'
import { alternarCadastroDoSubevento, alternarCadastroPorLink } from '@/lib/actions'

/**
 * As travas de cadastro de novas pessoas, dentro do subgrupo (pedido do Juan, 09/10/2026): este subgrupo inteiro
 * ou o evento inteiro, ligadas e desligadas a qualquer hora. A de um fornecedor só é o "Desligar link" do card
 * dele, logo abaixo. Qualquer trava fechada basta pra recusar; quem já está na equipe não é afetado.
 */
export default function TravaDeCadastro({
  eventoId, subeventoId, subgrupoNome, subgrupoTravado, eventoTravado, fornecedoresTravados, totalFornecedores,
}: {
  eventoId: string
  subeventoId: string
  subgrupoNome: string
  subgrupoTravado: boolean
  eventoTravado: boolean
  fornecedoresTravados: number
  totalFornecedores: number
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white divide-y divide-slate-100">
      <div className="px-4 pt-3 pb-2">
        <p className="text-slate-800 text-sm font-extrabold">Cadastro de novas pessoas</p>
        <p className="text-slate-500 text-xs mt-0.5">Travado, o link de cadastro recusa gente nova. Quem já está na equipe continua normal.</p>
      </div>
      <Linha
        titulo={`Subgrupo ${subgrupoNome}`}
        detalhe={`Os ${totalFornecedores} fornecedores deste subgrupo.`}
        travado={subgrupoTravado}
        alternar={() => alternarCadastroDoSubevento(eventoId, subeventoId, !subgrupoTravado)}
      />
      <Linha
        titulo="Evento inteiro"
        detalhe="Todos os subgrupos e o cartaz da portaria."
        travado={eventoTravado}
        alternar={() => alternarCadastroPorLink(eventoId, !eventoTravado)}
      />
      <p className="px-4 py-2.5 text-slate-500 text-xs">
        Um fornecedor só: botão <strong className="text-slate-700">Desligar link</strong> no card dele, abaixo.
        {fornecedoresTravados > 0 && <> {fornecedoresTravados} de {totalFornecedores} já estão com o link desligado.</>}
      </p>
    </div>
  )
}

function Linha({ titulo, detalhe, travado, alternar }: {
  titulo: string
  detalhe: string
  travado: boolean
  alternar: () => Promise<unknown>
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  const executar = () => {
    setErro(null)
    iniciar(async () => {
      try {
        const r = await alternar()
        if (r && typeof r === 'object' && 'erro' in r) { setErro(String((r as { erro: unknown }).erro)); return }
        setConfirmando(false)
        router.refresh()
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível. Tente de novo.')
      }
    })
  }

  return (
    <div className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5 ${travado ? 'bg-amber-50' : ''}`}>
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${travado ? 'bg-amber-500/15 text-amber-600' : 'bg-green-500/10 text-green-600'}`}>
          {travado ? <Lock className="w-4 h-4" /> : <LockOpen className="w-4 h-4" />}
        </span>
        <div className="min-w-0">
          <p className="text-slate-800 text-sm font-bold">
            {titulo} · <span className={travado ? 'text-amber-700' : 'text-green-700'}>{travado ? 'Travado' : 'Aberto'}</span>
          </p>
          <p className="text-slate-500 text-xs">{detalhe}</p>
          {erro && <p className="text-red-500 text-xs mt-1">{erro}</p>}
        </div>
      </div>
      {!confirmando ? (
        <button
          type="button"
          onClick={() => (travado ? executar() : setConfirmando(true))}
          disabled={pendente}
          className={`btn btn-sm shrink-0 ${travado ? 'btn-primario' : 'btn-secundario'}`}
        >
          {travado ? <LockOpen className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          {pendente ? 'Aguarde…' : travado ? 'Destravar' : 'Travar cadastro'}
        </button>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <span className="flex items-center gap-1 text-amber-600 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> Ninguém novo entra.</span>
          <button type="button" onClick={executar} disabled={pendente} className="btn btn-perigo btn-sm">
            {pendente ? 'Travando…' : 'Travar'}
          </button>
          <button type="button" onClick={() => setConfirmando(false)} disabled={pendente} className="btn btn-secundario btn-sm">Cancelar</button>
        </div>
      )}
    </div>
  )
}
