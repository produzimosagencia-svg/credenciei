import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { LogIn, Camera, LogOut, CheckCircle2, CalendarDays, Activity } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { veTodosEventos, podeAcompanhar } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { formatCpf } from '@/lib/format'
import { diaBRT } from '@/lib/janelas'
import { pendenciasDoDia, ROTULO_PENDENCIA, type EtapaPendente, type Pendencia } from '@/lib/pendencias'
import { Secao, PageHeader, EmptyState, Badge } from '@/components/ui/Superficie'
import FeedDeAtividade from '../FeedDeAtividade'

export const revalidate = 0

/**
 * Quem ficou pendente em cada etapa, num dia.
 *
 * É a mesma lista que o supervisor recebe no WhatsApp quando o horário de cada
 * etapa passa — sai da mesma função (`pendenciasDoDia`), de propósito: duas
 * implementações da mesma regra divergiriam no primeiro ajuste, e um supervisor
 * com uma lista no celular e outra na tela não confia em nenhuma das duas.
 *
 * A tela existe porque a mensagem tem teto de nomes e chega uma vez. Aqui dá
 * para olhar qualquer dia da operação, inclusive os que já passaram.
 */

const ETAPAS: { etapa: EtapaPendente; titulo: string; explicacao: string; icone: React.ReactNode; tom: 'aviso' | 'info' | 'acento' }[] = [
  {
    etapa: 'entrada',
    titulo: 'Não credenciaram a entrada',
    explicacao: 'Estavam previstos para trabalhar e não apareceram no credenciamento.',
    icone: <LogIn className="w-3.5 h-3.5" />,
    tom: 'aviso',
  },
  {
    etapa: 'meio',
    titulo: 'Não registraram o meio',
    explicacao: 'Entraram, mas não tiraram a selfie dentro da janela — que abre 4h depois da entrada de cada um.',
    icone: <Camera className="w-3.5 h-3.5" />,
    tom: 'acento',
  },
  {
    etapa: 'fim',
    titulo: 'Não fizeram o descredenciamento',
    explicacao: 'Entraram e foram embora sem registrar a saída.',
    icone: <LogOut className="w-3.5 h-3.5" />,
    tom: 'info',
  },
]

