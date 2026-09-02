import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Activity, LogIn, Camera, LogOut, Clock, UserX, CameraOff, LogOut as SaidaX, UserCheck, AlertTriangle } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { veTodosEventos, podeAcompanhar } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { diaBRT } from '@/lib/janelas'
import { VISOES, ehVisao, linhasDaVisao, numerosDoDia, type Visao } from '@/lib/presenca-visoes'
import StatCard from '@/components/StatCard'
import SeletorDeDia from '@/components/SeletorDeDia'
import { Secao, PageHeader, EmptyState } from '@/components/ui/Superficie'
import TabelaPresenca from '../eventos/[id]/presenca/TabelaPresenca'

export const revalidate = 0

/**
 * Atividades do evento — a mesma tela de "Pendências e atividade", entrando
 * pelo menu em vez de por dentro do evento.
 *
 * As sete visões, as linhas e os números vêm de `lib/presenca-visoes.ts`,
 * compartilhados com `/admin/eventos/[id]/presenca`. Antes esta tela tinha a
 * sua própria linha do tempo e os seus próprios números, calculados de outro
 * jeito — e por isso dizia coisas diferentes da tela de Presença sobre o
 * mesmo dia. Uma régua só, agora.
 *
 * ── Os números ──
 *
 * "Ainda não chegaram" saiu dos cartões: ele contava a equipe inteira menos
 * quem tinha batido, então num dia de montagem mostrava "587 não chegaram"
 * de 679 pessoas que nem estavam escaladas pra aquele dia — um número grande,
 * assustador e inútil. No lugar entrou "Pendências", que vem de
 * `pendenciasDoDia`: só quem JÁ passou da hora, que é o que dá pra cobrar.
 *
 * "Batidas hoje" também saiu: era a soma de presentes + já saíram, ou seja,
 * um cartão que não dizia nada que os outros já não dissessem.
 *
 * ── Escopo ──
 *
 * Master vê todos os eventos, admin só os da própria organização, supervisor
 * só o evento do próprio setor (e, dentro dele, só a própria equipe).
 */

const ICONE: Record<Visao, React.ElementType> = {
  entrada: LogIn, meio: Camera, fim: LogOut,
  presentes: Clock, faltam: UserX, sem_meio: CameraOff, sem_saida: SaidaX,
}

/**
 * Rótulo de uma opção do seletor. Inclui a data porque um produtor repete o
 * nome do evento todo ano ("Bloco do Bero"), e a organização porque o master
 * vê eventos de clientes diferentes na mesma lista.
 */
function rotuloEvento(e: { nome: string; ativo: boolean; data_inicio: string; organizacoes?: unknown }) {
  // O join do Supabase tipa a relação como array; em runtime vem objeto quando
  // é 1:1. Aceita os dois em vez de confiar num só.
  const rel = e.organizacoes as { nome: string } | { nome: string }[] | null
  const org = Array.isArray(rel) ? rel[0]?.nome : rel?.nome
  return [
    e.nome,
    e.data_inicio ? `· ${formatarBR(e.data_inicio, 'data')}` : null,
    org ? `· ${org}` : null,
    e.ativo ? null : '· encerrado',
  ].filter(Boolean).join(' ')
}

