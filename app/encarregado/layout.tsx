import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getPerfil } from '@/lib/supabase-server'
import { ehEncarregado } from '@/lib/encarregado'
import { TutorialUsuarioProvider } from '@/components/tutorial/TutorialProvider'
import BotaoSair from '@/app/gastos/BotaoSair'
import BotaoTemaTopo from './BotaoTemaTopo'
import BotaoSuporteWpp from '@/components/BotaoSuporteWpp'
import MenuTrocarPerfil from '@/components/TrocarPerfil'

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
    <div className="min-h-screen flex flex-col">
      {/* `topo-app` é a barra do sistema e muda com o tema: a cor escrita à mão que havia aqui
          ficava clara no tema escuro, com logo e texto sumindo. */}
      <header className="topo-app sticky top-0 z-30 h-14 shrink-0">
        <div className="max-w-3xl mx-auto h-full px-3 sm:px-4 flex items-center justify-between gap-2">
          <Link href="/encarregado" className="flex items-center gap-2 shrink-0" aria-label="Início">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/logo-branco.png" alt="Credenciei" className="so-escuro h-[18px] w-auto" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/marca/logo-preto.png" alt="Credenciei" className="so-claro h-[18px] w-auto" />
            {/* No celular a barra só comporta o logo e os ícones: a etiqueta da função aparece de `sm` pra cima. */}
            {/* Num invólucro à parte: `.pilula-contexto` define `display` fora das camadas do Tailwind e venceria o `hidden`. */}
            <span className="hidden sm:inline-flex shrink-0"><span className="pilula-contexto">Encarregado</span></span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
            <span className="hidden sm:block text-slate-500 text-xs font-medium truncate max-w-[160px]">{perfil.nome}</span>
            <BotaoSuporteWpp nome={perfil.nome} funcao="Encarregado" />
            <MenuTrocarPerfil funcoes={(perfil.funcoes ?? []) as { role: string; base?: boolean }[]} ativa={perfil.role as string} />
            <BotaoTemaTopo />
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
