import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Users, LogIn, Camera, LogOut, Clock, UserX } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeAcompanhar } from '@/lib/permissions'
import { diaBRT } from '@/lib/janelas'
import { formatCpf } from '@/lib/format'
import { PageHeader, Secao, EmptyState } from '@/components/ui/Superficie'

export const revalidate = 0

/**
 * A lista por trás de cada número do painel do evento.
 *
 * Os cartões de indicador respondem "quantos"; esta tela responde "quem" —
 * com nome, setor, CPF e a hora da batida daquele dia. Existe porque, no meio
 * da operação, "87 entradas" não serve para nada sozinho: a pergunta seguinte
 * é sempre "quem ainda falta", e antes disto ela só tinha resposta abrindo
 * setor por setor.
 *
 * Sempre de UM DIA. É a mesma correção que o painel recebeu junto: numa
 * operação de onze dias, misturar os dias faz quem trabalhou na montagem
 * aparecer como presente no dia do show.
 */

type Etapa = 'entrada' | 'meio' | 'fim'

const VISOES = {
  entrada: { titulo: 'Registraram a entrada', icone: LogIn, etapa: 'entrada' as Etapa },
  meio: { titulo: 'Registraram o meio', icone: Camera, etapa: 'meio' as Etapa },
  fim: { titulo: 'Registraram a saída', icone: LogOut, etapa: 'fim' as Etapa },
  presentes: { titulo: 'Presentes agora', icone: Clock, etapa: null },
  faltam: { titulo: 'Ainda não chegaram', icone: UserX, etapa: null },
} as const

type Visao = keyof typeof VISOES

