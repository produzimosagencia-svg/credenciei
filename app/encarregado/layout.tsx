import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPerfil } from '@/lib/supabase-server'
import { ehEncarregado } from '@/lib/encarregado'
import { TutorialUsuarioProvider } from '@/components/tutorial/TutorialProvider'
import BotaoSair from '@/app/gastos/BotaoSair'

/**
 * Shell próprio do Encarregado — enxuto de propósito, como o do Gastos.
 *
 * NÃO usa o AppShell do painel: o Encarregado só consulta, e um menu lateral
 * com as ferramentas do supervisor seria exatamente o que ele não tem. Aqui só
 * há o logo, o papel e o "Sair".
 *
 * Este layout é a PORTA: só entra quem tem o papel `encarregado`. Cada página
 * confere de novo o vínculo com o setor (ver `exigirVinculo`) — o layout diz
 * "você pode estar aqui", a página diz "você pode ver ESTE setor".
 */
export default async function EncarregadoLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!ehEncarregado(perfil.role)) redirect('/admin')

  return (
    <div className="min-h-screen bg-neutro-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/encarregado" className="flex items-center gap-2 min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/logo-preto.png" alt="Credenciei" className="so-claro h-[18px] w-auto" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/logo-branco.png" alt="Credenciei" className="so-escuro h-[18px] w-auto" />
            <span className="text-slate-400 text-sm font-medium shrink-0">· Encarregado</span>
          </Link>
          <div className="flex items-center gap-4 shrink-0">
            <span className="hidden sm:block text-slate-500 text-xs font-medium truncate max-w-[160px]">{perfil.nome}</span>
            <BotaoSair />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">
        <TutorialUsuarioProvider id={perfil.id}>{children}</TutorialUsuarioProvider>
      </main>
    </div>
  )
}
