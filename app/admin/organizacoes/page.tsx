import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Building2, Plus, CalendarDays, User, CheckCircle2, PauseCircle } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarOrganizacoes } from '@/lib/permissions'
import OrganizacaoActions from './OrganizacaoActions'
import OrganizacaoAvatar from './OrganizacaoAvatar'
import EventosDaOrganizacao from './EventosDaOrganizacao'
import { Secao, PageHeader, EmptyState, Badge } from '@/components/ui/Superficie'
import { sufixoPeriodo } from '@/lib/cobranca'
import { formatarBR } from '@/lib/tz'

export const revalidate = 0

export default async function OrganizacoesPage() {
  const perfil = await getPerfil()
  if (!podeGerenciarOrganizacoes(perfil?.role)) redirect('/admin')

  const db = supabaseAdmin
  const [{ data: orgs }, { data: todosEventos }] = await Promise.all([
    db.from('organizacoes')
      .select('*, eventos(count), perfis(nome, email, role)')
      .order('created_at', { ascending: false }),
    // Todos os eventos: os de cada organização e os SEM dono, que são
    // justamente o que o master anexa aqui.
    db.from('eventos').select('id, nome, data_inicio, ativo, organizacao_id')
      .order('data_inicio', { ascending: false }),
  ])

  const resumo = (e: { id: string; nome: string; data_inicio: string | null; ativo: boolean }) => ({
    id: e.id,
    nome: e.nome,
    data: e.data_inicio ? formatarBR(e.data_inicio, 'data') : 'sem data',
    ativo: e.ativo !== false,
  })
  const eventosPorOrg = new Map<string, ReturnType<typeof resumo>[]>()
  const semDono: ReturnType<typeof resumo>[] = []
  for (const e of todosEventos ?? []) {
    const r = resumo(e)
    if (e.organizacao_id) eventosPorOrg.set(e.organizacao_id, [...(eventosPorOrg.get(e.organizacao_id) ?? []), r])
    else semDono.push(r)
  }

  // Assina as URLs das fotos em lote (bucket privado, mesmo padrão do resto do sistema)
  const paths = (orgs ?? []).map(o => o.foto_perfil_path).filter((p): p is string => !!p)
  const urlPorPath: Record<string, string> = {}
  if (paths.length) {
    const { data: signed } = await db.storage.from('presencas').createSignedUrls(paths, 60 * 60)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlPorPath[s.path] = s.signedUrl
  }

  const ativas = orgs?.filter(o => o.ativo).length ?? 0

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Organizações"
        descricao="Os clientes da plataforma — cada um com o próprio painel, equipe e limite de eventos"
        acoes={
          <Link href="/admin/organizacoes/novo" className="btn btn-primario">
            <Plus className="w-3.5 h-3.5" />
            Nova organização
          </Link>
        }
      />

      <Secao
        titulo="Todas as organizações"
        descricao={`${orgs?.length ?? 0} cadastrada${(orgs?.length ?? 0) !== 1 ? 's' : ''} · ${ativas} ativa${ativas !== 1 ? 's' : ''}`}
      >
        {!orgs?.length ? (
          <EmptyState
            icone={<Building2 className="w-7 h-7" />}
            titulo="Nenhuma organização cadastrada"
            descricao="Crie a primeira organização e o admin dela"
            acao={
              <Link href="/admin/organizacoes/novo" className="btn btn-primario">
                <Plus className="w-3.5 h-3.5" /> Criar organização
              </Link>
            }
          />
        ) : (
          <div className="divide-y divide-slate-100">
            {orgs.map(org => {
              const eventoCount = (org.eventos as any)?.[0]?.count ?? 0
              const admin = (org.perfis as any[])?.find(p => p.role === 'admin') ?? (org.perfis as any[])?.[0]
              const fotoUrl = org.foto_perfil_path ? urlPorPath[org.foto_perfil_path] ?? null : null
              return (
                <div
                  key={org.id}
                  className={`px-4 py-3 flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors ${org.ativo ? '' : 'opacity-70'}`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <OrganizacaoAvatar url={fotoUrl} nome={org.nome} size={34} />
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-slate-800 text-sm font-medium truncate">{org.nome}</h3>
                        <Badge tom={org.ativo ? 'positivo' : 'neutro'}>
                          {org.ativo ? <CheckCircle2 className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
                          {org.ativo ? 'Ativa' : 'Suspensa'}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-slate-500 text-xs">
                        {admin && (
                          <span className="flex items-center gap-1 min-w-0">
                            <User className="w-3 h-3 shrink-0" />
                            <span className="truncate">{admin.nome} · {admin.email}</span>
                          </span>
                        )}
                        {org.documento && <span className="tabular-nums">{org.documento}</span>}
                        <span className="flex items-center gap-1">
                          <CalendarDays className="w-3 h-3 shrink-0" />
                          {eventoCount} / {org.limite_eventos} evento{org.limite_eventos !== 1 ? 's' : ''}
                        </span>
                        {org.valor_cobrado != null && (
                          <span className="tabular-nums">
                            {org.valor_cobrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            {sufixoPeriodo(org.valor_cobrado_periodo)}
                          </span>
                        )}
                        <span>desde {formatarBR(org.created_at, 'data')}</span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 -mr-1">
                    <OrganizacaoActions
                      org={{
                        id: org.id,
                        nome: org.nome,
                        documento: org.documento,
                        responsavel_nome: org.responsavel_nome,
                        limite_eventos: org.limite_eventos,
                        valor_cobrado: org.valor_cobrado,
                        valor_cobrado_periodo: org.valor_cobrado_periodo,
                        ativo: org.ativo,
                        fotoUrl,
                      }}
                    />
                  </div>

                  <EventosDaOrganizacao
                    organizacaoId={org.id}
                    organizacaoNome={org.nome}
                    eventos={eventosPorOrg.get(org.id) ?? []}
                    semDono={semDono}
                  />
                </div>
              )
            })}
          </div>
        )}
      </Secao>
    </div>
  )
}
