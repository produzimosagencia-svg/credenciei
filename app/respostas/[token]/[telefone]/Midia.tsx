'use client'

import { useState } from 'react'
import { ExternalLink, FileText } from 'lucide-react'
import estilos from '../chat.module.css'
import type { ClasseDeMidia } from '@/lib/respostas-compartilhadas'

/**
 * A foto, figurinha, áudio, vídeo ou documento de uma mensagem recebida.
 *
 * O arquivo vem da rota `/respostas/[código]/midia/[id]`, que confere o link e
 * busca na Meta. Nada é carregado antes de aparecer na tela: uma conversa
 * comprida não dispara dezenas de buscas na Meta de uma vez.
 *
 * A foto reserva o espaço e mostra um brilho enquanto vem: a busca passa pela
 * Meta e pode levar alguns segundos, e sem isso o balão ficava vazio e depois
 * empurrava a conversa quando a imagem chegava.
 */
export default function Midia({ token, id, classe, nome, aoCarregar }: {
  token: string
  id: string
  classe: ClasseDeMidia
  nome: string | null
  /** Avisa que a altura do balão mudou, para a conversa acompanhar. */
  aoCarregar?: () => void
}) {
  const [estado, setEstado] = useState<'carregando' | 'pronta' | 'falhou'>('carregando')
  const src = `/respostas/${token}/midia/${id}`

  if (classe === 'imagem' || classe === 'figurinha') {
    const figurinha = classe === 'figurinha'
    if (estado === 'falhou') {
      return (
        <p className="text-sm italic text-white/65">
          {figurinha ? 'Figurinha' : 'Foto'} que não pôde ser carregada.{' '}
          <a href={src} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-white">Tentar abrir</a>
        </p>
      )
    }
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        title="Abrir em tamanho real"
        className={`block overflow-hidden transition hover:opacity-90 ${figurinha ? '' : 'rounded-xl bg-black/30'} ${
          estado === 'carregando' ? `${figurinha ? 'h-36 w-36 rounded-xl' : 'h-56 w-72 max-w-full'} ${estilos.esqueleto}` : ''
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- o arquivo sai de uma rota autenticada pelo código do link, que o otimizador de imagem não alcança */}
        <img
          src={src}
          alt={figurinha ? 'Figurinha enviada pela pessoa' : 'Foto enviada pela pessoa'}
          loading="lazy"
          // Imagem que já estava no cache termina antes de a página ganhar vida,
          // e o `onLoad` não chega a disparar. Sem esta conferência ela ficaria
          // invisível para sempre.
          ref={img => { if (img?.complete && img.naturalWidth > 0 && estado === 'carregando') setEstado('pronta') }}
          onLoad={() => { setEstado('pronta'); aoCarregar?.() }}
          onError={() => setEstado('falhou')}
          className={`${figurinha ? 'h-36 w-36 object-contain' : 'max-h-80 w-auto max-w-full'} transition-opacity duration-300 ${estado === 'pronta' ? 'opacity-100' : 'opacity-0'}`}
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
