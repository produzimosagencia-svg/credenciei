import { redirect } from 'next/navigation'
import { KanbanSquare, Database } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { podeGerenciarBacklog } from '@/lib/permissions'
import {
  listarBacklog, opcoesDoBacklog, agendaDoBacklog, resumoBacklog, cobrancas, hojeBRT,
  type FiltroBacklog,
} from '@/lib/backlog'
import type { TipoItem } from '@/lib/backlog-constantes'
import { PageHeader, Secao } from '@/components/ui/Superficie'
import BacklogTela from './BacklogTela'

export const revalidate = 0

export type Visao = 'quadro' | 'agenda' | 'contatos' | 'lista'
const VISOES: Visao[] = ['quadro', 'agenda', 'contatos', 'lista']

/**
 * Backlog Operacional — o centro de controle comercial e operacional do
 * Credenciei: quem são os próximos clientes, quem espera retorno, o que está
 * atrasado, e o que cada evento ainda precisa.
 *
 * ─── POR QUE TUDO NUMA PÁGINA SÓ ─────────────────────────────────────────────
 *
 * Quadro, agenda, próximos contatos e lista são QUATRO LEITURAS DOS MESMOS
 * ITENS, não quatro telas. Buscar uma vez e trocar a leitura no cliente
 * significa que arrastar um card no quadro e depois abrir a agenda mostra a
 * mesma verdade, sem uma segunda ida ao banco que poderia discordar da
 * primeira. É a mesma decisão de `presenca-visoes.ts`: uma régua só.
 *
 * O escopo é a plataforma, não uma organização — ver `podeGerenciarBacklog`
 * em lib/permissions.ts e o cabeçalho de supabase/upgrade-backlog.sql.
 */
export default async function BacklogPage({
  searchParams,
}: {
  searchParams: Promise<{
    ver?: string; tipo?: string; status?: string; prioridade?: string
    responsavel?: string; evento?: string; origem?: string; busca?: string
    encerrados?: string; mes?: string
  }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarBacklog(perfil)) redirect('/admin')

  const p = await searchParams
  const ver: Visao = VISOES.includes(p.ver as Visao) ? (p.ver as Visao) : 'quadro'
  const tipo: TipoItem = p.tipo === 'tarefa' ? 'tarefa' : p.tipo === 'cliente' ? 'cliente' : 'cliente'

  /*
   * O filtro de tipo NÃO entra na busca: o quadro precisa de um tipo, mas a
   * agenda, os contatos e os números precisam dos dois. Buscar tudo e separar
   * na tela evita quatro consultas dizendo coisas diferentes — e a lista
   * inteira do Backlog é pequena por natureza (é o pipeline de uma agência,
   * não uma tabela de evento).
   */
  const filtro: FiltroBacklog = {
    status: p.status || undefined,
    prioridade: p.prioridade || undefined,
    responsavelId: p.responsavel || undefined,
    eventoId: p.evento || undefined,
    origem: p.origem || undefined,
    busca: p.busca || undefined,
    incluirEncerrados: p.encerrados === '1',
  }

  const hoje = hojeBRT()
  const mes = /^\d{4}-\d{2}$/.test(p.mes ?? '') ? p.mes! : hoje.slice(0, 7)
  const primeiroDia = `${mes}-01`
  const ultimoDia = ultimoDiaDoMes(mes)

  /*
   * A migração pode ainda não ter rodado — o SQL é aplicado pelo Juan, não
   * pelo deploy. Sem isto a tela responderia com um erro de servidor e a
   * mensagem real ficaria só no log; com isto ela diz o que fazer.
   */
  let itens
  try {
    itens = await listarBacklog(filtro)
  } catch (e) {
    return <BancoPendente detalhe={e instanceof Error ? e.message : String(e)} />
  }

  const opcoes = await opcoesDoBacklog()
  const compromissos = await agendaDoBacklog(itens, { de: primeiroDia, ate: ultimoDia })

  const numeros = resumoBacklog(itens, hoje)
  const fila = cobrancas(itens, hoje)

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Backlog Operacional"
        descricao="Possíveis clientes, negociações e tarefas internas — o que precisa de atenção"
        acoes={<span className="hidden sm:flex items-center gap-1.5 text-slate-400 text-xs">
          <KanbanSquare className="w-3.5 h-3.5" /> {itens.length} {itens.length === 1 ? 'item' : 'itens'}
        </span>}
      />

      <BacklogTela
        itens={itens}
        opcoes={opcoes}
        ver={ver}
        tipo={tipo}
        numeros={numeros}
        fila={fila}
        compromissos={compromissos}
        mes={mes}
        hoje={hoje}
        meuId={perfil.id as string}
      />
    </div>
  )
}

/**
 * A tela quando as tabelas do Backlog ainda não existem.
 *
 * Diz o arquivo exato a rodar em vez de "erro interno": quem abre isto é o
 * master, que é quem aplica a migração — esconder o motivo dele só faria a
 * pergunta voltar por WhatsApp.
 */
function BancoPendente({ detalhe }: { detalhe: string }) {
  return (
    <div className="space-y-5">
      <PageHeader titulo="Backlog Operacional" descricao="Falta um passo antes de usar" />
      <Secao tom="aviso" icone={<Database className="w-3.5 h-3.5" />} titulo="O banco ainda não tem as tabelas do Backlog" corpoClassName="p-5">
        <div className="space-y-3 text-sm text-slate-600">
          <p>
            Rode <code className="bg-slate-100 rounded px-1.5 py-0.5 text-slate-800">supabase/upgrade-backlog.sql</code>{' '}
            no SQL Editor do Supabase. Ele é aditivo e reversível: cria só as duas tabelas
            novas (<code className="bg-slate-100 rounded px-1 py-0.5">backlog_itens</code> e{' '}
            <code className="bg-slate-100 rounded px-1 py-0.5">backlog_historico</code>) e não
            encosta em nada que já existe.
          </p>
          <p className="text-slate-400 text-xs">Erro do banco: {detalhe}</p>
        </div>
      </Secao>
    </div>
  )
}

/** Último dia do mês `YYYY-MM`, sem depender de fuso (dia 0 do mês seguinte). */
function ultimoDiaDoMes(mes: string): string {
  const [ano, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(ano, m, 0))
  return d.toISOString().slice(0, 10)
}
