import { ExternalLink, FileText } from 'lucide-react'
import type { ClasseDeMidia } from '@/lib/respostas-compartilhadas'

/**
 * A foto, figurinha, áudio, vídeo ou documento de uma mensagem recebida.
 *
 * O arquivo vem da rota `/respostas/[código]/midia/[id]`, que confere o link e
 * busca na Meta. Nada é carregado antes de aparecer na tela: uma conversa
 * comprida não dispara dezenas de buscas na Meta de uma vez.
 */
export default function Midia({ token, id, classe, nome }: {
  token: string
  id: string
  classe: ClasseDeMidia
  nome: string | null
}) {
  const src = `/respostas/${token}/midia/${id}`

  if (classe === 'imagem' || classe === 'figurinha') {
    const figurinha = classe === 'figurinha'
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir em tamanho real"
        className={`block overflow-hidden transition hover:opacity-90 ${figurinha ? '' : 'rounded-xl bg-black/30'}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- o arquivo sai de uma rota autenticada pelo código do link, que o otimizador de imagem não alcança */}
        <img
          src={src}
          alt={figurinha ? 'Figurinha enviada pela pessoa' : 'Foto enviada pela pessoa'}
          loading="lazy"
          className={figurinha ? 'h-36 w-36 object-contain' : 'max-h-80 w-auto max-w-full'}
        />
      </a>
    )
  }

  if (classe === 'audio') {
    return (
      <div>
        <audio controls preload="none" src={src} className="h-10 w-64 max-w-full" />
        <a href={src} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-2xs text-white/55 underline-offset-2 hover:text-white hover:underline">
          <ExternalLink className="h-3 w-3" /> Se o áudio não tocar, abra por aqui
        </a>
      </div>
    )
  }

  if (classe === 'video') {
    return <video controls preload="none" src={src} className="max-h-80 max-w-full rounded-xl bg-black/30" />
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white transition hover:border-white/25 hover:bg-black/30"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ff4a0f]/20 text-[#ffb08f]">
        <FileText className="h-4 w-4" />
      </span>
      <span className="min-w-0 break-all">{nome || 'Abrir documento'}</span>
    </a>
  )
}
