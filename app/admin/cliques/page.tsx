import { redirect } from 'next/navigation'
import { MousePointerClick, Globe, MessageCircle, AlertTriangle, ListOrdered, CalendarDays } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { ehMaster } from '@/lib/permissions'
import { resumoDosCliques, type Contagem } from '@/lib/cliques'
import { PageHeader, Secao, EmptyState } from '@/components/ui/Superficie'
import StatCard from '@/components/StatCard'
import IconeInstagram from '@/components/ui/IconeInstagram'

export const revalidate = 0

/*
 * Cliques no Instagram, no site e no WhatsApp comercial — pedido do Juan, 09/10/2026 ("quantas pessoas clicaram
 * no ícone que encaminha para o nosso instagram ... e quem clica pra ir no nosso site"). Só o master: a lista
 * mostra o nome de quem clicou. Botão de entrada no Backlog (é número de divulgação, não de evento).
 * Os dados: lib/cliques.ts; os links: lib/links-rastreados.ts.
 */
export default async function CliquesPage() {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!ehMaster(perfil.role)) redirect('/admin')

  const r = await resumoDosCliques()
  const sub = (c: Contagem) => `${c.seteDias} nos últimos 7 dias · ${c.hoje} hoje`

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Cliques"
        descricao="Quem clicou no Instagram, no site e no WhatsApp comercial da Credenciei"
        voltarPara="/admin/backlog"
      />

      {r.tabelaFaltando && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-800 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Falta rodar o SQL <strong>supabase/upgrade-cliques-links.sql</strong> no Supabase. Até lá, os cliques no
            Instagram e no site levam a pessoa normalmente, mas não ficam registrados.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label="Instagram" value={r.instagram.total} sub={sub(r.instagram)} icon={IconeInstagram} tom="acento" />
        <StatCard label="Site (credenciei.com.br)" value={r.site.total} sub={sub(r.site)} icon={Globe} tom="info" />
        <StatCard label="WhatsApp comercial" value={r.whatsapp.total} sub={sub(r.whatsapp)} icon={MessageCircle} tom="sucesso" />
      </div>
      <p className="text-slate-400 text-xs -mt-3">
        Instagram e site contam a partir de 09/10/2026, quando os links passaram a ser registrados.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Secao icone={<ListOrdered className="w-3.5 h-3.5" />} titulo="De onde vieram" descricao="Instagram e site, por tela de origem">
          {r.porOrigem.length ? (
            <table className="w-full text-sm">
              <tbody>
                {r.porOrigem.map(o => (
                  <tr key={`${o.destino}${o.origem}`} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 px-4 text-slate-700">{o.destino}</td>
                    <td className="py-2 px-4 text-slate-500">{o.origem}</td>
                    <td className="py-2 px-4 text-right font-semibold tabular-nums">{o.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState titulo="Nenhum clique ainda" />}
        </Secao>

        <Secao icone={<CalendarDays className="w-3.5 h-3.5" />} titulo="Por evento" descricao="Cliques que saíram da credencial e do formulário de cada evento">
          {r.porEvento.length ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs text-left">
                  <th className="py-2 px-4 font-medium">Evento</th>
                  <th className="py-2 px-4 font-medium text-right">Instagram</th>
                  <th className="py-2 px-4 font-medium text-right">Site</th>
                </tr>
              </thead>
              <tbody>
                {r.porEvento.map(e => (
                  <tr key={e.evento} className="border-t border-slate-100">
                    <td className="py-2 px-4 text-slate-700">{e.evento}</td>
                    <td className="py-2 px-4 text-right tabular-nums">{e.instagram}</td>
                    <td className="py-2 px-4 text-right tabular-nums">{e.site}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState titulo="Nenhum clique de evento ainda" />}
        </Secao>
      </div>

      <Secao icone={<MousePointerClick className="w-3.5 h-3.5" />} titulo="Quem clicou" descricao="Os últimos 200 cliques no Instagram e no site (horário de Brasília)">
        {r.ultimos.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-slate-400 text-xs text-left">
                  <th className="py-2 px-4 font-medium">Quando</th>
                  <th className="py-2 px-4 font-medium">Para</th>
                  <th className="py-2 px-4 font-medium">De onde</th>
                  <th className="py-2 px-4 font-medium">Quem</th>
                </tr>
              </thead>
              <tbody>
                {r.ultimos.map((u, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-2 px-4 text-slate-500 tabular-nums whitespace-nowrap">{u.quando}</td>
                    <td className="py-2 px-4 text-slate-700">{u.destino}</td>
                    <td className="py-2 px-4 text-slate-500">{u.origem}</td>
                    <td className="py-2 px-4 text-slate-700">
                      {u.pessoa ?? (u.setor ? `Alguém do setor ${u.setor}` : '—')}
                      {(u.pessoa && u.setor) || u.evento ? (
                        <span className="block text-slate-400 text-xs">{[u.pessoa ? u.setor : null, u.evento].filter(Boolean).join(' · ')}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState titulo="Nenhum clique registrado ainda" descricao="Os cliques aparecem aqui assim que alguém tocar no Instagram ou no site." />}
      </Secao>
    </div>
  )
}
