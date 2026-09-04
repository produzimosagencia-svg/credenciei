import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, LogIn, Camera, LogOut, Clock, UserX, CameraOff, LogOut as SaidaX } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeAcompanhar } from '@/lib/permissions'
import { diaBRT } from '@/lib/janelas'
import { VISOES, ehVisao, linhasDaVisao, type Visao } from '@/lib/presenca-visoes'
import { PageHeader } from '@/components/ui/Superficie'
import SeletorDeDia from '@/components/SeletorDeDia'
import TabelaPresenca from './TabelaPresenca'

export const revalidate = 0

/**
 * A lista por trás de cada número do painel do evento — E o que "Pendências
 * e atividade" abria antes.
 *
 * Os cartões de indicador respondem "quantos"; esta tela responde "quem" —
 * com nome, setor, CPF e a hora da batida daquele dia. Existe porque, no meio
 * da operação, "87 entradas" não serve para nada sozinho: a pergunta seguinte
 * é sempre "quem ainda falta", e antes disto ela só tinha resposta abrindo
 * setor por setor.
 *
 * As sete visões, a montagem das linhas e os números vivem em
 * `lib/presenca-visoes.ts`, compartilhados com `/admin/atividades` — que faz
 * a mesma coisa entrando pelo menu em vez de pelo evento.
 *
 * Sempre de UM DIA. Numa operação de onze dias, misturar os dias faz quem
 * trabalhou na montagem aparecer como presente no dia do show.
 */

const ICONE: Record<Visao, React.ElementType> = {
  entrada: LogIn, meio: Camera, fim: LogOut,
  presentes: Clock, faltam: UserX, sem_meio: CameraOff, sem_saida: SaidaX,
}

export default async function PresencaPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ dia?: string; ver?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeAcompanhar(perfil)) redirect('/admin')

  const { id: eventoId } = await params
  const { dia: diaParam, ver } = await searchParams

  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoId).single()
  if (!evento) notFound()
  if (!veTodosEventos(perfil) && evento.organizacao_id !== perfil.organizacao_id) notFound()

  const visao: Visao = ehVisao(ver) ? ver : 'entrada'
  const Icone = ICONE[visao]

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

  // Supervisor enxerga só a própria equipe — mesma régua do resto do sistema.
  const setorDoSupervisor = perfil.role === 'supervisor' ? (perfil.fornecedor_id as string | null) : null

  const { linhas, colunaHora } = await linhasDaVisao({
    eventoId, visao, dia: diaEscolhido, fornecedorId: setorDoSupervisor,
  })

  const rotuloDia = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }
  const url = (v: Visao, d: string) => `/admin/eventos/${eventoId}/presenca?ver=${v}&dia=${d}`

  return (
    <div className="space-y-5">
      <PageHeader
        titulo={VISOES[visao].titulo}
        descricao={`${evento.nome} · ${rotuloDia(diaEscolhido)}${diaEscolhido === hoje ? ' (hoje)' : ''}`}
        acoes={
          <Link href={`/admin/eventos/${eventoId}`} className="btn btn-secundario btn-sm">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao evento
          </Link>
        }
      />

      {/*
        * Trocar de visão sem voltar: as sete perguntas são lidas em
        * sequência. Uma faixa só, com ícone, em vez de pills soltas no fundo
        * cinza — mesmo desenho de `/admin/atividades`, que mostra a mesma
        * coisa entrando pelo menu em vez de pelo evento.
        */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-1.5 overflow-x-auto">
        <div className="flex items-center gap-1 min-w-max">
          {(Object.keys(VISOES) as Visao[]).map(v => {
            const VisaoIcone = ICONE[v]
            const ativa = v === visao
            return (
              <Link
                key={v}
                href={url(v, diaEscolhido)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                  ativa ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <VisaoIcone className={`w-3.5 h-3.5 shrink-0 ${ativa ? 'text-white' : 'text-slate-400'}`} />
                {VISOES[v].titulo}
              </Link>
            )
          })}
        </div>
      </div>

      {diasDaOperacao.length > 1 && (
        <SeletorDeDia dias={diasDaOperacao} diaEscolhido={diaEscolhido} hoje={hoje} hrefBase={`/admin/eventos/${eventoId}/presenca?ver=${visao}`} />
      )}

      <TabelaPresenca
        linhas={linhas}
        icone={<Icone className="w-3.5 h-3.5" />}
        colunaHora={colunaHora}
        mostrarSetor={!setorDoSupervisor}
      />
    </div>
  )
}
