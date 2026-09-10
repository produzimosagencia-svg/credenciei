import { redirect } from 'next/navigation'
import Link from 'next/link'
import { LayoutDashboard } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeRegistrarGastos } from '@/lib/permissions'
import BotaoSair from './BotaoSair'

/**
 * Shell próprio do módulo Gastos — enxuto de propósito.
 *
 * NÃO usa o AppShell do painel: o pedido é "não parecer um sistema
 * financeiro", e a sidebar de 20 itens do /admin é exatamente o oposto disso.
 * Aqui só tem o logo, o link pro painel completo e o "Sair". O resto da tela é
 * o botão de gravar.
 *
 * Auth: o `proxy.ts` já barra quem não tem sessão (redirect pro /login). Este
 * layout faz a checagem AUTORITATIVA — sessão de verdade via `getPerfil` e a
 * permissão do módulo. Mesmo padrão de `app/admin/layout.tsx`.
 */
export default async function GastosLayout({ children }: { children: React.ReactNode }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeRegistrarGastos(perfil)) redirect('/admin')

  return (
    <div className="min-h-screen bg-neutro-50 flex flex-col">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <Link href="/gastos" className="flex items-center gap-2 min-w-0">
            <img src="/marca/logo-preto.png" alt="Credenciei" className="so-claro h-[18px] w-auto" />
            <img src="/marca/logo-branco.png" alt="Credenciei" className="so-escuro h-[18px] w-auto" />
            <span className="text-slate-400 text-sm font-medium shrink-0">· Gastos</span>
          </Link>
          <div className="flex items-center gap-4 shrink-0">
            <Link href="/admin" className="hidden sm:flex items-center gap-1.5 text-slate-400 hover:text-slate-600 text-xs font-medium">
              <LayoutDashboard className="w-3.5 h-3.5" /> Painel
            </Link>
            <BotaoSair />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-6">{children}</main>
    </div>
  )
}
