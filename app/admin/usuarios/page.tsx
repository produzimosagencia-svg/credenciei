import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Users, CalendarDays, Search, Mail, Building2, X } from 'lucide-react'
import { format } from 'date-fns'
import { podeGerenciarUsuarios, ehMaster, ROLE_LABELS, type Role } from '@/lib/permissions'
import UsuarioActions from './UsuarioActions'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'

export const revalidate = 0

const TUTORIAL: TutorialConfig = {
  tela: 'usuarios-lista',
  versao: 1,
  passos: [
    { alvo: 'usr-resumo', titulo: 'Quem tem acesso ao sistema', posicao: 'bottom', icone: 'Users',
      descricao: 'Esta lista mostra todas as pessoas da sua organização que conseguem entrar no sistema. Não confunda com a equipe do evento: quem só trabalha no dia aparece dentro do setor, não aqui.' },
    { alvo: 'usr-novo', titulo: 'Criar um acesso', posicao: 'left', icone: 'Plus',
      descricao: 'Use para dar acesso a um supervisor. Ele recebe e-mail e senha por WhatsApp e passa a enxergar apenas o setor que você escolher.' },
    { alvo: 'usr-abas', titulo: 'Filtrar por situação', posicao: 'bottom', icone: 'Users',
      descricao: 'Ativo entra normalmente. Inativo é bloqueado no login sem perder o histórico — use quando alguém sai da equipe mas você quer manter os registros antigos.' },
    { alvo: 'usr-papel', titulo: 'Papel', posicao: 'bottom', icone: 'ShieldCheck',
      descricao: 'O papel define o que a pessoa enxerga. Administrador gerencia toda a organização — eventos, setores e equipe. Supervisor enxerga só o próprio setor: a equipe dele, o scanner e as presenças daquele setor.' },
    { alvo: 'usr-acoes', titulo: 'Ações', posicao: 'left', icone: 'Plus',
      descricao: 'Aqui você edita os dados, bloqueia o acesso ou exclui de vez. Você nunca vê essas ações na sua própria linha — ninguém remove o próprio acesso por engano.' },
  ],
}

const PAGE_SIZE = 20

/**
 * Selo de papel. Só DOIS tons: o papel de maior poder recebe cor, o resto é
 * neutro. Antes eram cinco cores diferentes — com cinco pessoas na tela,
 * cinco cores, e nenhuma delas dizendo nada.
 */
const ROLE_BADGE: Record<Role, string> = {
  master: 'bg-brand-50 text-brand-700 border-brand-200',
  admin: 'bg-brand-50 text-brand-700 border-brand-200',
  gerente: 'bg-slate-100 text-slate-600 border-slate-200',
  supervisor: 'bg-slate-100 text-slate-600 border-slate-200',
  cliente: 'bg-slate-100 text-slate-600 border-slate-200',
}

