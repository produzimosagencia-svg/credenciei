'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import {
  LogOut, Menu, X, Home, Building2, Users, ScanLine, UserSearch, Sparkles,
  Activity, ClipboardCheck, MessageCircle, Megaphone, FileSpreadsheet, Pencil, Settings, UserCog,
  ClipboardPen, ShieldCheck, ClipboardList, Truck,
} from 'lucide-react'
import {
  ROLE_LABELS, ehMaster, podeGerenciarUsuarios, podeEscanear, podeAcompanhar,
  podeGerenciarEventos, podeGerenciarVeiculos, type Role,
} from '@/lib/permissions'
import { TutorialUsuarioProvider } from '@/components/tutorial/TutorialProvider'
import { AssistenteIAProvider, useAssistente } from '@/components/ia/AssistenteIA'
import { BotaoTema } from '@/components/Tema'

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
 * O menu em três blocos rotulados, na ordem definida pelo Juan em
 * 02/09/2026:
 *
 *   Evento         — o que se usa DURANTE um evento, na ordem do dia
 *   Administrativo — o que se prepara, se regulariza e se presta conta
 *   Operacional    — o que é da plataforma inteira, não de um evento (master)
 *
 * O cabeçalho da tela do evento ficou sem botões de ação: tudo que estava lá
 * — editar, pendências, relatórios, escanear — vive aqui agora, e cada tela
 * pergunta o evento quando precisa. Um caminho só por função, em vez de dois.
 */
