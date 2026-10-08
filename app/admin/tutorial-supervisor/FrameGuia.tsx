/**
 * O guia dentro da tela do sistema. A altura é a da janela menos o topo e o
 * cabeçalho da página, e a rolagem acontece DENTRO do guia (como no celular,
 * onde a página inteira rolando junto com o guia atrapalharia os passeios).
 * Os guias são sempre em modo claro, então não acompanham o tema do sistema.
 */
export default function FrameGuia({ src = '/guia-supervisor', titulo = 'Tutorial do supervisor' }: { src?: string; titulo?: string }) {
  return (
    <iframe
      src={src}
      title={titulo}
      className="w-full rounded-2xl border border-slate-200 bg-white h-[calc(100dvh-11rem)] min-h-[420px]"
    />
  )
}
