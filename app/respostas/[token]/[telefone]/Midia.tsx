import { FileText } from 'lucide-react'
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
      <a href={src} target="_blank" rel="noopener noreferrer" className="block">
        {/* eslint-disable-next-line @next/next/no-img-element -- o arquivo sai de uma rota autenticada pelo código do link, que o otimizador de imagem não alcança */}
        <img
          src={src}
          alt={figurinha ? 'Figurinha enviada pela pessoa' : 'Foto enviada pela pessoa'}
          loading="lazy"
          className={figurinha ? 'h-32 w-32 object-contain' : 'max-h-80 w-auto max-w-full rounded-lg'}
        />
      </a>
    )
  }

  if (classe === 'audio') {
    return (
      <div>
        <audio controls preload="none" src={src} className="w-64 max-w-full" />
        <a href={src} target="_blank" rel="noopener noreferrer" className="mt-1 block text-2xs text-slate-500 underline underline-offset-2">
          Se o áudio não tocar, abra por aqui
        </a>
      </div>
    )
  }

  if (classe === 'video') {
    return <video controls preload="none" src={src} className="max-h-80 max-w-full rounded-lg" />
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
    >
      <FileText className="w-4 h-4 shrink-0" />
      <span className="min-w-0 break-all">{nome || 'Abrir documento'}</span>
    </a>
  )
}