export default async function PresencaPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ dia?: string; ver?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeAcompanhar(perfil.role)) redirect('/admin')

  const { id: eventoId } = await params
  const { dia: diaParam, ver } = await searchParams

  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoId).single()
  if (!evento) notFound()
  if (!veTodosEventos(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) notFound()

  const visao: Visao = (ver && ver in VISOES ? ver : 'entrada') as Visao
  const { titulo, icone: Icone, etapa } = VISOES[visao]

  const { data: dias } = await supabase
    .from('jornada_dias').select('data')
    .eq('evento_id', eventoId).eq('cancelado', false).order('data')
  const diasDaOperacao = (dias ?? []).map(d => d.data as string)
  const hoje = diaBRT()
  const diaEscolhido =
    (diaParam && diasDaOperacao.includes(diaParam) ? diaParam : null)
    ?? (diasDaOperacao.includes(hoje) ? hoje : null)
    ?? [...diasDaOperacao].reverse().find(d => d <= hoje)
    ?? diasDaOperacao[0]
    ?? hoje

  /*
   * A equipe inteira do evento, e não só quem bateu: as visões "ainda não
   * chegaram" e "presentes agora" se definem por AUSÊNCIA de registro, então
   * precisam da lista completa para subtrair dela.
   *
   * Supervisor enxerga só o próprio setor — mesma régua do resto do sistema.
   */
  let equipeQuery = supabase
    .from('funcionarios')
    .select('id, nome, cpf, ativo, fornecedor_id, fornecedores!inner(nome, evento_id)')
    .eq('fornecedores.evento_id', eventoId)
    .order('nome')
  if (perfil.role === 'supervisor' && perfil.fornecedor_id) {
    equipeQuery = equipeQuery.eq('fornecedor_id', perfil.fornecedor_id)
  }
  const { data: equipe } = await equipeQuery

  const { data: registros } = await supabase
    .from('registros')
    .select('funcionario_id, tipo, created_at, registro_manual')
    .eq('evento_id', eventoId)
    .eq('data_ref', diaEscolhido)

  const porPessoa = new Map<string, Partial<Record<Etapa, { em: string; manual: boolean }>>>()
  for (const r of registros ?? []) {
    const atual = porPessoa.get(r.funcionario_id) ?? {}
    atual[r.tipo as Etapa] = { em: r.created_at as string, manual: r.registro_manual === true }
    porPessoa.set(r.funcionario_id, atual)
  }

  type Linha = {
    id: string; nome: string; cpf: string; setor: string
    em: string | null; manual: boolean
  }

  const linhas: Linha[] = (equipe ?? [])
    .map(f => {
      const feito = porPessoa.get(f.id) ?? {}
      const setor = (f.fornecedores as unknown as { nome: string } | null)?.nome ?? '—'
      const base = { id: f.id as string, nome: f.nome as string, cpf: f.cpf as string, setor }

      if (etapa) {
        const r = feito[etapa]
        return r ? { ...base, em: r.em, manual: r.manual } : null
      }
      if (visao === 'presentes') {
        // Entrou e ainda não saiu — a hora mostrada é a da ENTRADA, que é o
        // que responde "desde quando essa pessoa está aqui".
        return feito.entrada && !feito.fim ? { ...base, em: feito.entrada.em, manual: feito.entrada.manual } : null
      }
      // faltam: sem entrada nenhuma no dia. Quem não está ativo não era
      // esperado, então não conta como falta.
      return !feito.entrada && f.ativo !== false ? { ...base, em: null, manual: false } : null
    })
    .filter((l): l is Linha => l !== null)
    // Quem bateu mais cedo primeiro; sem hora (os que faltam), por nome.
    .sort((a, b) => (a.em && b.em ? a.em.localeCompare(b.em) : a.nome.localeCompare(b.nome)))

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  const rotuloDia = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }
  const url = (v: Visao, d: string) => `/admin/eventos/${eventoId}/presenca?ver=${v}&dia=${d}`

  return (
    <div className="space-y-5">
      <PageHeader
        titulo={titulo}
        descricao={`${evento.nome} · ${rotuloDia(diaEscolhido)}${diaEscolhido === hoje ? ' (hoje)' : ''}`}
        acoes={
          <Link href={`/admin/eventos/${eventoId}`} className="btn btn-secundario btn-sm">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao evento
          </Link>
        }
      />

      {/* Trocar de visão sem voltar: as cinco perguntas são lidas em sequência. */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(VISOES) as Visao[]).map(v => (
          <Link
            key={v}
            href={url(v, diaEscolhido)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              v === visao ? 'bg-brand-500 border-brand-500 text-white'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
            }`}
          >
            {VISOES[v].titulo}
          </Link>
        ))}
      </div>

      {diasDaOperacao.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {diasDaOperacao.map(d => (
            <Link
              key={d}
              href={url(visao, d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                d === diaEscolhido ? 'bg-slate-800 border-slate-800 text-white'
                                   : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
              }`}
            >
              {rotuloDia(d)}{d === hoje ? ' · hoje' : ''}
            </Link>
          ))}
        </div>
      )}

      <Secao
        tom="acento"
        icone={<Icone className="w-3.5 h-3.5" />}
        titulo={`${linhas.length} ${linhas.length === 1 ? 'pessoa' : 'pessoas'}`}
        corpoClassName={linhas.length ? '' : 'p-4'}
      >
        {!linhas.length ? (
          <EmptyState icone={<Users className="w-7 h-7" />} titulo="Ninguém nesta lista" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-2xs uppercase tracking-wide border-b border-slate-100">
                  <th className="text-left font-semibold px-4 py-2.5">Nome</th>
                  <th className="text-left font-semibold px-4 py-2.5">Setor</th>
                  <th className="text-left font-semibold px-4 py-2.5">CPF</th>
                  <th className="text-left font-semibold px-4 py-2.5">
                    {visao === 'faltam' ? '' : visao === 'presentes' ? 'Entrou às' : 'Registrou às'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/60">
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{l.nome}</td>
                    <td className="px-4 py-2.5 text-slate-500">{l.setor}</td>
                    <td className="px-4 py-2.5 text-slate-500 font-mono tabular-nums">{formatCpf(l.cpf)}</td>
                    <td className="px-4 py-2.5 text-slate-700 tabular-nums whitespace-nowrap">
                      {l.em ? hora(l.em) : <span className="text-slate-300">—</span>}
                      {/* Batida registrada por outra pessoa: o fechamento
                          precisa distinguir do que a própria pessoa marcou. */}
                      {l.manual && (
                        <span className="ml-2 text-2xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-semibold">
                          manual
                        </span>
                      )}
                    </td>
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
