'use client'
import { useState, useTransition } from 'react'
import { Link2, Copy, Check, RefreshCw, Power } from 'lucide-react'
import { criarOuRegenerarLinkVeiculo, alternarLinkVeiculo } from '@/lib/actions'
import { ROTULO_TIPO_CADASTRO, type TipoCadastroVeiculo } from '@/lib/veiculos-constantes'

const TIPOS: TipoCadastroVeiculo[] = ['colaborador', 'lounge']

type LinkInfo = { tipo: string; token: string; ativo: boolean }

/**
 * "Enviar link para cadastro" — um link ESTÁVEL por tipo (colaborador/
 * lounge), igual o link do formulário de setor: gerar de novo não invalida
 * o anterior sem querer, é preciso clicar em "Gerar novo" pra isso.
 */
export default function LinkVeiculoPainel({ eventoId, links }: { eventoId: string; links: LinkInfo[] }) {
  const [pendente, startTransition] = useTransition()
  const [copiado, setCopiado] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [porTipo, setPorTipo] = useState(() => {
    const mapa: Record<string, LinkInfo> = {}
    for (const l of links) mapa[l.tipo] = l
    return mapa
  })

  const urlDe = (token: string) => `${window.location.origin}/veiculo-cadastro/${token}`

  const gerar = (tipo: TipoCadastroVeiculo, regenerar: boolean) => {
    setErro(null)
    startTransition(async () => {
      const r = await criarOuRegenerarLinkVeiculo(eventoId, tipo, regenerar)
      if (!r.ok) { setErro(r.error); return }
      setPorTipo(m => ({ ...m, [tipo]: { tipo, token: r.token, ativo: true } }))
    })
  }

  const alternar = (tipo: TipoCadastroVeiculo, ativo: boolean) => {
    setErro(null)
    startTransition(async () => {
      const r = await alternarLinkVeiculo(eventoId, tipo, ativo)
      if (!r.ok) { setErro(r.error); return }
      setPorTipo(m => ({ ...m, [tipo]: { ...m[tipo], ativo } }))
    })
  }

  const copiar = (tipo: string, token: string) => {
    navigator.clipboard.writeText(urlDe(token)).then(() => {
      setCopiado(tipo)
      setTimeout(() => setCopiado(null), 2000)
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-brand-600" />
        <p className="text-slate-800 font-semibold text-sm">Enviar link para cadastro</p>
      </div>
      <p className="text-slate-400 text-xs -mt-2">
        A pessoa se cadastra sozinha, sem precisar estar credenciada no evento. Fica pendente até você aprovar.
      </p>

      {erro && <p className="text-red-600 text-xs">{erro}</p>}

      <div className="space-y-3">
        {TIPOS.map(tipo => {
          const link = porTipo[tipo]
          return (
            <div key={tipo} className="flex flex-col sm:flex-row sm:items-center gap-2 border border-slate-100 rounded-xl p-3">
              <div className="flex-1 min-w-0">
                <p className="text-slate-700 text-sm font-medium">{ROTULO_TIPO_CADASTRO[tipo]}</p>
                {link ? (
                  <p className="text-slate-400 text-2xs truncate font-mono">{urlDe(link.token)}</p>
                ) : (
                  <p className="text-slate-400 text-2xs">Nenhum link gerado ainda</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {!link ? (
                  <button onClick={() => gerar(tipo, false)} disabled={pendente} className="btn btn-secundario btn-sm">
                    <Link2 className="w-3.5 h-3.5" /> Gerar link
                  </button>
                ) : (
                  <>
                    <button onClick={() => copiar(tipo, link.token)} className="btn btn-secundario btn-sm">
                      {copiado === tipo ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiado === tipo ? 'Copiado' : 'Copiar'}
                    </button>
                    <button onClick={() => gerar(tipo, true)} disabled={pendente} className="btn btn-secundario btn-sm" aria-label="Gerar novo link">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => alternar(tipo, !link.ativo)}
                      disabled={pendente}
                      className={`btn btn-sm ${link.ativo ? 'btn-secundario' : 'btn-primario'}`}
                    >
                      <Power className="w-3.5 h-3.5" /> {link.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
