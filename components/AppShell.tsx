'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { QrCode, LogOut, Menu, X, Home, Building2, CalendarDays, Users, ScanLine, UserSearch, Sparkles, IdCard } from 'lucide-react'
import {
  ROLE_LABELS, ehMaster, podeGerenciarEventos, podeGerenciarUsuarios, podeEscanear, type Role,
} from '@/lib/permissions'
import { TutorialUsuarioProvider } from '@/components/tutorial/TutorialProvider'
import { AssistenteIAProvider, useAssistente } from '@/components/ia/AssistenteIA'

type Perfil = { id: string; nome: string; email: string; role: Role }

// Criado uma única vez por sessão de browser
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

type NavItem = { href: string; label: string; icon: React.ElementType }

function navItemsPara(role: string): NavItem[] {
  const itens: NavItem[] = [{ href: '/admin', label: 'Início', icon: Home }]
  if (ehMaster(role)) {
    itens.push({ href: '/admin/organizacoes', label: 'Organizações', icon: Building2 })
    itens.push({ href: '/admin/base-funcionarios', label: 'Base de Funcionários', icon: IdCard })
  }
  if (podeGerenciarEventos(role)) itens.push({ href: '/admin/eventos', label: 'Eventos', icon: CalendarDays })
  if (podeGerenciarUsuarios(role)) itens.push({ href: '/admin/usuarios', label: 'Usuários', icon: Users })
  if (podeEscanear(role)) {
    itens.push({ href: '/scan', label: 'Escanear QR', icon: ScanLine })
    itens.push({ href: '/admin/localizar', label: 'Localizar funcionário', icon: UserSearch })
  }
  return itens
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  const letras = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2)
  return letras.toUpperCase()
}

/**
 * Avatar do cabeçalho: foto da organização quando ela tem uma cadastrada,
 * senão as iniciais do nome. O master não pertence a organização nenhuma,
 * então pra ele fica sempre nas iniciais.
 */
function Avatar({ fotoUrl, nome, tamanho, className = '' }: {
  fotoUrl: string | null
  nome: string
  tamanho: number
  className?: string
}) {
  const estilo = { width: tamanho, height: tamanho }
  if (fotoUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={fotoUrl} alt={nome} style={estilo} className={`rounded-full object-cover shrink-0 ${className}`} />
  }
  return (
    <div
      style={estilo}
      className={`rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-semibold shrink-0 ${className}`}
    >
      <span style={{ fontSize: Math.max(11, tamanho * 0.32) }}>{iniciais(nome)}</span>
    </div>
  )
}

/**
 * Itens do menu.
 *
 * Item ativo é fundo sutil + texto forte, sem barrinha colorida na lateral e
 * sem pintar o texto de azul: dentro de um menu escuro, contraste já basta
 * pra dizer "você está aqui". Ícone a 16px, hover discreto — menu não é
 * conteúdo, ele deve recuar.
 */
function NavLinks({ nav, pathname, onNavigate }: { nav: NavItem[]; pathname: string; onNavigate?: () => void }) {
  const ativo = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href))
  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
      {nav.map(item => {
        const isAtivo = ativo(item.href)
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isAtivo ? 'page' : undefined}
            className={`flex items-center gap-2.5 text-sm px-2.5 py-1.5 rounded-md font-medium transition-colors ${
              isAtivo ? 'bg-slate-100 text-slate-800' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            <item.icon className="w-4 h-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}

/** Abre o assistente. Fica no menu, junto das outras seções — não é um
 *  flutuante no canto: no menu ele é uma parte do sistema, não um adereço. */
function BotaoAssistente({ onNavigate }: { onNavigate?: () => void }) {
  const { abrir } = useAssistente()
  return (
    <div className="px-2 pb-1 shrink-0">
      <button
        onClick={() => { abrir(); onNavigate?.() }}
        className="w-full flex items-center gap-2.5 text-sm px-2.5 py-1.5 rounded-md font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Sparkles className="w-4 h-4 shrink-0" />
        Credenciei IA
      </button>
    </div>
  )
}

function BotaoSair({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="p-2 border-t border-slate-100 shrink-0">
      <button
        onClick={onLogout}
        className="w-full flex items-center gap-2.5 text-sm px-2.5 py-1.5 rounded-md font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition-colors"
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
export default function AppShell({ perfil, fotoOrgUrl = null, children }: {
  perfil: Perfil
  fotoOrgUrl?: string | null
  children: React.ReactNode
}) {
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
    <AssistenteIAProvider usuarioId={perfil.id}>
    <div className="tema-escuro min-h-screen flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen">
        <Link href="/admin" className="flex items-center gap-2 px-4 h-14 border-b border-slate-100 shrink-0">
          <div className="logo-marca w-6 h-6 rounded-md flex items-center justify-center">
            <QrCode className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-slate-800 text-sm">Credenciei</span>
        </Link>
        <NavLinks nav={nav} pathname={pathname} />
        <BotaoAssistente />
        <BotaoSair onLogout={handleLogout} />
      </aside>

      {/* Coluna principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200">
          <div className="px-4 md:px-6 h-14 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => setMenuAberto(true)}
                className="btn-press md:hidden w-9 h-9 flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 -ml-1.5 shrink-0"
                aria-label="Abrir menu"
              >
                <Menu className="w-5 h-5" />
              </button>
              <Link href="/admin" className="md:hidden flex items-center gap-2 shrink-0">
                <div className="logo-marca w-8 h-8 rounded-lg flex items-center justify-center">
                  <QrCode className="w-4 h-4 text-white" />
                </div>
                <span className="font-bold text-slate-800">Credenciei</span>
              </Link>
              <p className="hidden md:block text-slate-400 text-sm" suppressHydrationWarning>{dataHoje}</p>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <div className="text-right leading-tight hidden sm:block">
                <p className="text-slate-700 text-xs font-semibold">{perfil.nome}</p>
                <p className="text-slate-400 text-2xs">{ROLE_LABELS[perfil.role] ?? perfil.role}</p>
              </div>
              <Avatar fotoUrl={fotoOrgUrl} nome={perfil.nome} tamanho={28} />
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">
          {/* Publica quem está logado pro tutorial saber de quem é o histórico */}
          <TutorialUsuarioProvider id={perfil.id}>
            <div className="max-w-6xl mx-auto">{children}</div>
          </TutorialUsuarioProvider>
        </main>
      </div>

      {/* Gaveta (mobile) */}
      {menuAberto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="overlay-fade-in absolute inset-0 bg-black/45" onClick={() => setMenuAberto(false)} />
          <div className="tema-escuro absolute inset-y-0 left-0 w-72 max-w-[80vw] bg-white shadow-2xl flex flex-col drawer-slide-in">
            <div className="flex items-center justify-between px-5 h-16 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="logo-marca w-8 h-8 rounded-lg flex items-center justify-center">
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
              <Avatar fotoUrl={fotoOrgUrl} nome={perfil.nome} tamanho={40} />
              <div className="min-w-0">
                <p className="text-slate-800 text-sm font-semibold truncate">{perfil.nome}</p>
                <p className="text-slate-400 text-xs">{ROLE_LABELS[perfil.role] ?? perfil.role}</p>
              </div>
            </div>

            <NavLinks nav={nav} pathname={pathname} onNavigate={() => setMenuAberto(false)} />
            <BotaoAssistente onNavigate={() => setMenuAberto(false)} />
            <BotaoSair onLogout={handleLogout} />
          </div>
        </div>
      )}

    </div>
    </AssistenteIAProvider>
  )
}
