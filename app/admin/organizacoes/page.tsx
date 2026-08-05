import Link from 'next/link'
import { redirect } from 'next/navigation'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Building2, Plus, CalendarDays, User, CheckCircle2, PauseCircle } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { podeGerenciarOrganizacoes } from '@/lib/permissions'
import OrganizacaoActions from './OrganizacaoActions'
import OrganizacaoAvatar from './OrganizacaoAvatar'
import { sufixoPeriodo } from '@/lib/cobranca'

export const revalidate = 0

export default async function OrganizacoesPage() {
  const perfil = await getPerfil()
  if (!podeGerenciarOrganizacoes(perfil?.role)) redirect('/admin')

  const db = supabaseAdmin
  const { data: orgs } = await db
    .from('organizacoes')
    .select('*, eventos(count), perfis(nome, email, role)')
    .order('created_at', { ascending: false })

  // Assina as URLs das fotos em lote (bucket privado, mesmo padrão do resto do sistema)
  const paths = (orgs ?? []).map(o => o.foto_perfil_path).filter((p): p is string => !!p)
  const urlPorPath: Record<string, string> = {}
  if (paths.length) {
    const { data: signed } = await db.storage.from('presencas').createSignedUrls(paths, 60 * 60)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlPorPath[s.path] = s.signedUrl
  }

  const ativas = orgs?.filter(o => o.ativo).length ?? 0

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Organizações</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {orgs?.length ?? 0} organizaç{(orgs?.length ?? 0) !== 1 ? 'ões' : 'ão'} • {ativas} ativa{ativas !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/admin/organizacoes/novo"
          className="flex items-center gap-2 btn btn-primario"
        >
          <Plus className="w-4 h-4" />
          Nova Organização
        </Link>
      </div>

      {!orgs?.length ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center shadow-sm">
          <Building2 className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-500 font-semibold">Nenhuma organização cadastrada</p>
          <p className="text-slate-400 text-sm mt-1">Crie a primeira organização e o admin dela</p>
          <Link href="/admin/organizacoes/novo" className="inline-block mt-4 btn btn-primario">
            Criar organização
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {orgs.map(org => {
            const eventoCount = (org.eventos as any)?.[0]?.count ?? 0
            const admin = (org.perfis as any[])?.find(p => p.role === 'admin') ?? (org.perfis as any[])?.[0]
            const fotoUrl = org.foto_perfil_path ? urlPorPath[org.foto_perfil_path] ?? null : null
            return (
              <div key={org.id} className={`bg-white border rounded-2xl p-5 shadow-sm transition-all ${org.ativo ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <OrganizacaoAvatar url={fotoUrl} nome={org.nome} size={44} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-slate-800 font-bold">{org.nome}</h3>
                        <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full font-semibold ${org.ativo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                          {org.ativo ? <CheckCircle2 className="w-3 h-3" /> : <PauseCircle className="w-3 h-3" />}
                          {org.ativo ? 'Ativa' : 'Suspensa'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-slate-400 text-xs">
                        {admin && (
                          <span className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5" />
                            {admin.nome} • {admin.email}
                          </span>
                        )}
                        {org.documento && <span>{org.documento}</span>}
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="w-3.5 h-3.5" />
                          {eventoCount} / {org.limite_eventos} evento{org.limite_eventos !== 1 ? 's' : ''}
                        </span>
                        {org.valor_cobrado != null && (
                          <span className="tabular-nums">
                            {org.valor_cobrado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            {sufixoPeriodo(org.valor_cobrado_periodo)}
                          </span>
                        )}
                        <span>desde {format(new Date(org.created_at), "dd/MM/yyyy", { locale: ptBR })}</span>
                      </div>
                    </div>
                  </div>
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
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