function gruposPara(role: string): Grupo[] {
  const grupos: Grupo[] = []

  // ─── Evento ─────────────────────────────────────────────────────────────
  // Na ordem do trabalho de um dia de evento: abre o painel, escaneia,
  // ajusta o evento, regulariza quem perdeu a batida, confere as atividades.
  const doEvento: NavItem[] = [{ href: '/admin', label: 'Painel', icon: Home }]
  // O scanner fica só com quem credencia. O supervisor cuida da equipe, não
  // do portão — mesma separação que as mensagens já dizem à equipe.
  if (podeEscanear(role)) {
    doEvento.push({ href: '/scan', label: 'Scanner', icon: ScanLine })
  }
  /*
   * Editar evento e Editar colaborador pedem o evento antes — mesmo padrão de
   * Avisos e Relatórios. "Editar colaborador" não é funcionalidade nova: é o
   * mesmo modal que já existia dentro do setor, alcançável agora sem precisar
   * saber em qual dos 35 setores a pessoa está.
   */
  if (podeGerenciarEventos(role)) {
    doEvento.push({ href: '/admin/editar-evento', label: 'Editar evento', icon: Pencil })
  }
  // Editar colaborador também pro suporte, dentro do escopo dele — é a
  // ferramenta principal do papel (CPF, setor, ativação). Editar evento
  // (datas, janelas) fica de fora: isso reagenda a fila de WhatsApp do
  // evento inteiro, é decisão de quem administra, não de quem apoia.
  if (podeGerenciarEventos(role) || role === 'suporte') {
    doEvento.push({ href: '/admin/editar-colaborador', label: 'Editar colaborador', icon: UserCog })
  }
  /*
   * "Criar porteiro" é o acesso que o sistema chama de operador de portão —
   * o nome do menu usa a palavra de quem contrata, e a tela explica o que o
   * papel faz e o que NÃO faz. Mesma régua da action `criarOperadorPortaria`.
   */
  if (podeGerenciarUsuarios(role)) {
    doEvento.push({ href: '/admin/criar-porteiro', label: 'Gestor de credenciamento', icon: ShieldCheck })
  }
  /*
   * Veículos: master, admin e suporte — não é `podeGerenciarEventos`, que
   * inclui gerente e cliente. Autorizar um veículo é dizer quem entra
   * dirigindo no evento (decisão do Juan, 03/09/2026). Fica no grupo
   * Evento, junto do resto que se usa durante a operação.
   */
  if (podeGerenciarVeiculos(role)) {
    doEvento.push({ href: '/admin/veiculos', label: 'Cadastrar veículo', icon: Truck })
  }
  // Acompanhar a operação, sim: tirar o scanner do supervisor não pode cegá-lo
  // em relação à própria equipe.
  if (podeAcompanhar(role)) {
    doEvento.push({ href: '/admin/localizar', label: 'Registro de ponto', icon: ClipboardCheck })
    doEvento.push({ href: '/admin/atividades', label: 'Atividades do evento', icon: Activity })
  }
  grupos.push({ titulo: 'Evento', itens: doEvento })

  // ─── Administrativo ─────────────────────────────────────────────────────
  const administrativo: NavItem[] = []
  if (podeGerenciarEventos(role)) {
    administrativo.push({ href: '/admin/avisos', label: 'Avisos', icon: Megaphone })
  }
  /*
   * Lançamento manual mora aqui, e não ao lado do Registro de ponto, embora
   * os dois gravem uma batida: o Registro de ponto é operação de portaria
   * (a pessoa está na frente, a foto do rosto é a prova, a hora é agora);
   * este é regularização feita na mesa, depois, com hora escolhida e motivo
   * escrito. É trabalho administrativo, não de portão.
   *
   * Sem operador de portão pelo mesmo motivo — escrever o passado com hora
   * arbitrária é ato de gestão. Mesma régua da action `lancarPontoManual`.
   */
  if (podeGerenciarEventos(role) || role === 'supervisor' || role === 'suporte') {
    administrativo.push({ href: '/admin/lancar-ponto', label: 'Lançamento manual', icon: ClipboardPen })
  }
  /*
   * Relatórios aparece pro supervisor também: `lib/relatorios.ts` já permite
   * que ele exporte o próprio setor, e ele já tinha esse botão dentro da tela
   * da equipe dele.
   */
  if (podeGerenciarEventos(role) || role === 'supervisor') {
    administrativo.push({ href: '/admin/relatorios', label: 'Relatórios', icon: FileSpreadsheet })
  }
  if (podeGerenciarUsuarios(role)) {
    administrativo.push({ href: '/admin/usuarios', label: 'Acessos', icon: Users })
  }
  /*
   * Auditoria: master vê tudo, admin a própria organização, suporte só o
   * que ELE MESMO fez — ver `obterAuditoria` em lib/actions.ts, que já
   * aplica essa régua de novo no servidor (a régua daqui é só pra mostrar
   * ou não o item, não a proteção real).
   */
  if (podeGerenciarUsuarios(role) || role === 'suporte') {
    administrativo.push({ href: '/admin/auditoria', label: 'Auditoria', icon: ClipboardList })
  }
  if (administrativo.length) grupos.push({ titulo: 'Administrativo', itens: administrativo })

  // ─── Operacional ────────────────────────────────────────────────────────
  // O que só o dono da plataforma enxerga: não é o trabalho DE um evento, é
  // o de manter a operação que atende todos eles.
  if (ehMaster(role)) {
    grupos.push({
      titulo: 'Operacional',
      itens: [
        { href: '/admin/organizacoes', label: 'Organizações', icon: Building2 },
        /*
         * Só master cria/edita: o escopo do suporte atravessa organizações
         * ("Cliente A e Cliente B"), é a plataforma que contrata, não um
         * admin de cliente específico. Ver lib/actions.ts (`criarSuporte`).
         */
        { href: '/admin/suporte', label: 'Suporte de Sistema', icon: UserCog },
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
    /*
     * Configurações fica sozinha no fim, sem rótulo de grupo: ela não é um
     * assunto com vários itens, é uma tela só — e é a de maior alcance do
     * sistema (liga e desliga funcionalidade pros outros). Separá-la das
     * outras é o que evita clicar nela por engano.
     *
     * Só master por enquanto; o papel de "suporte" (ver `podeEditarIdentidade`
     * em lib/permissions.ts) vai entrar aqui quando existir.
     */
    grupos.push({ itens: [{ href: '/admin/configuracoes', label: 'Configurações', icon: Settings }] })
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
    return (
      <span style={estilo} className={`avatar-anel shrink-0 ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotoUrl} alt="" className="w-full h-full object-cover" />
      </span>
    )
  }
  // Iniciais dentro do anel em gradiente — o desenho do topo do Arena.
  return (
    <span style={estilo} className={`avatar-anel shrink-0 ${className}`}>
      <span className="flex items-center justify-center font-extrabold text-white">
        <span style={{ fontSize: Math.max(10, tamanho * 0.32) }}>{iniciais(nome)}</span>
      </span>
    </span>
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
    <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-[22px]">
      {grupos.map((grupo, i) => (
        <div key={grupo.titulo ?? i}>
          {grupo.titulo && <p className="menu-grupo-titulo px-3 mb-1.5">{grupo.titulo}</p>}
          <div className="space-y-0.5">
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
        className="flex items-center gap-2 rounded-full hover:brightness-110 transition-all"
      >
        <Avatar fotoUrl={fotoOrgUrl} nome={perfil.nome} tamanho={38} />
      </button>

      {aberto && (
        <div
          role="menu"
          className="modal-pop-in absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50"
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
          <BotaoTema className="border-b border-slate-100" />
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
      <header className="topo-app sticky top-0 z-30 h-16 shrink-0">
        <div className="h-full px-4 md:px-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMenuAberto(true)}
              className="btn-press md:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-800 shrink-0"
              aria-label="Abrir menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <Link href="/admin" className="shrink-0 flex items-center" aria-label="Painel">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca/logo-branco.png" alt="Credenciei" className="so-escuro h-[18px] md:h-[22px] w-auto" />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca/logo-preto.png" alt="Credenciei" className="so-claro h-[18px] md:h-[22px] w-auto" />
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {contexto && (
              <span className="pilula-contexto hidden sm:inline-flex">
                {contexto} · {ROLE_LABELS[perfil.role] ?? perfil.role}
              </span>
            )}
            <MenuUsuario perfil={perfil} fotoOrgUrl={fotoOrgUrl} onLogout={handleLogout} />
          </div>
        </div>
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Menu lateral (desktop). Começa logo abaixo da barra superior e vai
            até o fim da tela: como é escuro, precisa ser uma COLUNA inteira —
            recortado entre duas faixas claras viraria um bloco solto no meio
            da página. Por isso a trilha mora do lado do conteúdo, não aqui. */}
        <aside className="menu-lateral hidden md:flex flex-col w-[248px] shrink-0 sticky top-16 h-[calc(100vh-4rem)]">
          <NavLinks grupos={grupos} pathname={pathname} setores={setores} setorAtualId={setorAtualId} />
          <BotaoAssistente />
        </aside>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Sem trava de largura: com `max-w-6xl` sobrava meia tela vazia à
              direita em monitor grande, e o conteúdo ficava jogado num canto.
              O conteúdo ocupa a área que tem — quem precisa de coluna estreita
              (formulário) limita a própria largura. */}
          <main className="flex-1 min-w-0 p-4 md:px-8 md:pt-7 md:pb-10">
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
            <div className="flex items-center justify-between px-4 h-16 border-b border-white/10 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/marca/logo-branco.png" alt="Credenciei" className="h-[18px] w-auto" />
              <button
                onClick={() => setMenuAberto(false)}
                className="btn-press w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-white/60 hover:text-white"
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
            <div className="px-3 pb-3 shrink-0 border-t border-white/10 pt-3 space-y-0.5">
              <BotaoTema className="menu-item !py-2" />
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
