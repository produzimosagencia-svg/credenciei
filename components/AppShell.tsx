'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import {
  QrCode, LogOut, Menu, X, Home, Building2, Users, ScanLine, UserSearch, Sparkles,
  Activity, ClipboardCheck, MessageCircle, Megaphone,
} from 'lucide-react'
import {
  ROLE_LABELS, ehMaster, podeGerenciarUsuarios, podeEscanear, podeAcompanhar,
  podeGerenciarEventos, type Role,
} from '@/lib/permissions'
import { TutorialUsuarioProvider } from '@/components/tutorial/TutorialProvider'
import { AssistenteIAProvider, useAssistente } from '@/components/ia/AssistenteIA'

type Perfil = { id: string; nome: string; email: string; role: Role }

// Criado uma única vez por sessão de browser
const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

import MeusSetores, { type SetorDoSupervisor } from './MeusSetores'

type NavItem = { href: string; label: string; icon: React.ElementType }
type Grupo = { titulo?: string; itens: NavItem[] }

/**
 * O menu em grupos, como na referência: um bloco sem rótulo no topo com o
 * que se usa todo dia, e abaixo os blocos rotulados por assunto. Agrupar só
 * vale a pena quando os grupos têm nome — uma lista corrida de sete itens
 * obriga a ler todos pra achar um.
 */
function gruposPara(role: string): Grupo[] {
  const grupos: Grupo[] = []

  /*
   * Lista corrida, na ordem do trabalho de um dia de evento: abre o painel,
   * escaneia, regulariza quem perdeu a batida, confere as atividades. Recrutar
   * e gerenciar acesso vêm depois porque são de antes ou depois do evento.
   *
   * Sem rótulo de grupo aqui: os sete itens já contam essa sequência sozinhos,
   * e um cabeçalho no meio quebraria a leitura de cima pra baixo.
   *
   * "Eventos" não está na lista de propósito: a lista de eventos vive dentro
   * do Painel, e o item levaria pra mesma tela em que a pessoa já está.
   */
  const principal: NavItem[] = [{ href: '/admin', label: 'Painel', icon: Home }]
  // Escanear QR fica só com quem credencia. O supervisor cuida da equipe, não
  // do portão — mesma separação que as mensagens já dizem à equipe.
  if (podeEscanear(role)) {
    principal.push({ href: '/scan', label: 'Escanear QR', icon: ScanLine })
  }
  // Acompanhar a operação, sim: tirar o scanner do supervisor não pode cegá-lo
  // em relação à própria equipe.
  if (podeAcompanhar(role)) {
    principal.push({ href: '/admin/localizar', label: 'Registrar ponto', icon: ClipboardCheck })
    principal.push({ href: '/admin/atividades', label: 'Atividades do evento', icon: Activity })
  }
  /*
   * Avisos fica na lista principal, e não dentro do evento só: é daqui que
   * se manda um recado sem ter que lembrar em qual evento a pessoa está. A
   * tela pede o evento primeiro — e o admin só enxerga os da própria
   * organização, o master enxerga todos (a régua é a mesma do resto do
   * sistema, aplicada no servidor em /admin/avisos).
   */
  if (podeGerenciarEventos(role)) {
    principal.push({ href: '/admin/avisos', label: 'Avisos', icon: Megaphone })
  }
  if (podeGerenciarUsuarios(role)) {
    principal.push({ href: '/admin/usuarios', label: 'Acessos', icon: Users })
  }
  grupos.push({ itens: principal })

  // Plataforma continua rotulado: é o que só o dono da plataforma enxerga, e
  // separar deixa claro que não faz parte da operação de um evento.
  if (ehMaster(role)) {
    grupos.push({
      titulo: 'Plataforma',
      itens: [
        { href: '/admin/organizacoes', label: 'Organizações', icon: Building2 },
        /*
         * Era duas entradas — "Base de funcionários" e "Encontre colaborador"
         * — para a mesma consulta com um filtro a menos. Agora é uma tela só,
         * com um toggle interno (Prontas para recrutar / Toda a base) — ver o
         * comentário no topo de app/admin/encontrar/page.tsx.
         */
        { href: '/admin/encontrar', label: 'Encontre colaborador', icon: UserSearch },
        // O canal de WhatsApp é da plataforma, não de um evento: quem dispara
        // em massa e responde conversa é o dono, nunca o produtor de um cliente.
        { href: '/admin/whatsapp', label: 'WhatsApp', icon: MessageCircle },
      ],
    })
  }

  return grupos
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  const letras = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2)
  return letras.toUpperCase()
}

