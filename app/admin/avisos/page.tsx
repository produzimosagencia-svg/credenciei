import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Megaphone, ChevronRight, CalendarDays } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarEventos } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { PageHeader, Secao, EmptyState, Badge } from '@/components/ui/Superficie'
import PainelDeAvisos, { eventoVisivel } from '../eventos/[id]/avisos/PainelDeAvisos'

export const revalidate = 0

/**
 * Avisos, pelo menu — sem precisar lembrar em qual evento a pessoa está.
 *
 * Pede o evento primeiro, porque um aviso é sempre DE um evento: os
 * destinatários ("Setores", "Pessoa específica") só existem dentro de um.
 * Escolhido o evento, mostra exatamente a mesma tela de
 * `/admin/eventos/[id]/avisos` — é o mesmo `PainelDeAvisos`.
 *
 * ── Quem vê quais eventos ──
 *
 * Master vê todos; admin vê só os da própria organização. A régua é a mesma
 * do resto do sistema (`veTodosEventos` + `organizacao_id`), e vale nos DOIS
 * pontos: na lista que aparece aqui E na abertura de um evento pelo `?evento=`
 * da URL — porque a lista só esconde, quem barra de verdade é `eventoVisivel`.
 */
export default async function AvisosPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarEventos(perfil.role)) redirect('/admin')

  const { evento: eventoParam } = await searchParams
  const veTodos = veTodosEventos(perfil.role)

  // ── Um evento escolhido: a mesma tela de dentro do evento ────────────────
  if (eventoParam) {
    const evento = await eventoVisivel(eventoParam, perfil, veTodos)
    return (
      <div className="space-y-5">
        <PageHeader
          titulo="Avisos"
          descricao={`${evento.nome} — comunicados na credencial e no painel do supervisor`}
          acoes={
            <Link href="/admin/avisos" className="btn btn-secundario">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
            </Link>
          }
        />
        <PainelDeAvisos eventoId={eventoParam} />
      </div>
    )
  }

  // ── Nenhum evento escolhido: a lista pra escolher ────────────────────────
  let consulta = supabase
    .from('eventos')
    .select('id, nome, local, data_inicio, ativo, organizacao_id, organizacoes(nome)')
    .order('data_inicio', { ascending: false })
  if (!veTodos) consulta = consulta.eq('organizacao_id', perfil.organizacao_id)
  const { data: eventos } = await consulta

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Avisos"
        descricao="Escolha o evento para o qual quer mandar um comunicado"
      />

      <Secao
        tom="acento"
        icone={<Megaphone className="w-3.5 h-3.5" />}
        titulo="Para qual evento?"
        descricao="O aviso aparece na credencial da equipe e no painel do supervisor daquele evento"
        corpoClassName={eventos?.length ? '' : 'p-4'}
      >
        {!eventos?.length ? (
          <EmptyState
            icone={<Megaphone className="w-7 h-7" />}
            titulo="Nenhum evento ainda"
            descricao="Crie um evento no Painel para poder mandar avisos à equipe dele."
          />
        ) : (
          <div className="divide-y divide-slate-50">
            {eventos.map(e => (
              <Link
                key={e.id}
                href={`/admin/avisos?evento=${e.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-slate-800 font-medium truncate flex items-center gap-2">
                    {e.nome}
                    {!e.ativo && <Badge tom="neutro">Encerrado</Badge>}
                  </p>
                  <p className="text-slate-400 text-xs truncate">
                    {formatarBR(e.data_inicio, 'data')}
                    {e.local ? ` · ${e.local}` : ''}
                    {/* De quem é o evento só importa pro master, que vê os de
                        todo mundo — pro admin, é sempre a própria organização. */}
                    {veTodos && (e.organizacoes as unknown as { nome: string } | null)?.nome
                      ? ` · ${(e.organizacoes as unknown as { nome: string }).nome}`
                      : ''}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </Secao>
    </div>
  )
}
