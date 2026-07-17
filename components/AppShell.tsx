'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { QrCode, LogOut, Menu, X, Home, Building2, CalendarDays, Users, ScanLine } from 'lucide-react'
import {
  ROLE_LABELS, ehMaster, podeGerenciarEventos, podeGerenciarUsuarios, podeEscanear, type Role,
} from '@/lib/permissions'

type Perfil = { id: string; nome: string; email: string; role: Role }

// Criado uma única vez por sessão de browser
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type NavItem = { href: string; label: string; icon: React.ElementType }

function navItemsPara(role: string): NavItem[] {
  const itens: NavItem[] = [{ href: '/admin', label: 'Início', icon: Home }]
  if (ehMaster(role)) itens.push({ href: '/admin/organizacoes', label: 'Organizações', icon: Building2 })
  if (podeGerenciarEventos(role)) itens.push({ href: '/admin/eventos', label: 'Eventos', icon: CalendarDays })
  if (podeGerenciarUsuarios(role)) itens.push({ href: '/admin/usuarios', label: 'Usuários', icon: Users })
  if (podeEscanear(role)) itens.push({ href: '/scan', label: 'Escanear QR', icon: ScanLine })
  return itens
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  const letras = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2)
  return letras.toUpperCase()
}

function NavLinks({ nav, pathname, onNavigate }: { nav: NavItem[]; pathname: string; onNavigate?: () => void }) {
  const ativo = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href))
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
      {nav.map(item => {
        const isAtivo = ativo(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`relative flex items-center gap-3 text-sm px-3.5 py-2.5 rounded-xl font-medium transition-colors ${
              isAtivo ? 'bg-brand-50 text-brand-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
            }`}
          >
            {isAtivo && <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-brand-500" />}
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

function BotaoSair({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="p-3 border-t border-slate-100 shrink-0">
      <button
        onClick={onLogout}
        className="btn-press w-full flex items-center gap-3 text-sm px-3.5 py-2.5 rounded-xl font-medium text-slate-500 hover:text-red-600 hover:bg-red-50"
      >
        <LogOut className="w-4 h-4" />
        Sair
      </button>
    </div>
  )
}

/**
 * Shell do painel: menu lateral fixo (desktop) + barra superior + gaveta
 * (mobile). Layout no padrão SaaS de referência do cliente — sidebar branca
 * à esquerda, conteúdo sobre fundo claro levemente azulado.
 */
export default function AppShell({ perfil, children }: { perfil: Perfil; children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [menuAberto, setMenuAberto] = useState(false)
  const nav = navItemsPara(perfil.role)

  // suppressHydrationWarning no <p>: servidor (UTC) e navegador (BRT) podem
  // divergir na virada do dia — o texto do client prevalece sem warning.
  const bruto = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(new Date())
  const dataHoje = bruto.charAt(0).toUpperCase() + bruto.slice(1)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-[#f6f7fb] flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen">
        <Link href="/admin" className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-100 shrink-0">
          <div className="w-9 h-9 bg-brand-500 rounded-xl flex items-center justify-center shadow-md shadow-brand-500/25">
            <QrCode className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-800 tracking-tight">Credenciei</span>
        </Link>
        <NavLinks nav={nav} pathname={pathname} />
        <BotaoSair onLogout={handleLogout} />
      </aside>

      {/* Coluna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md border-b border-slate-200">
          <div className="px-4 md:px-8 h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setMenuAberto(true)}
                className="btn-press md:hidden w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 -ml-1.5 shrink-0"
                aria-label="Abrir menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <Link href="/admin" className="md:hidden flex items-center gap-2 shrink-0">
                <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
                  <QrCode className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-slate-800">Credenciei</span>
              </Link>
              <p className="hidden md:block text-slate-400 text-sm" suppressHydrationWarning>{dataHoje}</p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="text-right leading-tight hidden sm:block">
                <p className="text-slate-700 text-xs font-semibold">{perfil.nome}</p>
                <p className="text-slate-400 text-[11px]">{ROLE_LABELS[perfil.role] ?? perfil.role}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-[11px] font-bold shrink-0 ring-2 ring-white shadow-sm">
                {iniciais(perfil.nome)}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-8">{children}</main>
      </div>

      {/* Gaveta (mobile) */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="overlay-fade-in absolute inset-0 bg-black/45" onClick={() => setMenuAberto(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[80vw] bg-white shadow-2xl flex flex-col drawer-slide-in">
            <div className="flex items-center justify-between px-5 h-16 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
                  <QrCode className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-slate-800">Credenciei</span>
              </div>
              <button
                onClick={() => setMenuAberto(false)}
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"
                aria-label="Fechar menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="w-10 h-10 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-sm font-bold shrink-0">
                {iniciais(perfil.nome)}
              </div>
              <div className="min-w-0">
                <p className="text-slate-800 text-sm font-semibold truncate">{perfil.nome}</p>
                <p className="text-slate-400 text-xs">{ROLE_LABELS[perfil.role] ?? perfil.role}</p>
              </div>
            </div>

            <NavLinks nav={nav} pathname={pathname} onNavigate={() => setMenuAberto(false)} />
            <BotaoSair onLogout={handleLogout} />
          </div>
        </div>
      )}
    </div>
  )
}
