'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Link2, Link2Off, AlertTriangle, UserRoundCheck, Copy, Check, X, Building2, Circle } from 'lucide-react'
import { alternarCadastroPorLink, criarLinkCadastroIndividual } from '@/lib/actions'
import { copiarTexto } from '@/lib/navegador'

/**
 * O interruptor do cadastro por link.
 *
 * Os links dos setores circulam em grupo de WhatsApp e não têm como ser
 * "recolhidos". Quando a lista fecha, este botão faz todos os formulários do
 * evento (e o cartaz da portaria) recusarem cadastro novo, de uma vez — sem
 * trocar link nenhum e sem mexer em quem já está dentro. Reabrir é o mesmo
 * botão.
 */
export default function CadastroPorLinkCard({
  eventoId, suspenso, podeReabrirIndividual = false, setores = [],
}: {
  eventoId: string
  suspenso: boolean
  podeReabrirIndividual?: boolean
  setores?: { id: string; nome: string }[]
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const [abrindoIndividual, setAbrindoIndividual] = useState(false)
  const [setorId, setSetorId] = useState('')
  const [linkIndividual, setLinkIndividual] = useState<string | null>(null)
  const [erroIndividual, setErroIndividual] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [criandoIndividual, iniciarIndividual] = useTransition()
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

  const criarIndividual = () => {
    setErroIndividual(null)
    setLinkIndividual(null)
    setCopiado(false)
    if (!setorId) {
      setErroIndividual('Escolha um setor para gerar o link individual.')
      return
    }

    iniciarIndividual(async () => {
      try {
        const resultado = await criarLinkCadastroIndividual(eventoId, setorId)
        setLinkIndividual(resultado.link)
      } catch (e) {
        setErroIndividual(e instanceof Error ? e.message : 'Não foi possível criar o link individual.')
      }
    })
  }

  return (
    <div className={`rounded-2xl border px-4 py-3 mb-4 flex flex-col sm:flex-row sm:items-center sm:flex-wrap gap-3 ${suspenso ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200'}`}>
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
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {podeReabrirIndividual && (
            <button
              type="button"
              onClick={() => { setAbrindoIndividual(v => !v); setErroIndividual(null) }}
              className="btn btn-secundario"
            >
              <UserRoundCheck className="w-3.5 h-3.5" />
              Reabrir para uma pessoa
            </button>
          )}
          <button
            type="button"
            onClick={() => (suspenso ? alternar() : setConfirmando(true))}
            disabled={pendente}
            className={`btn shrink-0 ${suspenso ? 'btn-primario' : 'btn-secundario'}`}
          >
            {suspenso ? <Link2 className="w-3.5 h-3.5" /> : <Link2Off className="w-3.5 h-3.5" />}
            {pendente ? 'Aguarde…' : suspenso ? 'Reabrir cadastro' : 'Suspender cadastro'}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <span className="hidden sm:flex items-center gap-1 text-amber-600 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> Ninguém mais consegue se cadastrar.</span>
          <button type="button" onClick={alternar} disabled={pendente} className="btn btn-perigo btn-sm">
            {pendente ? 'Suspendendo…' : 'Suspender'}
          </button>
          <button type="button" onClick={() => setConfirmando(false)} disabled={pendente} className="btn btn-secundario btn-sm">Cancelar</button>
        </div>
      )}

      {podeReabrirIndividual && abrindoIndividual && (
        <div className="basis-full w-full border-t border-slate-200/80 pt-3 mt-1">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <p className="text-slate-800 text-sm font-extrabold">Reabrir um cadastro individual</p>
              <p className="text-slate-500 text-xs mt-0.5">
                Escolha o setor. O link geral continua fechado e o novo endereço aceita cadastros por 48 horas.
              </p>
            </div>
            <button type="button" onClick={() => setAbrindoIndividual(false)} className="text-slate-400 hover:text-slate-600" aria-label="Fechar">
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-slate-500 text-xs font-semibold mb-1.5">Setores criados</p>
          <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {!setores.length && <p className="px-3 py-4 text-center text-slate-400 text-xs">Nenhum setor disponível.</p>}
            {setores.map(setor => {
              const selecionado = setor.id === setorId
              return (
                <button
                  type="button"
                  key={setor.id}
                  onClick={() => { setSetorId(setor.id); setLinkIndividual(null); setErroIndividual(null) }}
                  className={`w-full px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors ${selecionado ? 'bg-brand-50 text-brand-700' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${selecionado ? 'bg-brand-100 text-brand-600' : 'bg-slate-100 text-slate-500'}`}>
                    <Building2 className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-sm font-semibold flex-1 truncate">{setor.nome}</span>
                  {selecionado
                    ? <Check className="w-4 h-4 text-brand-600 shrink-0" />
                    : <Circle className="w-4 h-4 text-slate-300 shrink-0" />}
                </button>
              )
            })}
          </div>

          <div className="flex justify-end mt-3">
            <button type="button" onClick={criarIndividual} disabled={criandoIndividual || !setorId} className="btn btn-primario disabled:opacity-50">
              <Link2 className="w-3.5 h-3.5" />
              {criandoIndividual ? 'Criando…' : 'Gerar link individual'}
            </button>
          </div>

          {erroIndividual && <p className="text-red-500 text-xs mt-2">{erroIndividual}</p>}
          {linkIndividual && (
            <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3">
              <p className="text-green-800 text-xs font-bold">Link liberado por 48 horas, sem limite de cadastros</p>
              <div className="flex items-center gap-2 mt-2">
                <input readOnly value={linkIndividual} className="input text-xs bg-white flex-1 min-w-0" />
                <button
                  type="button"
                  onClick={async () => {
                    if (await copiarTexto(linkIndividual)) {
                      setCopiado(true)
                      window.setTimeout(() => setCopiado(false), 1800)
                    }
                  }}
                  className="btn btn-secundario shrink-0"
                >
                  {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