export default async function PendenciasPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ dia?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeAcompanhar(perfil.role)) redirect('/admin')

  const { id: eventoId } = await params
  const { dia: diaParam } = await searchParams

  const { data: evento } = await supabaseAdmin
    .from('eventos')
    .select('id, nome, organizacao_id, data_inicio, data_fim, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim')
    .eq('id', eventoId)
    .single()
  if (!evento) notFound()

  // Mesma régua do resto do sistema: master vê tudo, admin só a própria
  // organização, supervisor só o evento do setor dele.
  let setorDoSupervisor: string | undefined
  if (perfil.role === 'supervisor') {
    if (!perfil.fornecedor_id) redirect('/admin')
    const { data: setor } = await supabaseAdmin
      .from('fornecedores').select('id, evento_id').eq('id', perfil.fornecedor_id).single()
    if (!setor || setor.evento_id !== eventoId) redirect('/admin')
    setorDoSupervisor = setor.id
  } else if (!veTodosEventos(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
    redirect('/admin')
  }

  /*
   * Dias navegáveis: os dias de TRABALHO (`jornada_dias`), não o período do
   * evento (`data_inicio` → `data_fim`).
   *
   * Os dois divergem sempre que existe montagem ou desmontagem — que é o caso
   * normal, não a exceção. `data_inicio`/`data_fim` marcam só o show em si
   * (05/09 18:30 → 06/09 08:00); os dias de preparação configurados em
   * "Editar evento" (28/08, 31/08 a 04/09, 06/09 a 09/09) vivem à parte, em
   * `jornada_dias`, e ficavam de fora do seletor — a montagem inteira ficava
   * sem como ser conferida nesta tela, embora as pendências daqueles dias
   * existissem e as mensagens de WhatsApp já as usassem.
   */
  const { data: diasTrabalho } = await supabaseAdmin
    .from('jornada_dias')
    .select('data')
    .eq('evento_id', eventoId)
    .eq('cancelado', false)
    .order('data')
  const hoje = diaBRT()
  const dias = (diasTrabalho ?? []).map(d => d.data as string)
  const diaEscolhido = diaParam && dias.includes(diaParam)
    ? diaParam
    : (dias.includes(hoje) ? hoje : dias[dias.length - 1] ?? hoje)

  const pendencias = await pendenciasDoDia({
    eventoId,
    data: diaEscolhido,
    fornecedorId: setorDoSupervisor,
  })

  const porEtapa = (etapa: EtapaPendente) => pendencias.filter(p => p.etapa === etapa)
  const dataLegivel = formatarBR(`${diaEscolhido}T12:00:00-03:00`, 'data')

  /*
   * As leituras DO DIA ESCOLHIDO, não as últimas do evento.
   *
   * O feed veio da tela do evento, onde mostrava as vinte últimas de qualquer
   * dia. Aqui ele precisa acompanhar o seletor de dia no topo: quem está
   * conferindo a terça-feira não quer ver as batidas de hoje misturadas —
   * ficaria impossível cruzar o feed com a lista de pendências ao lado.
   */
  const { data: atividade } = await supabaseAdmin
    .from('registros')
    .select('funcionario_id, tipo, created_at, funcionarios!inner(nome, empresa, fornecedor_id, fornecedores(nome))')
    .eq('evento_id', eventoId)
    .eq('data_ref', diaEscolhido)
    .order('created_at', { ascending: false })
    .limit(40)

  // Supervisor vê só a própria equipe, aqui como em todo o resto do sistema.
  const atividadeVisivel = setorDoSupervisor
    ? (atividade ?? []).filter(r =>
        (r.funcionarios as unknown as { fornecedor_id?: string } | null)?.fornecedor_id === setorDoSupervisor)
    : (atividade ?? [])

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Pendências do evento"
        descricao={`${evento.nome} · ${dataLegivel}`}
        voltarPara={`/admin/eventos/${eventoId}`}
      />

      {/* Navegação por dia. Fica em cima porque a primeira coisa que se faz ao
          abrir esta tela é conferir se o dia é o certo. */}
      {dias.length > 1 && (
        <Secao
          tom="neutro"
          icone={<CalendarDays className="w-3.5 h-3.5" />}
          titulo="Dia da operação"
          corpoClassName="p-3 flex flex-wrap gap-1.5"
        >
          {/*
            * Ordem cronológica crescente, esquerda para direita — como um
            * calendário se lê.
            *
            * Estava ao contrário (`.reverse()`, o mais recente primeiro):
            * 09/09, 08/09, 07/09 … 28/08. Lido da esquerda pra direita isso
            * anda para TRÁS no tempo, o oposto do que qualquer tira de datas
            * costuma fazer. `dias` já vem crescente de `jornada_dias` — o
            * reverse sobrava.
            */}
          {dias.map(d => {
            const ativo = d === diaEscolhido
            const [, mes, dd] = d.split('-')
            return (
              <Link
                key={d}
                href={`/admin/eventos/${eventoId}/pendencias?dia=${d}`}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  ativo
                    ? 'bg-brand-500 border-brand-500 text-white'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
                }`}
              >
                {dd}/{mes}{d === hoje ? ' · hoje' : ''}
              </Link>
            )
          })}
        </Secao>
      )}

      {/*
        * O feed fica ANTES das listas de pendência, e não depois.
        *
        * As duas coisas se leem juntas: "quem já bateu" e "quem falta". Quem
        * abre esta tela no meio do evento olha o feed para saber se a operação
        * está andando, e só então desce para cobrar quem falta.
        */}
      <Secao
        tom="info"
        icone={<Activity className="w-3.5 h-3.5" />}
        titulo="Atividade do dia"
        descricao="Cada leitura de QR ou check-in por foto deste dia aparece aqui"
        corpoClassName={atividadeVisivel.length ? 'p-4 overflow-y-auto max-h-[22rem]' : ''}
      >
        <FeedDeAtividade registros={atividadeVisivel} />
      </Secao>

      {ETAPAS.map(({ etapa, titulo, explicacao, icone, tom }) => {
        const lista = porEtapa(etapa)
        return (
          <Secao
            key={etapa}
            tom={tom}
            icone={icone}
            titulo={titulo}
            descricao={explicacao}
            acoes={<Badge tom={lista.length ? 'negativo' : 'positivo'}>{lista.length}</Badge>}
            corpoClassName={lista.length ? '' : 'p-4'}
          >
            {!lista.length ? (
              <EmptyState
                icone={<CheckCircle2 className="w-7 h-7" />}
                titulo="Ninguém pendente"
                descricao={
                  etapa === 'entrada'
                    ? 'Todo mundo que estava previsto se credenciou neste dia.'
                    : 'Todo mundo que entrou cumpriu esta etapa neste dia.'
                }
              />
            ) : (
              <TabelaPendencias lista={lista} mostrarSetor={!setorDoSupervisor} />
            )}
          </Secao>
        )
      })}
    </div>
  )
}

/**
 * Uma linha por pessoa, com o que a operação precisa para ir atrás dela.
 *
 * "Realizado" é o horário da etapa que ANCORA a pendência — a entrada de quem
 * não fez o meio ou a saída. Na pendência de entrada não há nada realizado, e
 * a coluna mostra isso em vez de fingir um traço genérico.
 */
function TabelaPendencias({ lista, mostrarSetor }: { lista: Pendencia[]; mostrarSetor: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="tabela">
        <thead>
          <tr>
            <th>Funcionário</th>
            <th>CPF</th>
            {mostrarSetor && <th>Setor</th>}
            <th>Pendência</th>
            <th>Esperado</th>
            <th>Entrada registrada</th>
          </tr>
        </thead>
        <tbody>
          {lista.map(p => (
            <tr key={`${p.funcionarioId}:${p.etapa}`}>
              <td className="font-medium text-slate-800">{p.nome}</td>
              <td className="text-slate-500 tabular-nums">{formatCpf(p.cpf)}</td>
              {mostrarSetor && <td className="text-slate-500">{p.setorNome}</td>}
              <td className="text-slate-500">{ROTULO_PENDENCIA[p.etapa]}</td>
              <td className="text-slate-500 tabular-nums">
                {p.esperadoEm ? formatarBR(p.esperadoEm, 'hora') : <span className="text-slate-400">livre</span>}
              </td>
              <td className="text-slate-500 tabular-nums">
                {p.realizadoEm ? formatarBR(p.realizadoEm, 'hora') : <span className="text-slate-400">não entrou</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