/**
 * Avatar: foto da organização quando ela tem uma cadastrada, senão as
 * iniciais do nome. O master não pertence a organização nenhuma, então pra
 * ele fica sempre nas iniciais.
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
    return <img src={fotoUrl} alt="" style={estilo} className={`rounded-full object-cover shrink-0 ${className}`} />
  }
  return (
    <div
      style={estilo}
      className={`rounded-full bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-semibold shrink-0 ${className}`}
    >
      <span style={{ fontSize: Math.max(10, tamanho * 0.36) }}>{iniciais(nome)}</span>
    </div>
  )
}

function NavLinks({ grupos, pathname, onNavigate, setores, setorAtualId }: {
  grupos: Grupo[]
  pathname: string
  onNavigate?: () => void
  /** Setores do supervisor. Vazio para os outros papéis. */
  setores: SetorDoSupervisor[]
  setorAtualId: string | null
}) {
  const ativo = (href: string) => (href === '/admin' ? pathname === '/admin' : pathname.startsWith(href))
  return (
    <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
      {grupos.map((grupo, i) => (
        <div key={grupo.titulo ?? i}>
          {grupo.titulo && <p className="menu-grupo-titulo px-2.5 mb-1.5">{grupo.titulo}</p>}
          <div className="space-y-px">
            {grupo.itens.map(item => {
              const isAtivo = ativo(item.href)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isAtivo ? 'page' : undefined}
                  className={`menu-item ${isAtivo ? 'menu-item-ativo' : ''}`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </Link>
              )
            })}
          </div>
          {/*
            * "Meus setores" entra logo depois do primeiro bloco, junto do que
            * se usa todos os dias — trocar de setor é navegação, não
            * configuração. Ele mesmo some quando há um setor só.
            */}
          {i === 0 && <MeusSetores setores={setores} atualId={setorAtualId} onNavigate={onNavigate} />}
        </div>
      ))}
    </nav>
  )
}

/** Abre o assistente. Fica no rodapé do menu, junto das outras seções — não é
 *  um flutuante no canto: no menu ele é parte do sistema, não um adereço. */
function BotaoAssistente({ onNavigate }: { onNavigate?: () => void }) {
  const { abrir } = useAssistente()
  return (
    <div className="px-3 pb-3 shrink-0">
      <button onClick={() => { abrir(); onNavigate?.() }} className="menu-item menu-item-ia w-full">
        <Sparkles className="w-4 h-4 shrink-0" />
        Suporte
      </button>
    </div>
  )
}

/**
 * Menu do usuário no canto superior direito, como na referência: o avatar
 * abre um painel com quem está logado e a saída. Tirar "Sair" do menu
 * lateral libera a barra pra navegação — sair não é um lugar do sistema.
 */
