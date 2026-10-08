'use client'
import { useTema } from '@/components/Tema'

/**
 * O guia dentro da tela do sistema. A altura é a da janela menos o topo e o
 * cabeçalho da página, e a rolagem acontece DENTRO do guia (como no celular,
 * onde a página inteira rolando junto com o guia atrapalharia os passeios).
 * Trocar o tema recarrega o guia — ele é uma página à parte.
 */
export default function FrameGuia({ src = '/guia-supervisor', titulo = 'Tutorial do supervisor' }: { src?: string; titulo?: string }) {
  const [tema] = useTema()
  return (
    <iframe
      key={tema}
      src={`${src}?tema=${tema}`}
      title={titulo}
      className="w-full rounded-2xl border border-slate-200 bg-white h-[calc(100dvh-11rem)] min-h-[420px]"
    />
  )
}
