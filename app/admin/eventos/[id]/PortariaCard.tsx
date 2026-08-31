'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { QrCode, Printer, Copy, Check, RefreshCw, AlertTriangle, Users } from 'lucide-react'
import { alternarPortaria, trocarTokenDaPortaria } from '@/lib/actions'

/**
 * O cartaz da portaria.
 *
 * Um QR impresso e colado na entrada. Quem chega sem estar na lista aponta a
 * câmera, escolhe o setor e cai no formulário público que já existe — este
 * componente não cadastra ninguém, ele só administra a porta.
 *
 * ─── POR QUE O QR VIVE AQUI, E NÃO NUMA TELA PRÓPRIA ────────────────────────
 *
 * Porque ele só faz sentido ao lado dos setores: o cartaz manda para uma lista
 * dos setores DESTE evento, e um setor criado depois aparece sozinho. Numa tela
 * separada, seria fácil imprimir o cartaz antes de cadastrar os setores e não
 * entender por que a página abre vazia.
 */

export default function PortariaCard({
  eventoId,
  ativa,
  token,
  cadastrados,
}: {
  eventoId: string
  ativa: boolean
  token: string | null
  /** Quantos entraram por aqui. Zero é diferente de "ainda não ligou". */
  cadastrados: number
}) {
  const [copiado, setCopiado] = useState(false)
  const [confirmandoTroca, setConfirmandoTroca] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  const endereco = token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/portaria/${token}` : null

  const executar = (fn: () => Promise<unknown>) => {
    setErro(null)
    iniciar(async () => {
      try {
        await fn()
        router.refresh()
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível. Tente de novo.')
      }
    })
  }

  const copiar = async () => {
    if (!endereco) return
    try {
      await navigator.clipboard.writeText(endereco)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      setErro('Seu navegador bloqueou a cópia. O endereço está na tela.')
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
        <div className="min-w-0">
          <h3 className="text-slate-800 font-semibold text-base flex items-center gap-2">
            <QrCode className="w-4 h-4 text-brand-500 shrink-0" />
            Cadastro na portaria
          </h3>
          <p className="text-slate-500 text-xs mt-1">
            Um QR impresso na entrada. Quem chega sem estar na lista escaneia, escolhe o
            setor e se cadastra sozinho.
          </p>
        </div>

        <label className="flex items-center gap-2 shrink-0 cursor-pointer">
          <input
            type="checkbox"
            checked={ativa}
            disabled={pendente}
            onChange={e => executar(() => alternarPortaria(eventoId, e.target.checked))}
            className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400"
          />
          <span className={`text-xs font-semibold ${ativa ? 'text-sucesso-700' : 'text-slate-400'}`}>
            {ativa ? 'aberto' : 'fechado'}
          </span>
        </label>
      </div>

      {erro && (
        <p className="mx-4 mb-3 bg-red-50 border border-red-200 rounded-xl p-2.5 text-red-700 text-xs">
          {erro}
        </p>
      )}

      {!ativa ? (
        <div className="px-4 pb-4">
          <p className="text-slate-500 text-xs">
            {token
              // Já existiu: o cartaz impresso continua válido e volta a
              // funcionar ao religar. Dizer isso evita reimprimir à toa.
              ? 'Fechado. Os cartazes já impressos voltam a funcionar quando você abrir de novo.'
              : 'Ligue para gerar o QR Code e imprimir.'}
          </p>
        </div>
      ) : (
        <>
          <div className="px-4 pb-4 space-y-3">
            {/*
              * O QR é gerado no navegador, a partir do endereço.
              *
              * Fazer no servidor obrigaria uma rota nova só para devolver uma
              * imagem que só esta tela usa — e a imagem precisaria ser
              * regerada a cada troca de token.
              */}
            {endereco && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(endereco)}`}
                  alt="QR Code do cadastro na portaria"
                  width={90}
                  height={90}
                  className="rounded-lg bg-white shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-slate-500 text-2xs uppercase tracking-wide font-semibold">
                    Endereço do cartaz
                  </p>
                  <p className="text-slate-700 text-xs break-all mt-0.5 font-mono">{endereco}</p>
                </div>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <a
                href={`/admin/eventos/${eventoId}/portaria`}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primario btn-sm"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" /> Imprimir cartaz
              </a>
              <button onClick={copiar} className="btn btn-secundario btn-sm">
                {copiado
                  ? <Check className="w-3.5 h-3.5 shrink-0 text-sucesso-600" />
                  : <Copy className="w-3.5 h-3.5 shrink-0" />}
                {copiado ? 'Copiado' : 'Copiar endereço'}
              </button>
            </div>

            <p className="flex items-center gap-1.5 text-slate-600 text-xs tabular-nums pt-1">
              <Users className="w-3.5 h-3.5 shrink-0 text-slate-400" />
              <strong className="text-slate-800">{cadastrados}</strong>
              {cadastrados === 1 ? ' pessoa entrou' : ' pessoas entraram'} por aqui
            </p>
          </div>

          {/* Trocar o QR fica separado e discreto: é raro, e é destrutivo para
              todo cartaz já impresso. */}
          <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60">
            {!confirmandoTroca ? (
              <button
                onClick={() => setConfirmandoTroca(true)}
                className="text-slate-500 text-2xs hover:text-slate-800 inline-flex items-center gap-1.5"
              >
                <RefreshCw className="w-3 h-3" /> O QR vazou? Gerar um novo
              </button>
            ) : (
              <div className="space-y-2">
                <p className="flex items-start gap-1.5 text-amber-800 text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px text-amber-600" />
                  Todo cartaz já impresso para de funcionar. Quem já se cadastrou não é
                  afetado.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => executar(async () => {
                      await trocarTokenDaPortaria(eventoId)
                      setConfirmandoTroca(false)
                    })}
                    disabled={pendente}
                    className="btn btn-secundario btn-sm"
                  >
                    Gerar novo e reimprimir
                  </button>
                  <button onClick={() => setConfirmandoTroca(false)} className="btn btn-secundario btn-sm">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
