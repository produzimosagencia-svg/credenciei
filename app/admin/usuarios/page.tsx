import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Users, CalendarDays, Search, Mail, Building2, X } from 'lucide-react'
import { podeGerenciarUsuarios, ehMaster, podeExcluir, ROLE_LABELS, type Role } from '@/lib/permissions'
import UsuarioActions from './UsuarioActions'
import { exibirIdentificador } from '@/lib/usuario'
import { Secao, PageHeader, EmptyState, Badge } from '@/components/ui/Superficie'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'
import { formatarBR } from '@/lib/tz'

export const revalidate = 0

const TUTORIAL: TutorialConfig = {
  tela: 'usuarios-lista',
  versao: 1,
  passos: [
    { alvo: 'usr-resumo', titulo: 'Quem tem acesso ao sistema', posicao: 'bottom', icone: 'Users',
      descricao: 'Esta lista mostra todas as pessoas da sua organização que conseguem entrar no sistema. Não confunda com a equipe do evento: quem só trabalha no dia aparece dentro do setor, não aqui.' },
    { alvo: 'usr-novo', titulo: 'Criar um acesso', posicao: 'left', icone: 'Plus',
      descricao: 'Use para dar acesso a um supervisor. Se for novo, ele recebe um link seguro para criar a senha; se já existir, recebe apenas a nova escala.' },
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
  master: 'selo-acento',
  admin: 'selo-acento',
  gerente: 'selo-neutro',
  supervisor: 'selo-neutro',
  cliente: 'selo-neutro',
  operador_portao: 'selo-neutro',
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
      /*
       * `fornecedores!perfis_fornecedor_id_fkey` — hint OBRIGATÓRIO agora.
       *
       * A migração de hoje (supabase/upgrade-supervisor-multi-setor.sql)
       * criou `supervisor_setores`, que liga `perfis` a `fornecedores` por
       * uma segunda rota (via junção, N:N). O PostgREST passou a enxergar
       * DUAS relações entre as duas tabelas e recusa a consulta inteira com
       * "more than one relationship was found" — foi isso que fez a tela
       * mostrar "0 acessos" com a organização cheia de gente cadastrada.
       * O hint aponta explicitamente pela FK direta e antiga, que é a que
       * esta tela sempre quis dizer (o setor ATIVO do perfil).
       */
      .select('*, eventos!eventos_cliente_id_fkey(count), fornecedores!perfis_fornecedor_id_fkey(nome)', { count: 'exact' })
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
      <div data-tutorial="usr-resumo">
        <PageHeader
          titulo="Acessos"
          descricao="Quem entra no sistema e o que cada pessoa enxerga. Não confunda com a equipe do evento."
          acoes={
            <>
              <TutorialButton />
              <Link href="/admin/usuarios/novo" data-tutorial="usr-novo" className="btn btn-primario">
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Novo usuário</span>
                <span className="sm:hidden">Novo</span>
              </Link>
            </>
          }
        />
      </div>

      {/* Abas com contador — filtram por situação sem recarregar o conceito */}
      <div className="abas" data-tutorial="usr-abas">
        {ABAS.map(({ chave, rotulo, contador }) => (
          <Link
            key={chave}
            href={url({ aba: chave })}
            className={`aba ${aba === chave ? 'aba-ativa' : ''}`}
            aria-current={aba === chave ? 'page' : undefined}
          >
            {rotulo}
            <span className="aba-contador">{contador}</span>
          </Link>
        ))}
      </div>

      {/* Busca */}
      <form className="flex gap-2">
        {aba !== 'todos' && <input type="hidden" name="aba" value={aba} />}
        <div className="relative flex-1 max-w-md">
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

      <Secao
        titulo={aba === 'ativos' ? 'Acessos ativos' : aba === 'inativos' ? 'Acessos inativos' : 'Todos os acessos'}
        descricao={
          busca
            ? `${total} resultado${total === 1 ? '' : 's'} para "${busca}"`
            : `${total} ${total === 1 ? 'pessoa' : 'pessoas'} nesta lista`
        }
      >
        {!linhas.length ? (
          <EmptyState
            icone={<Users className="w-7 h-7" />}
            titulo={busca ? 'Ninguém encontrado' : aba === 'inativos' ? 'Ninguém inativo' : 'Nenhum usuário cadastrado'}
            descricao={busca ? 'Tente outro nome ou e-mail.' : 'Crie um acesso para sua equipe começar a usar.'}
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {linhas.map((u, i) => (
              <div key={u.id} className="px-4 py-3 flex items-start gap-3 hover:bg-slate-50 transition-colors">
                <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="text-slate-600 text-2xs font-semibold">{iniciais(u.nome)}</span>
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-slate-800 text-sm font-medium truncate">{u.nome}</p>
                    {u.id === perfil!.id && <Badge tom="neutro">Você</Badge>}
                    {!u.ativo && <Badge tom="atencao">Inativo</Badge>}
                    <span
                      data-tutorial={i === 0 ? 'usr-papel' : undefined}
                      className={`indicador-selo ${ROLE_BADGE[u.role] ?? ROLE_BADGE.cliente}`}
                    >
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </div>

                  {/* Metadados numa linha só, separados por ícone — é o que dá
                      densidade sem virar tabela. */}
                  <div className="flex items-center gap-3 flex-wrap text-slate-500 text-xs">
                    <span className="flex items-center gap-1 min-w-0">
                      <Mail className="w-3 h-3 shrink-0" />
                      <span className="truncate">{exibirIdentificador(u.email)}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <Building2 className="w-3 h-3 shrink-0" />
                      {u.role === 'supervisor'
                        ? (u.setorNome ?? 'sem setor')
                        : `${u.eventoCount} evento${u.eventoCount !== 1 ? 's' : ''}`}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarDays className="w-3 h-3 shrink-0" />
                      {formatarBR(u.criadoEm, 'data')}
                    </span>
                  </div>
                </div>

                <div className="shrink-0 -mr-1" data-tutorial={i === 0 ? 'usr-acoes' : undefined}>
                  {u.id !== perfil!.id && (
                  <UsuarioActions
                    usuarioId={u.id}
                    usuarioNome={u.nome}
                    podeExcluir={podeExcluir(perfil!.role)}
                  />
                )}
                </div>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-100 bg-slate-50">
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
      </Secao>
    </div>
    </TutorialProvider>
  )
}
