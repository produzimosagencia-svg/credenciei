import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { LogIn, Camera, LogOut, CheckCircle2, CalendarDays } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { veTodosEventos, podeAcompanhar } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { formatCpf } from '@/lib/format'
import { diaBRT, periodoDoEvento, type EventoJanelas } from '@/lib/janelas'
import { pendenciasDoDia, ROTULO_PENDENCIA, type EtapaPendente, type Pendencia } from '@/lib/pendencias'
import { Secao, PageHeader, EmptyState, Badge } from '@/components/ui/Superficie'

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

  // Dias navegáveis: o período do evento, do mais recente para o mais antigo —
  // a pergunta quase sempre é sobre hoje ou ontem.
  const periodo = periodoDoEvento(evento as EventoJanelas)
  const hoje = diaBRT()
  const dias: string[] = []
  if (periodo) {
    for (let d = periodo.primeiro; d <= periodo.ultimo && dias.length < 60; ) {
      dias.push(d)
      const [a, m, dd] = d.split('-').map(Number)
      const prox = new Date(Date.UTC(a, m - 1, dd + 1, 12))
      d = prox.toISOString().slice(0, 10)
    }
  }
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
          {[...dias].reverse().map(d => {
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
