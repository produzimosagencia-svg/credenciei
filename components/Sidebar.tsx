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
    <aside className="w-56 bg-[#161b22] border-r border-[#30363d] flex flex-col min-h-screen">
      <div className="p-5 border-b border-[#30363d]">
        <div className="flex items-center gap-2">
          <QrCode className="w-6 h-6 text-blue-400" />
          <span className="font-bold text-white text-sm">Credenciei</span>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {links.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-[#21262d]'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="p-3 border-t border-[#30363d] space-y-1">
        <Link
          href="/scan"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-green-400 hover:bg-[#21262d] transition-colors"
        >
          <ScanLine className="w-4 h-4" />
          Escanear QR
        </Link>
        <div className="pt-2 border-t border-[#30363d] mt-2">
          <div className="px-3 py-1.5 mb-1">
            <p className="text-white text-xs font-medium truncate">{perfil.nome}</p>
            <p className="text-slate-500 text-xs truncate">{isAdmin ? 'Administrador' : 'Cliente'}</p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-red-400 hover:bg-[#21262d] transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      </div>
    </aside>
  )
}
