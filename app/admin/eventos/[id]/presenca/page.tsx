import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, LogIn, Camera, LogOut, Clock, UserX, CameraOff, LogOut as SaidaX } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeAcompanhar } from '@/lib/permissions'
import { diaBRT } from '@/lib/janelas'
import { pendenciasDoDia } from '@/lib/pendencias'
import { PageHeader } from '@/components/ui/Superficie'
import SeletorDeDia from '@/components/SeletorDeDia'
import TabelaPresenca, { type LinhaPresenca } from './TabelaPresenca'

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
 * As duas telas — esta e a antiga "Pendências" — respondiam a mesma
 * pergunta ("quem fez, quem não fez") de dois jeitos diferentes o bastante
 * pra confundir qual confiar. Fundidas: as sete visões cobrem tanto "quem
 * fez" (entrada/meio/saída/presentes) quanto "quem não fez"
 * (sem_entrada/sem_meio/sem_saída) — as três últimas usando `pendenciasDoDia`,
 * a MESMA função que já manda a mensagem de cobrança no WhatsApp, pra nunca
 * existir uma pendência na tela e outra na mensagem.
 *
 * Sempre de UM DIA. Numa operação de onze dias, misturar os dias faz quem
 * trabalhou na montagem aparecer como presente no dia do show.
 */

type Etapa = 'entrada' | 'meio' | 'fim'

const VISOES = {
  entrada: { titulo: 'Registraram a entrada', icone: LogIn, tipo: 'feito' as const, etapa: 'entrada' as Etapa },
  meio: { titulo: 'Registraram o meio', icone: Camera, tipo: 'feito' as const, etapa: 'meio' as Etapa },
  fim: { titulo: 'Registraram a saída', icone: LogOut, tipo: 'feito' as const, etapa: 'fim' as Etapa },
  presentes: { titulo: 'Presentes agora', icone: Clock, tipo: 'presentes' as const },
  faltam: { titulo: 'Ainda não chegaram', icone: UserX, tipo: 'pendencia' as const, etapa: 'entrada' as Etapa },
  sem_meio: { titulo: 'Não fizeram o meio', icone: CameraOff, tipo: 'pendencia' as const, etapa: 'meio' as Etapa },
  sem_saida: { titulo: 'Não fizeram a saída', icone: SaidaX, tipo: 'pendencia' as const, etapa: 'fim' as Etapa },
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
  const config = VISOES[visao]
  const Icone = config.icone

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

  let linhas: LinhaPresenca[]
  let colunaHora: string

  if (config.tipo === 'pendencia') {
    /*
     * "Quem não fez" reaproveita `pendenciasDoDia` — a MESMA função que
     * decide quem entra na mensagem de cobrança do WhatsApp. Duas
     * implementações da mesma regra (uma pra tela, outra pra mensagem)
     * divergiriam no primeiro ajuste de horário, e essa era exatamente a
     * razão de existirem duas telas ("Pendências" e "Presença") dizendo
     * coisas diferentes sobre a mesma pessoa.
     */
    const pendencias = await pendenciasDoDia({
      eventoId, data: diaEscolhido, fornecedorId: setorDoSupervisor ?? undefined, etapas: [config.etapa],
    })
    linhas = pendencias
      .map(p => ({ id: p.funcionarioId, nome: p.nome, cpf: p.cpf, setor: p.setorNome, em: p.realizadoEm, manual: false }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    // Sem pendência de entrada não há "entrou às" pra mostrar — só nas outras duas.
    colunaHora = config.etapa === 'entrada' ? '' : 'Entrou às'
  } else {
    /*
     * A equipe inteira do evento, e não só quem bateu: "presentes" se define
     * por AUSÊNCIA de saída depois da entrada, então precisa da lista
     * completa pra cruzar.
     */
    let equipeQuery = supabase
      .from('funcionarios')
      .select('id, nome, cpf, ativo, fornecedor_id, fornecedores!inner(nome, evento_id)')
      .eq('fornecedores.evento_id', eventoId)
      .order('nome')
    if (setorDoSupervisor) equipeQuery = equipeQuery.eq('fornecedor_id', setorDoSupervisor)
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

    linhas = (equipe ?? [])
      .map((f): LinhaPresenca | null => {
        const feito = porPessoa.get(f.id) ?? {}
        const setor = (f.fornecedores as unknown as { nome: string } | null)?.nome ?? '—'
        const base = { id: f.id as string, nome: f.nome as string, cpf: f.cpf as string, setor }

        if (config.tipo === 'feito') {
          const r = feito[config.etapa]
          return r ? { ...base, em: r.em, manual: r.manual } : null
        }
        // presentes: entrou e ainda não saiu — a hora mostrada é a da
        // ENTRADA, que é o que responde "desde quando essa pessoa está aqui".
        return feito.entrada && !feito.fim ? { ...base, em: feito.entrada.em, manual: feito.entrada.manual } : null
      })
      .filter((l): l is LinhaPresenca => l !== null)
      .sort((a, b) => (a.em && b.em ? a.em.localeCompare(b.em) : a.nome.localeCompare(b.nome, 'pt-BR')))

    colunaHora = visao === 'presentes' ? 'Entrou às' : 'Registrou às'
  }

  const rotuloDia = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }
  const url = (v: Visao, d: string) => `/admin/eventos/${eventoId}/presenca?ver=${v}&dia=${d}`

  return (
    <div className="space-y-5">
      <PageHeader
        titulo={config.titulo}
        descricao={`${evento.nome} · ${rotuloDia(diaEscolhido)}${diaEscolhido === hoje ? ' (hoje)' : ''}`}
        acoes={
          <Link href={`/admin/eventos/${eventoId}`} className="btn btn-secundario btn-sm">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar ao evento
          </Link>
        }
      />

      {/* Trocar de visão sem voltar: as sete perguntas são lidas em sequência. */}
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