export default async function AtividadesPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string; ver?: string; dia?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeAcompanhar(perfil.role)) redirect('/admin')

  const { evento: eventoParam, ver, dia: diaParam } = await searchParams
  const visao: Visao = ehVisao(ver) ? ver : 'entrada'
  const Icone = ICONE[visao]

  // ─── Escopo ───────────────────────────────────────────────────────────────
  let setorDoSupervisor: string | null = null
  const listaQuery = supabaseAdmin
    .from('eventos')
    .select('id, nome, ativo, data_inicio, organizacoes(nome)')
    .order('data_inicio', { ascending: false })

  if (perfil.role === 'supervisor') {
    if (!perfil.fornecedor_id) redirect('/admin')
    const { data: setor } = await supabaseAdmin
      .from('fornecedores').select('id, evento_id').eq('id', perfil.fornecedor_id).single()
    if (!setor) redirect('/admin')
    setorDoSupervisor = setor.id
    listaQuery.eq('id', setor.evento_id)
  } else if (!veTodosEventos(perfil.role)) {
    listaQuery.eq('organizacao_id', perfil.organizacao_id)
  }

  const { data: eventos } = await listaQuery
  if (!eventos?.length) {
    return (
      <div className="space-y-5">
        <PageHeader titulo="Atividades do evento" descricao="Quem já registrou cada etapa, e quem ainda não" />
        <Secao titulo="Nenhum evento">
          <EmptyState
            icone={<Activity className="w-7 h-7" />}
            titulo="Não há evento para acompanhar"
            descricao="Crie um evento no Painel para começar a registrar presenças."
          />
        </Secao>
      </div>
    )
  }

  /*
   * A lista acima já é filtrada pelo escopo, e é dela que sai o evento
   * escolhido — então um id de outro cliente colado na URL simplesmente não
   * é encontrado e cai no evento ativo. A régua não depende do `<select>`.
   */
  const escolhido = eventos.find(e => e.id === eventoParam) ?? eventos.find(e => e.ativo) ?? eventos[0]

  // ─── O dia ────────────────────────────────────────────────────────────────
  const { data: dias } = await supabaseAdmin
    .from('jornada_dias').select('data')
    .eq('evento_id', escolhido.id).eq('cancelado', false).order('data')
  const diasDaOperacao = (dias ?? []).map(d => d.data as string)
  const hoje = diaBRT()
  const diaEscolhido =
    (diaParam && diasDaOperacao.includes(diaParam) ? diaParam : null)
    ?? (diasDaOperacao.includes(hoje) ? hoje : null)
    ?? [...diasDaOperacao].reverse().find(d => d <= hoje)
    ?? diasDaOperacao[0]
    ?? hoje

  const [{ linhas, colunaHora }, numeros] = await Promise.all([
    linhasDaVisao({ eventoId: escolhido.id, visao, dia: diaEscolhido, fornecedorId: setorDoSupervisor }),
    numerosDoDia({ eventoId: escolhido.id, dia: diaEscolhido, fornecedorId: setorDoSupervisor }),
  ])

  const rotuloDia = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }
  const url = (v: Visao, d: string) => `/admin/atividades?evento=${escolhido.id}&ver=${v}&dia=${d}`

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Atividades do evento"
        descricao={`${escolhido.nome} · ${rotuloDia(diaEscolhido)}${diaEscolhido === hoje ? ' (hoje)' : ''}`}
        acoes={
          eventos.length > 1 ? (
            /* Sem JS: um <select> dentro de form GET troca de evento. Esta tela
               é aberta no celular no meio do evento — não vale carregar um
               componente cliente só pra um seletor. */
            <form className="flex items-center gap-2">
              <label htmlFor="evento" className="text-slate-500 text-xs">Evento</label>
              <select id="evento" name="evento" defaultValue={escolhido.id} className="input w-auto">
                {eventos.map(e => (
                  <option key={e.id} value={e.id}>{rotuloEvento(e)}</option>
                ))}
              </select>
              <button type="submit" className="btn btn-secundario">Ver</button>
            </form>
          ) : undefined
        }
      />

      {/*
        * Cada cartão leva à lista que ele conta — o número sozinho nunca é a
        * pergunta final, a seguinte é sempre "quem?".
        */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Presentes agora" value={numeros.presentes} icon={UserCheck} tom="sucesso" href={url('presentes', diaEscolhido)} />
        <StatCard label="Entradas no dia" value={numeros.entradas} icon={LogIn} tom="acento" href={url('entrada', diaEscolhido)} />
        <StatCard label="Saídas no dia" value={numeros.saidas} icon={LogOut} tom="info" href={url('fim', diaEscolhido)} />
        <StatCard
          label="Pendências" value={numeros.pendencias} icon={AlertTriangle} tom="aviso"
          sub="já passou da hora" href={url('faltam', diaEscolhido)}
        />
      </div>

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
        <SeletorDeDia
          dias={diasDaOperacao} diaEscolhido={diaEscolhido} hoje={hoje}
          hrefBase={`/admin/atividades?evento=${escolhido.id}&ver=${visao}`}
        />
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
