/**
 * A moldura das telas de entrada (login, criar senha): fundo escuro com a luz
 * laranja, o ícone 3D da marca e o cartão de vidro — a MESMA do `SignIn1`
 * (components/ui/modern-stunning-sign-in.tsx), pra quem chega por um link de
 * senha ver o mesmo sistema do login, e não uma tela diferente (pedido do
 * Juan, 06/10/2026: a página do link de recuperação tinha outra cara).
 *
 * Só layout, sem estado: serve a páginas de servidor. O login continua com o
 * desenho próprio dele; este espelha o visual.
 */
export default function CartaoDeEntrada({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen w-full relative overflow-hidden flex flex-col items-center justify-center px-4 py-10 md:flex-row md:items-center md:justify-center md:gap-16 lg:gap-28 md:px-12"
      style={{ background: 'radial-gradient(1000px 520px at 30% 40%, rgba(255,74,15,.22), transparent 60%), radial-gradient(700px 420px at 100% 100%, rgba(163,27,5,.16), transparent 60%), #0d0c0c' }}
    >
      <div className="relative z-10 -mb-12 md:mb-0 md:flex-none">
        <span className="absolute inset-0 rounded-full blur-2xl md:blur-3xl" style={{ background: 'radial-gradient(circle, rgba(255,74,15,.55), transparent 70%)' }} aria-hidden="true" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/iso-3d.png" alt="Credenciei" className="relative w-28 h-28 md:w-[min(40vw,520px)] md:h-[min(40vw,520px)] object-contain drop-shadow-[0_18px_30px_rgba(0,0,0,.6)] md:drop-shadow-[0_40px_80px_rgba(0,0,0,.7)]" />
      </div>

      <div className="relative z-0 w-full max-w-sm md:max-w-md md:flex-none rounded-[28px] bg-gradient-to-b from-white/[.08] to-white/[.02] border border-white/10 backdrop-blur-sm shadow-[0_40px_100px_rgba(0,0,0,.6),inset_0_1px_0_rgba(255,255,255,.08)] pt-16 md:pt-10 px-8 md:px-10 pb-8 md:pb-10 flex flex-col">
        {children}
      </div>

      <p className="relative z-10 mt-10 md:mt-0 md:absolute md:bottom-6 md:left-0 md:right-0 text-white/35 text-xs text-center">
        Credenciei © {new Date().getFullYear()} — Produzimos
      </p>
    </div>
  )
}