type Aba = 'todos' | 'ativos' | 'inativos'

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return '?'
  const letras = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2)
  return letras.toUpperCase()
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; aba?: string }>
}) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil?.role)) redirect('/admin')

  const { page: pageParam, q, aba: abaParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const busca = (q ?? '').trim()
  const aba: Aba = abaParam === 'ativos' || abaParam === 'inativos' ? abaParam : 'todos'
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const base = () => {
    const query = supabaseAdmin
      .from('perfis')
      .select('*, eventos!eventos_cliente_id_fkey(count), fornecedores(nome)', { count: 'exact' })
    // Admin enxerga apenas a equipe da própria organização
    if (!ehMaster(perfil?.role)) query.eq('organizacao_id', perfil!.organizacao_id)
    if (busca) query.or(`nome.ilike.%${busca}%,email.ilike.%${busca}%`)
    return query
  }

  const lista = base().order('created_at', { ascending: false }).range(from, to)
  if (aba === 'ativos') lista.neq('ativo', false)
  if (aba === 'inativos') lista.eq('ativo', false)

  // Os contadores das abas precisam ser contados à parte: a lista já vem
  // filtrada pela aba, então não dá pra derivar um do outro.
  const [{ data: usuarios, count }, { count: qtdAtivos }, { count: qtdInativos }] = await Promise.all([
    lista,
    base().neq('ativo', false).limit(0),
    base().eq('ativo', false).limit(0),
  ])

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const totalGeral = (qtdAtivos ?? 0) + (qtdInativos ?? 0)

  const linhas = (usuarios ?? []).map(u => ({
    id: u.id as string,
    nome: u.nome as string,
    email: u.email as string,
    role: (u.role ?? 'cliente') as Role,
    ativo: u.ativo !== false,
    criadoEm: u.created_at as string,
    setorNome: (u.fornecedores as { nome?: string } | null)?.nome,
    eventoCount: (u.eventos as { count: number }[] | null)?.[0]?.count ?? 0,
  }))

  /** Preserva busca e aba ao trocar de página, e vice-versa. */
  const url = (mudanca: Partial<{ page: number; q: string; aba: Aba }>) => {
    const p = new URLSearchParams()
    const novoQ = mudanca.q ?? busca
    const novaAba = mudanca.aba ?? aba
    const novaPage = mudanca.page ?? 1
    if (novoQ) p.set('q', novoQ)
    if (novaAba !== 'todos') p.set('aba', novaAba)
    if (novaPage > 1) p.set('page', String(novaPage))
    const s = p.toString()
    return `/admin/usuarios${s ? `?${s}` : ''}`
  }

  const ABAS: { chave: Aba; rotulo: string; contador: number }[] = [
    { chave: 'todos', rotulo: 'Todos', contador: totalGeral },
    { chave: 'ativos', rotulo: 'Ativos', contador: qtdAtivos ?? 0 },
    { chave: 'inativos', rotulo: 'Inativos', contador: qtdInativos ?? 0 },
  ]

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil?.role)}>
    <div className="space-y-5">
      {/* Cabeçalho: bloco de ícone + título + contagem, ações à direita */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3" data-tutorial="usr-resumo">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(59,130,246,0.18)' }}>
            <Users className="w-5 h-5 text-brand-400" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-800 leading-tight">Usuários</h1>
            <p className="text-slate-500 text-sm">
              {total} {total === 1 ? 'pessoa com acesso' : 'pessoas com acesso'}
              {busca && ' para esta busca'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <TutorialButton />
          <Link href="/admin/usuarios/novo" data-tutorial="usr-novo" className="btn btn-primario">
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Novo usuário</span>
            <span className="sm:hidden">Novo</span>
          </Link>
        </div>
      </div>

      {/* Busca */}
      <form className="flex gap-2">
        {aba !== 'todos' && <input type="hidden" name="aba" value={aba} />}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            name="q"
            defaultValue={busca}
            placeholder="Buscar por nome ou e-mail..."
            className="input"
            style={{ paddingLeft: 36 }}
          />
        </div>
        {busca && (
          <Link href={url({ q: '' })} className="btn btn-secundario btn-icone" aria-label="Limpar busca">
            <X className="w-4 h-4" />
          </Link>
        )}
      </form>

      {/* Abas com contador — filtram por situação sem recarregar o conceito */}
      <div className="border-b border-slate-200 flex items-center gap-1" data-tutorial="usr-abas">
        {ABAS.map(({ chave, rotulo, contador }) => {
          const ativa = aba === chave
          return (
            <Link
              key={chave}
              href={url({ aba: chave })}
              className={`relative flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
                ativa ? 'text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {rotulo}
              <span className={`text-2xs tabular-nums px-1.5 py-0.5 rounded ${
                ativa ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500'
              }`}>
                {contador}
              </span>
              {ativa && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-slate-800 rounded-full" />}
            </Link>
          )
        })}
      </div>

      {!linhas.length ? (
        <div className="bg-white border border-slate-200 rounded-2xl py-16 text-center">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-700 text-sm font-medium">
            {busca ? 'Ninguém encontrado' : aba === 'inativos' ? 'Ninguém inativo' : 'Nenhum usuário cadastrado'}
          </p>
          <p className="text-slate-500 text-sm mt-1">
            {busca ? 'Tente outro nome ou e-mail.' : 'Crie um acesso para sua equipe começar a usar.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {linhas.map((u, i) => (
            <div
              key={u.id}
              className="bg-white border border-slate-200 rounded-2xl px-4 py-3.5 flex items-start gap-3 hover:border-slate-300 transition-colors"
            >
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: 'rgba(59,130,246,0.16)' }}
              >
                <span className="text-brand-400 text-xs font-semibold">{iniciais(u.nome)}</span>
              </div>

              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-slate-800 text-sm font-semibold truncate">{u.nome}</p>
                  {u.id === perfil!.id && (
                    <span className="text-2xs font-medium text-slate-500 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                      Você
                    </span>
                  )}
                  {!u.ativo && (
                    <span className="text-2xs font-medium text-aviso-700 bg-aviso-50 border border-aviso-200 px-1.5 py-0.5 rounded">
                      Inativo
                    </span>
                  )}
                </div>

                {/* Metadados numa linha só, separados por ícone — é o que dá
                    densidade sem virar tabela. */}
                <div className="flex items-center gap-3 flex-wrap text-slate-500 text-xs">
                  <span className="flex items-center gap-1 min-w-0">
                    <Mail className="w-3 h-3 shrink-0" />
                    <span className="truncate">{u.email}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Building2 className="w-3 h-3 shrink-0" />
                    {u.role === 'supervisor'
                      ? (u.setorNome ?? 'sem setor')
                      : `${u.eventoCount} evento${u.eventoCount !== 1 ? 's' : ''}`}
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarDays className="w-3 h-3 shrink-0" />
                    {format(new Date(u.criadoEm), 'dd/MM/yyyy')}
                  </span>
                </div>

                <span
                  data-tutorial={i === 0 ? 'usr-papel' : undefined}
                  className={`inline-flex text-2xs px-1.5 py-0.5 rounded font-medium border ${ROLE_BADGE[u.role] ?? ROLE_BADGE.cliente}`}
                >
                  {ROLE_LABELS[u.role] ?? u.role}
                </span>
              </div>

              <div className="shrink-0 -mr-1" data-tutorial={i === 0 ? 'usr-acoes' : undefined}>
                {u.id !== perfil!.id && <UsuarioActions usuarioId={u.id} usuarioNome={u.nome} />}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-slate-500 text-xs">Página {page} de {totalPages}</p>
          <div className="flex items-center gap-1">
            <Link
              href={url({ page: page - 1 })}
              aria-disabled={page <= 1}
              aria-label="Página anterior"
              className={`btn btn-secundario btn-icone ${page <= 1 ? 'pointer-events-none opacity-40' : ''}`}
            >
              <ChevronLeft className="w-4 h-4" />
            </Link>
            <Link
              href={url({ page: page + 1 })}
              aria-disabled={page >= totalPages}
              aria-label="Próxima página"
              className={`btn btn-secundario btn-icone ${page >= totalPages ? 'pointer-events-none opacity-40' : ''}`}
            >
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
    </TutorialProvider>
  )
}
