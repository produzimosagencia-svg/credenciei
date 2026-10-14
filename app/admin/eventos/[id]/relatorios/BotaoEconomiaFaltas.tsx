'use client'
import { useState } from 'react'
import { PiggyBank, ImagePlus, X } from 'lucide-react'
import { CHAVE_LOGO_ECONOMIA } from '@/components/relatorio-doc/CapaEconomia'

/** Reduz a logo pra no máximo 800 px (PNG, mantém transparência) — cabe no armazenamento do navegador e fica leve no PDF. */
async function logoReduzida(arquivo: File): Promise<string> {
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => { const i = new Image(); i.onload = () => ok(i); i.onerror = falha; i.src = url })
    const escala = Math.min(1, 800 / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.width * escala); canvas.height = Math.round(img.height * escala)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } finally { URL.revokeObjectURL(url) }
}

/**
 * "Economia com faltas" (Juan, 14/10/2026 — docs/economia-faltas-vital.pdf): antes de gerar, pede a logo do evento
 * (vai no canto da capa), a CADA geração. A logo fica só no navegador de quem gerou.
 */
export default function BotaoEconomiaFaltas({ eventoId }: { eventoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const gerar = async (comLogo: boolean) => {
    setErro(null)
    try {
      if (comLogo && arquivo) localStorage.setItem(CHAVE_LOGO_ECONOMIA, JSON.stringify({ eventoId, dataUrl: await logoReduzida(arquivo) }))
      else localStorage.removeItem(CHAVE_LOGO_ECONOMIA)
    } catch {
      if (comLogo) { setErro('Não consegui ler esta imagem. Tente um PNG ou JPG.'); return }
    }
    window.open(`/relatorios-pdf/${encodeURIComponent(eventoId)}/economia`, '_blank', 'noopener')
    setAberto(false); setArquivo(null)
  }

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="btn btn-secundario w-full justify-center py-3.5 text-base font-bold rounded-2xl">
        <PiggyBank className="w-5 h-5 shrink-0" /> PDF de economia com faltas
      </button>
      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setAberto(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-slate-800 font-bold text-lg">Logo do evento</h3>
                <p className="text-slate-500 text-sm mt-1">Vai no canto superior direito da capa. Use PNG com fundo transparente para ficar melhor no fundo escuro.</p>
              </div>
              <button type="button" onClick={() => setAberto(false)} className="text-slate-400 hover:text-slate-600" aria-label="Fechar"><X className="w-5 h-5" /></button>
            </div>
            <label className="flex items-center gap-3 rounded-xl border border-dashed border-slate-300 p-4 cursor-pointer hover:bg-slate-50">
              <ImagePlus className="w-6 h-6 text-brand-500 shrink-0" />
              <span className="text-sm text-slate-700 min-w-0 truncate">{arquivo ? arquivo.name : 'Escolher a imagem da logo'}</span>
              <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={e => setArquivo(e.target.files?.[0] ?? null)} />
            </label>
            {erro && <p className="text-red-600 text-xs">{erro}</p>}
            <button type="button" disabled={!arquivo} onClick={() => gerar(true)} className="w-full btn btn-primario disabled:opacity-60">Gerar PDF com esta logo</button>
            <button type="button" onClick={() => gerar(false)} className="w-full btn btn-secundario">Gerar sem a logo</button>
          </div>
        </div>
      )}
    </>
  )
}
