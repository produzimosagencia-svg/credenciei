import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Plus, Users, CalendarDays, ShieldCheck } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
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
    { alvo: 'usr-resumo', titulo: 'Quem tem acesso ao sistema', posicao: 'bottom', icone: Users,
      descricao: 'Esta lista mostra todas as pessoas da sua organização que conseguem entrar no sistema. Não confunda com a equipe do evento: quem só trabalha no dia aparece dentro do setor, não aqui.' },
    { alvo: 'usr-novo', titulo: 'Criar um acesso', posicao: 'left', icone: Plus,
      descricao: 'Use para dar acesso a um supervisor. Ele recebe e-mail e senha por WhatsApp e passa a enxergar apenas o setor que você escolher.' },
    { alvo: 'usr-papel', titulo: 'Papel', posicao: 'bottom', icone: ShieldCheck,
      descricao: 'O papel define o que a pessoa enxerga. Administrador gerencia toda a organização — eventos, setores e equipe. Supervisor enxerga só o próprio setor: a equipe dele, o scanner e as presenças daquele setor.' },
    { alvo: 'usr-setor', titulo: 'Setor / Eventos', posicao: 'bottom', icone: CalendarDays,
      descricao: 'Para supervisor, mostra a qual setor ele está preso. Para administrador, mostra quantos eventos ele já criou.' },
    { alvo: 'usr-status', titulo: 'Status', posicao: 'bottom', icone: Users,
      descricao: 'Ativo entra normalmente. Inativo é bloqueado no login sem perder o histórico — use quando alguém sai da equipe mas você quer manter os registros antigos.' },
    { alvo: 'usr-acoes', titulo: 'Ações', posicao: 'left', icone: Plus,
      descricao: 'Aqui você edita os dados, bloqueia o acesso ou exclui de vez. Você nunca vê essas ações na sua própria linha — ninguém remove o próprio acesso por engano.' },
  ],
}

const PAGE_SIZE = 20

const ROLE_BADGES: Record<Role, string> = {
  master: 'bg-amber-50 text-amber-600 border-amber-200',
  admin: 'bg-red-50 text-red-600 border-red-200',
  gerente: 'bg-brand-50 text-brand-600 border-brand-200',
  supervisor: 'bg-blue-50 text-blue-600 border-blue-200',
  cliente: 'bg-slate-100 text-slate-500 border-slate-200',
}

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const perfil = await getPerfil()
  if (!podeGerenciarUsuarios(perfil?.role)) redirect('/admin')

  const { page: pageParam } = await searchParams
  const page = Math.max(1, Number(pageParam) || 1)
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const usuariosQuery = supabaseAdmin
    .from('perfis')
    .select('*, eventos!eventos_cliente_id_fkey(count), fornecedores(nome)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)
  // Admin enxerga apenas a equipe da própria organização
  if (!ehMaster(perfil?.role)) usuariosQuery.eq('organizacao_id', perfil!.organizacao_id)
  const { data: usuarios, count } = await usuariosQuery

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <TutorialProvider tutorial={TUTORIAL} ativo={!ehMaster(perfil?.role)}>
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3">
        <div data-tutorial="usr-resumo">
          <h1 className="text-2xl font-bold text-slate-800">Usuários</h1>
          <p className="text-slate-500 text-sm mt-0.5">{total} usuário{total !== 1 ? 's' : ''} com acesso ao sistema</p>
        </div>
        <div className="flex items-center gap-2">
          <TutorialButton />
          <Link
            href="/admin/usuarios/novo"
            data-tutorial="usr-novo"
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white text-sm px-4 py-2.5 rounded-xl font-semibold transition-all shadow-md shadow-brand-200"
          >
            <Plus className="w-4 h-4" />
            Novo Usuário
          </Link>
        </div>
      </div>

      {!usuarios?.length ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
          <Users className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-semibold">Nenhum usuário cadastrado</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                {['Usuário', 'E-mail', 'Papel', 'Setor / Eventos', 'Status', 'Criado em', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-slate-400 font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u, i) => {
                const eventoCount = (u.eventos as any)?.[0]?.count ?? 0
                const role = (u.role ?? 'cliente') as Role
                const setorNome = (u.fornecedores as any)?.nome as string | undefined
                const ativo = u.ativo !== false
                return (
                  <tr key={u.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-slate-800 text-sm font-semibold">{u.nome}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-sm">{u.email}</td>
                    <td className="px-4 py-3" data-tutorial={i === 0 ? 'usr-papel' : undefined}>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${ROLE_BADGES[role] ?? ROLE_BADGES.cliente}`}>
                        {ROLE_LABELS[role] ?? role}
                      </span>
                    </td>
                    <td className="px-4 py-3" data-tutorial={i === 0 ? 'usr-setor' : undefined}>
                      {role === 'supervisor' ? (
                        <span className="text-slate-500 text-sm">{setorNome ?? '—'}</span>
                      ) : (
                        <div className="flex items-center gap-1.5 text-slate-500 text-sm">
                          <CalendarDays className="w-3.5 h-3.5" />
                          {eventoCount}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3" data-tutorial={i === 0 ? 'usr-status' : undefined}>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${ativo ? 'bg-green-50 text-green-600 border-green-200' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                        {ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {format(new Date(u.created_at), "dd/MM/yyyy", { locale: ptBR })}
                    </td>
                    <td className="px-4 py-3" data-tutorial={i === 0 ? 'usr-acoes' : undefined}>
                      {u.id !== perfil!.id && <UsuarioActions usuarioId={u.id} usuarioNome={u.nome} />}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
              <p className="text-slate-400 text-xs">Página {page} de {totalPages}</p>
              <div className="flex items-center gap-1">
                <Link
                  href={`/admin/usuarios?page=${page - 1}`}
                  aria-disabled={page <= 1}
                  className={`p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors ${page <= 1 ? 'pointer-events-none opacity-30' : ''}`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Link>
                <Link
                  href={`/admin/usuarios?page=${page + 1}`}
                  aria-disabled={page >= totalPages}
                  className={`p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors ${page >= totalPages ? 'pointer-events-none opacity-30' : ''}`}
                >
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </TutorialProvider>
  )
}
