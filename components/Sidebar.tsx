'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { CalendarDays, LayoutDashboard, QrCode, ScanLine, Users, LogOut } from 'lucide-react'
import { createBrowserClient } from '@supabase/ssr'

type Perfil = {
  id: string
  nome: string
  email: string
  role: 'admin' | 'cliente'
}

const adminLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/clientes', label: 'Clientes', icon: Users, exact: false },
  { href: '/admin/eventos', label: 'Eventos', icon: CalendarDays, exact: false },
]

const clienteLinks = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/eventos', label: 'Eventos', icon: CalendarDays, exact: false },
]

export default function Sidebar({ perfil }: { perfil: Perfil }) {
  const pathname = usePathname()
  const router = useRouter()
  const isAdmin = perfil.role === 'admin'
  const links = isAdmin ? adminLinks : clienteLinks

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-60 bg-white border-r border-slate-200 flex flex-col min-h-screen shadow-sm">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-orange-500 rounded-xl flex items-center justify-center shadow-sm">
            <QrCode className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="font-bold text-slate-800 text-base leading-none">Credenciei</span>
            <p className="text-[10px] text-slate-400 mt-0.5">by Produzimos</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-3 mb-2">Menu</p>
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4 space-y-1 border-t border-slate-100 pt-3">
        <Link
          href="/scan"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 transition-all"
        >
          <ScanLine className="w-4 h-4" />
          Escanear QR
        </Link>

        <div className="px-3 py-2 mt-2">
          <p className="text-slate-700 text-xs font-semibold truncate">{perfil.nome}</p>
          <p className="text-slate-400 text-[11px] truncate">{isAdmin ? 'Administrador' : 'Cliente'}</p>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-red-600 hover:bg-red-50 transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sair
        </button>
      </div>
    </aside>
  )
}
