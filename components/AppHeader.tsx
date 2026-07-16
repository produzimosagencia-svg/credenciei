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

export default function AppHeader({ perfil }: { perfil: Perfil }) {
  const router = useRouter()
  const pathname = usePathname()
  const [menuAberto, setMenuAberto] = useState(false)
  const nav = navItemsPara(perfil.role)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const ativo = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href))

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 md:gap-6 min-w-0">
            <button
              onClick={() => setMenuAberto(true)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 transition-colors -ml-1.5 shrink-0"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <Link href="/admin" className="flex items-center gap-2.5 shrink-0">
              <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center shadow-sm shadow-brand-500/30">
                <QrCode className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-slate-800 tracking-tight hidden sm:inline">Credenciei</span>
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {nav.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl font-medium transition-colors ${
                    ativo(item.href) ? 'bg-brand-50 text-brand-600' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden sm:flex items-center gap-2.5">
              <div className="text-right leading-tight">
                <p className="text-slate-700 text-xs font-semibold">{perfil.nome}</p>
                <p className="text-slate-400 text-[11px]">{ROLE_LABELS[perfil.role] ?? perfil.role}</p>
              </div>
              <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-600 flex items-center justify-center text-[11px] font-bold shrink-0">
                {iniciais(perfil.nome)}
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-colors font-medium"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>
      </header>

      {/* Menu lateral (mobile) — navegação persistente que hoje só existia via cards do dashboard */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMenuAberto(false)} />
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
                className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 transition-colors"
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

            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {nav.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuAberto(false)}
                  className={`flex items-center gap-3 text-sm px-3.5 py-3 rounded-xl font-medium transition-colors ${
                    ativo(item.href) ? 'bg-brand-50 text-brand-600' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="p-3 border-t border-slate-100 shrink-0">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 text-sm px-3.5 py-3 rounded-xl font-medium text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
