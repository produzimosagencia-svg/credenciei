'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, ImageIcon, X, Trash2, AlertTriangle } from 'lucide-react'
import { atualizarFotoVeiculo, urlFotoVeiculo } from '@/lib/actions'

/**
 * Ver, trocar ou remover a foto de um veículo já cadastrado.
 *
 * A foto é opcional no cadastro porque quem registra na chegada nem sempre
 * pode parar pra fotografar — então ela precisa ter um caminho DEPOIS, e é
 * este. As actions já existiam desde o pedido do Juan; faltava o botão.
 *
 * A URL é assinada e vale 30 minutos (`urlFotoVeiculo`), por isso é buscada
 * na hora de abrir e não vem pronta na lista: numa página aberta a manhã
 * inteira no portão, um link gerado no carregamento já teria vencido.
 */
export default function FotoVeiculo({
  veiculoId, eventoId, placa, temFoto,
}: {
  veiculoId: string
  eventoId: string
  placa: string
  temFoto: boolean
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [url, setUrl] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, startCarregar] = useTransition()
  const [salvando, startSalvar] = useTransition()

  const abrir = () => {
    setAberto(true)
    setErro(null)
    if (!temFoto) return
    startCarregar(async () => setUrl(await urlFotoVeiculo(veiculoId, eventoId)))
  }

  const enviar = (arquivo: File) => {
    setErro(null)
    const fd = new FormData()
    fd.set('foto', arquivo)
    startSalvar(async () => {
      const r = await atualizarFotoVeiculo(veiculoId, eventoId, fd)
      if (r.error) { setErro(r.error); return }
      setAberto(false)
      setUrl(null)
      router.refresh()
    })
  }

  const remover = () => {
    setErro(null)
    const fd = new FormData()
    fd.set('remover', '1')
    startSalvar(async () => {
      const r = await atualizarFotoVeiculo(veiculoId, eventoId, fd)
      if (r.error) { setErro(r.error); return }
      setAberto(false)
      setUrl(null)
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={abrir}
        className={`btn-press inline-flex items-center gap-1 text-2xs font-semibold rounded-lg px-2 py-1 ${
          temFoto
            ? 'text-brand-600 hover:bg-brand-50'
            : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
        }`}
        aria-label={temFoto ? `Ver foto do veículo ${placa}` : `Adicionar foto do veículo ${placa}`}
      >
        {temFoto ? <ImageIcon className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
        {temFoto ? 'Ver' : 'Adicionar'}
      </button>

      {aberto && (
        <div
          className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setAberto(false)}
        >
          <div
            className="modal-pop-in bg-white border border-slate-200 rounded-2xl p-5 w-full max-w-sm shadow-xl space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-slate-800 font-bold text-sm">Foto do veículo</h3>
                <p className="text-slate-400 text-xs font-mono">{placa}</p>
              </div>
              <button
                onClick={() => setAberto(false)}
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {temFoto ? (
              carregando ? (
                <div className="h-40 rounded-xl bg-slate-100 animate-pulse" />
              ) : url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={`Veículo ${placa}`} className="w-full rounded-xl border border-slate-200" />
              ) : (
                <p className="text-slate-500 text-sm">Não consegui carregar a foto. Tente de novo.</p>
              )
            ) : (
              <p className="text-slate-500 text-sm">Este veículo ainda não tem foto.</p>
            )}

            {erro && (
              <p className="flex items-start gap-1.5 text-red-600 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
              </p>
            )}

            <div className="flex items-center gap-2">
              <label
                htmlFor={`foto-${veiculoId}`}
                className="btn btn-secundario btn-sm flex-1 cursor-pointer justify-center"
              >
                <Camera className="w-3.5 h-3.5" />
                {salvando ? 'Enviando…' : temFoto ? 'Trocar foto' : 'Adicionar foto'}
              </label>
              {temFoto && (
                <button onClick={remover} disabled={salvando} className="btn btn-secundario btn-sm text-red-600">
                  <Trash2 className="w-3.5 h-3.5" /> Remover
                </button>
              )}
            </div>
            <input
              id={`foto-${veiculoId}`} type="file" accept="image/*" capture="environment"
              className="hidden" disabled={salvando}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) enviar(f)
                e.target.value = ''
              }}
            />
          </div>
        </div>
      )}
    </>
  )
}