function MenuUsuario({ perfil, fotoOrgUrl, onLogout }: {
  perfil: Perfil
  fotoOrgUrl: string | null
  onLogout: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora e no Esc — um painel que só fecha no próprio botão
  // fica preso na tela quando a pessoa desiste e clica em qualquer lugar.
  useEffect(() => {
    if (!aberto) return
    const clique = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', clique)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', clique)
      document.removeEventListener('keydown', tecla)
    }
  }, [aberto])

  return (
    <div className="relative shrink-0" ref={caixa}>
      <button
        onClick={() => setAberto(v => !v)}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-label="Menu do usuário"
        className="flex items-center gap-2 rounded-full p-0.5 hover:bg-slate-100 transition-colors"
      >
        <Avatar fotoUrl={fotoOrgUrl} nome={perfil.nome} tamanho={36} />
      </button>

      {aberto && (
        <div
          role="menu"
          className="modal-pop-in absolute right-0 top-full mt-1.5 w-60 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
        >
          <div className="flex items-center gap-2.5 px-3 py-3 border-b border-slate-100">
            <Avatar fotoUrl={fotoOrgUrl} nome={perfil.nome} tamanho={40} />
            <div className="min-w-0">
              <p className="text-slate-800 text-sm font-medium truncate">{perfil.nome}</p>
              <p className="text-slate-500 text-xs truncate">{perfil.email}</p>
            </div>
          </div>
          <div className="px-3 py-2 border-b border-slate-100">
            <span className="indicador-selo selo-neutro">{ROLE_LABELS[perfil.role] ?? perfil.role}</span>
          </div>
          <button
            role="menuitem"
            onClick={onLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Moldura do painel.
 *
 * Segue o desenho da referência: barra superior com o contexto (marca ›
 * organização) valendo pra tela inteira, faixa de trilha logo abaixo, e só
 * então menu lateral e conteúdo lado a lado. O menu começando ABAIXO do topo
 * é o que faz o cabeçalho ser do sistema, e não do conteúdo.
 */
export default function AppShell({
  perfil, fotoOrgUrl = null, orgNome = null, setores = [], setorAtualId = null, children,
}: {
  perfil: Perfil
  fotoOrgUrl?: string | null
  orgNome?: string | null
  /** Setores que este supervisor pode acessar. Vazio para os outros papéis. */
  setores?: SetorDoSupervisor[]
  setorAtualId?: string | null
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [menuAberto, setMenuAberto] = useState(false)
  const grupos = gruposPara(perfil.role)

  // O master não pertence a organização nenhuma — pra ele o contexto é a
  // plataforma inteira, e dizer isso é mais honesto que repetir a marca.
  const contexto = orgNome ?? (ehMaster(perfil.role) ? 'Plataforma' : null)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <AssistenteIAProvider usuarioId={perfil.id}>
    <div className="min-h-screen flex flex-col">
      {/* Barra superior: marca › contexto, e o usuário à direita */}
      <header className="topo-app sticky top-0 z-30 h-14 shrink-0">
        <div className="h-full px-3 md:px-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1 min-w-0">
            <button
              onClick={() => setMenuAberto(true)}
              className="btn-press md:hidden w-9 h-9 -ml-1 flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 shrink-0"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <Link href="/admin" className="chip-contexto shrink-0">
              <span className="logo-marca w-8 h-8 rounded-lg flex items-center justify-center shrink-0">
                <QrCode className="w-[18px] h-[18px] text-white" />
              </span>
              <span className="font-semibold text-[0.9375rem]">Credenciei</span>
            </Link>
          </div>

          <MenuUsuario perfil={perfil} fotoOrgUrl={fotoOrgUrl} onLogout={handleLogout} />
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Menu lateral (desktop). Começa logo abaixo da barra superior e vai
            até o fim da tela: como é escuro, precisa ser uma COLUNA inteira —
            recortado entre duas faixas claras viraria um bloco solto no meio
            da página. Por isso a trilha mora do lado do conteúdo, não aqui. */}
        <aside className="menu-lateral hidden md:flex flex-col w-60 shrink-0 sticky top-14 h-[calc(100vh-3.5rem)]">
          <NavLinks grupos={grupos} pathname={pathname} setores={setores} setorAtualId={setorAtualId} />
          <BotaoAssistente />
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Sem trava de largura: com `max-w-6xl` sobrava meia tela vazia à
              direita em monitor grande, e o conteúdo ficava jogado num canto.
              O conteúdo ocupa a área que tem — quem precisa de coluna estreita
              (formulário) limita a própria largura. */}
          <main className="flex-1 min-w-0 p-4 md:p-6">
            {/* Publica quem está logado pro tutorial saber de quem é o histórico */}
            <TutorialUsuarioProvider id={perfil.id}>
              {children}
            </TutorialUsuarioProvider>
          </main>
        </div>
      </div>

      {/* Gaveta (mobile) */}
      {menuAberto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="overlay-fade-in absolute inset-0 bg-black/40" onClick={() => setMenuAberto(false)} />
          {/* Mesma coluna escura do desktop — a gaveta é o mesmo menu, não
              uma segunda navegação com outra aparência. */}
          <div className="menu-lateral absolute inset-y-0 left-0 w-72 max-w-[82vw] shadow-2xl flex flex-col drawer-slide-in">
            <div className="flex items-center justify-between px-4 h-14 border-b border-white/10 shrink-0">
              <span className="flex items-center gap-2">
                <span className="logo-marca w-8 h-8 rounded-lg flex items-center justify-center">
                  <QrCode className="w-[18px] h-[18px] text-white" />
                </span>
                <span className="font-semibold text-white text-[0.9375rem]">Credenciei</span>
              </span>
              <button
                onClick={() => setMenuAberto(false)}
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-white/50 hover:text-white hover:bg-white/10"
                aria-label="Fechar menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {contexto && (
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/10 shrink-0">
                <Avatar fotoUrl={fotoOrgUrl} nome={contexto} tamanho={38} />
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium truncate">{contexto}</p>
                  <p className="text-white/45 text-xs truncate">{ROLE_LABELS[perfil.role] ?? perfil.role}</p>
                </div>
              </div>
            )}

            <NavLinks grupos={grupos} pathname={pathname} setores={setores} setorAtualId={setorAtualId} onNavigate={() => setMenuAberto(false)} />
            <BotaoAssistente onNavigate={() => setMenuAberto(false)} />
            <div className="px-3 pb-3 shrink-0 border-t border-white/10 pt-3">
              <button onClick={handleLogout} className="menu-item w-full">
                <LogOut className="w-4 h-4 shrink-0" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </AssistenteIAProvider>
  )
}
