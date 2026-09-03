/**
 * Efeito de "scanner": uma linha laranja com brilho varre o conteúdo de cima
 * a baixo, e o conteúdo é cortado no ritmo dela — como um leitor passando
 * por um código de barras.
 *
 * Adaptado de um template que animava a palavra "Barcode". Aqui o filho é
 * livre (a landing passa o logo do Credenciei). As animações `animate-scan`
 * e `animate-cut` moram no globals.css (bloco `@theme`), e o percurso da
 * linha é em porcentagem, então funciona com qualquer altura de conteúdo.
 *
 * Sem 'use client': é CSS puro, serve Server e Client Component igual.
 */
export default function AnimatedScanLoader({ children, className = '' }: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`relative max-w-fit ${className}`} aria-hidden="true">
      <div className="animate-cut">{children}</div>
      {/* Duas linhas: a de trás é o brilho borrado, a da frente é o traço. */}
      <div className="absolute left-0 w-full h-[6px] rounded bg-[#FF4A0F]/60 blur-[10px] z-0 animate-scan" />
      <div className="absolute left-0 w-full h-[3px] rounded bg-[#FF8A4C] opacity-90 z-[1] shadow-[0_0_14px_#FF4A0F] animate-scan" />
    </div>
  )
}
