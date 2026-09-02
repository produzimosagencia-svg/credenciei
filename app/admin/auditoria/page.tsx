import { redirect } from 'next/navigation'
import { ClipboardList } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeGerenciarUsuarios } from '@/lib/permissions'
import { obterAuditoria } from '@/lib/actions'
import { ACAO_LABELS } from '@/lib/suporte'
import { formatarBR } from '@/lib/tz'
import { PageHeader, Secao, EmptyState } from '@/components/ui/Superficie'

export const revalidate = 0

/**
 * A trilha de "quem alterou o quê" — CPF, setor, ativação, ponto assistido,
 * senha, supervisor. Ver `alteracoes_cadastro` (supabase/upgrade-suporte.sql)
 * e `registrarAuditoria` (lib/auditoria.ts), chamada por toda ação sensível,
 * não só quando o autor é suporte.
 *
 * O filtro por escopo já vem PRONTO de `obterAuditoria`: master vê tudo,
 * admin a própria organização, suporte só o que ele mesmo fez. Esta página
 * não filtra de novo — confiar na mesma função que decide em qualquer outro
 * lugar evita duas réguas divergindo.
 */
export default async function AuditoriaPage() {
  const perfil = await getPerfil()
  if (!perfil || !(podeGerenciarUsuarios(perfil.role) || perfil.role === 'suporte')) redirect('/admin')

  const linhas = await obterAuditoria({ limite: 200 })

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Auditoria"
        descricao={perfil.role === 'suporte' ? 'As alterações que você fez' : 'Correção de cadastro, mudança de setor, ativação, ponto e senha'}
      />

      <Secao tom="acento" icone={<ClipboardList className="w-3.5 h-3.5" />} titulo={`${linhas.length} registro${linhas.length === 1 ? '' : 's'}`} corpoClassName={linhas.length ? '' : 'p-4'}>
        {!linhas.length ? (
          <EmptyState icone={<ClipboardList className="w-7 h-7" />} titulo="Nenhuma alteração registrada ainda" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-2xs uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left font-semibold px-4 py-2.5">Ação</th>
                  <th className="text-left font-semibold px-4 py-2.5">Quem</th>
                  <th className="text-left font-semibold px-4 py-2.5">Pessoa</th>
                  <th className="text-left font-semibold px-4 py-2.5">De → Para</th>
                  <th className="text-left font-semibold px-4 py-2.5">Motivo</th>
                  <th className="text-left font-semibold px-4 py-2.5">Quando</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60 align-top">
                    <td className="px-4 py-2.5 text-slate-800 font-medium whitespace-nowrap">{ACAO_LABELS[l.acao] ?? l.acao}</td>
                    <td className="px-4 py-2.5 text-slate-600">{l.usuarioResponsavel}</td>
                    <td className="px-4 py-2.5 text-slate-500">{l.funcionarioNome ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-[14rem] truncate">
                      {l.valorAnterior || l.valorNovo ? `${l.valorAnterior ?? '—'} → ${l.valorNovo ?? '—'}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 max-w-[16rem] truncate">{l.motivo ?? '—'}</td>
                    <td className="px-4 py-2.5 text-slate-500 tabular-nums whitespace-nowrap">{formatarBR(l.criadoEm, 'curto')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </div>
  )
}
