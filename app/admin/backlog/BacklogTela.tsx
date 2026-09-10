'use client'
import { useState, useTransition, useMemo } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  Plus, KanbanSquare, CalendarDays, BellRing, List, Building2, CheckSquare,
  AlertTriangle, X, Search, Handshake, Target, Send, ClipboardList, Flame, Clock,
} from 'lucide-react'
import { moverItemBacklog } from '@/lib/actions-backlog'
import type { ItemBacklog, Compromisso, Cobranca, ResumoBacklog } from '@/lib/backlog'
import { COLUNAS, PRIORIDADES, ORIGENS_LEAD, type TipoItem } from '@/lib/backlog-constantes'
import StatCard from '@/components/StatCard'
import SeletorLista from '@/components/SeletorLista'
import { Secao, EmptyState } from '@/components/ui/Superficie'
import Quadro from './Quadro'
import CartaoItem, { diaLongo } from './CartaoItem'
import FormularioItem, { type Opcoes } from './FormularioItem'
import PainelDoItem from './PainelDoItem'
import Calendario, { type Escala } from './Calendario'
import type { Visao } from './page'

const VISOES: { valor: Visao; rotulo: string; Icone: React.ElementType }[] = [
  { valor: 'quadro', rotulo: 'Quadro', Icone: KanbanSquare },
  { valor: 'agenda', rotulo: 'Calendário', Icone: CalendarDays },
  { valor: 'contatos', rotulo: 'Precisa de atenção', Icone: BellRing },
  { valor: 'lista', rotulo: 'Lista', Icone: List },
]

/**
 * O orquestrador do Backlog: os filtros na URL, a troca de leitura, e os dois
 * modais (formulário e painel do item) que TODAS as leituras compartilham.
 *
 * Um componente só porque abrir um card precisa funcionar igual vindo do
 * quadro, da agenda ou da lista de cobranças — se cada leitura tivesse o seu
 * painel, seriam três painéis pra manter em sincronia com a mesma ação.
 */
export default function BacklogTela({
  itens, opcoes, ver, tipo, numeros, fila, compromissos, escala, ancora, hoje, meuId,
}: {
  itens: ItemBacklog[]
  opcoes: Opcoes
  ver: Visao
  tipo: TipoItem
  numeros: ResumoBacklog
  fila: { atrasados: Cobranca[]; hoje: Cobranca[]; proximos: Cobranca[] }
  compromissos: Compromisso[]
  escala: Escala
  ancora: string
  hoje: string
  meuId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [criando, setCriando] = useState(false)
  const [aberto, setAberto] = useState<ItemBacklog | null>(null)
  const [editando, setEditando] = useState<ItemBacklog | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // O quadro anda antes do servidor confirmar (ver o cabeçalho de Quadro.tsx).
  const [movidos, setMovidos] = useState<Record<string, string>>({})
  const [, startTransition] = useTransition()

  const comMovimento = useMemo(
    () => itens.map(i => (movidos[i.id] ? { ...i, status: movidos[i.id] } : i)),
    [itens, movidos],
  )

  const url = (mudancas: Record<string, string | null>) => {
    const novo = new URLSearchParams(params.toString())
    for (const [chave, valor] of Object.entries(mudancas)) {
      if (valor) novo.set(chave, valor)
      else novo.delete(chave)
    }
    return `${pathname}?${novo.toString()}`
  }
  const trocar = (chave: string, valor: string | null) => router.push(url({ [chave]: valor }))

  const mover = (item: ItemBacklog, status: string) => {
    setErro(null)
    setMovidos(atual => ({ ...atual, [item.id]: status }))
    startTransition(async () => {
      const r = await moverItemBacklog(item.id, status)
      if (!r.ok) {
        // Desfaz: o card volta pra coluna de origem e a pessoa vê o porquê.
        setMovidos(atual => {
          const copia = { ...atual }
          delete copia[item.id]
          return copia
        })
        setErro(r.erro)
        return
      }
      router.refresh()
    })
  }

  const abrirPorId = (id: string) => {
    const alvo = comMovimento.find(i => i.id === id)
    if (alvo) setAberto(alvo)
  }

  const meus = params.get('responsavel') === meuId
  const temFiltro = ['status', 'prioridade', 'responsavel', 'evento', 'origem', 'busca', 'encerrados']
    .some(c => params.get(c))

  return (
    <div className="space-y-5">
      {/* ── Números ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Precisa de atenção hoje" value={fila.atrasados.length + fila.hoje.length}
          sub={fila.atrasados.length ? `${fila.atrasados.length} atrasado${fila.atrasados.length === 1 ? '' : 's'}` : 'nada atrasado'}
          icon={BellRing} tom={fila.atrasados.length ? 'erro' : 'sucesso'}
          href={url({ ver: 'contatos' })}
        />
        <StatCard
          label="Possíveis clientes" value={numeros.possiveisClientes}
          sub={`${numeros.emNegociacao} em negociação`}
          icon={Building2} tom="acento" href={url({ ver: 'quadro', tipo: 'cliente' })}
        />
        <StatCard
          label="Tarefas pendentes" value={numeros.tarefasPendentes}
          sub={numeros.tarefasAtrasadas ? `${numeros.tarefasAtrasadas} atrasada${numeros.tarefasAtrasadas === 1 ? '' : 's'}` : 'nenhuma atrasada'}
          icon={CheckSquare} tom={numeros.tarefasAtrasadas ? 'aviso' : 'info'}
          href={url({ ver: 'quadro', tipo: 'tarefa' })}
        />
        <StatCard
          label="Alta prioridade" value={numeros.altaPrioridade}
          sub="entre clientes e tarefas" icon={Flame} tom="aviso"
          href={url({ ver: 'lista', prioridade: 'alta' })}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Novos leads" value={numeros.novosLeads} icon={Target} tom="neutro" small />
        <StatCard label="Propostas enviadas" value={numeros.propostasEnviadas} icon={Send} tom="neutro" small />
        <StatCard label="Clientes convertidos" value={numeros.convertidos} icon={Handshake} tom="neutro" small />
        <StatCard label="Contatos para hoje" value={numeros.contatosHoje} icon={Clock} tom="neutro" small />
      </div>

      {/* ── Leituras + adicionar ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-1.5 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {VISOES.map(v => {
              const ativa = v.valor === ver
              return (
                <button
                  key={v.valor}
                  onClick={() => trocar('ver', v.valor)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    ativa ? 'bg-brand-500 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                  }`}
                >
                  <v.Icone className={`w-3.5 h-3.5 shrink-0 ${ativa ? 'text-white' : 'text-slate-400'}`} />
                  {v.rotulo}
                </button>
              )
            })}
          </div>
        </div>

        <button onClick={() => setCriando(true)} className="btn btn-primario">
          <Plus className="w-3.5 h-3.5 shrink-0" /> Adicionar ao Backlog
        </button>
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            defaultValue={params.get('busca') ?? ''}
            onKeyDown={e => { if (e.key === 'Enter') trocar('busca', (e.target as HTMLInputElement).value || null) }}
            onBlur={e => { if ((e.target.value || null) !== params.get('busca')) trocar('busca', e.target.value || null) }}
            placeholder="Buscar empresa, pessoa ou tarefa"
            className="input pl-8 w-auto min-w-[15rem] text-sm"
          />
        </div>

        <SeletorLista
          className="w-auto text-sm" valor={params.get('prioridade') ?? ''}
          onChange={v => trocar('prioridade', v || null)}
          placeholder="Prioridade: todas" titulo="Prioridade"
          opcoes={[{ valor: '', rotulo: 'Todas' }, ...PRIORIDADES.map(p => ({ valor: p.valor, rotulo: p.rotulo }))]}
        />
        <SeletorLista
          className="w-auto text-sm" valor={params.get('responsavel') ?? ''}
          onChange={v => trocar('responsavel', v || null)}
          placeholder="Responsável: todos" titulo="Responsável"
          busca={opcoes.responsaveis.length > 8}
          opcoes={[{ valor: '', rotulo: 'Todos' }, ...opcoes.responsaveis.map(r => ({ valor: r.id, rotulo: r.nome }))]}
        />
        <SeletorLista
          className="w-auto text-sm" valor={params.get('evento') ?? ''}
          onChange={v => trocar('evento', v || null)}
          placeholder="Evento: todos" titulo="Evento" busca
          opcoes={[{ valor: '', rotulo: 'Todos' }, ...opcoes.eventos.map(e => ({ valor: e.id, rotulo: e.nome }))]}
        />
        <SeletorLista
          className="w-auto text-sm" valor={params.get('status') ?? ''}
          onChange={v => trocar('status', v || null)}
          placeholder="Status: todos" titulo="Status"
          opcoes={[
            { valor: '', rotulo: 'Todos' },
            ...COLUNAS[tipo].map(c => ({ valor: c.valor, rotulo: c.rotulo })),
          ]}
        />
        <SeletorLista
          className="w-auto text-sm" valor={params.get('origem') ?? ''}
          onChange={v => trocar('origem', v || null)}
          placeholder="Origem: todas" titulo="Origem do lead"
          opcoes={[{ valor: '', rotulo: 'Todas' }, ...ORIGENS_LEAD.map(o => ({ valor: o, rotulo: o }))]}
        />

        <button
          onClick={() => trocar('responsavel', meus ? null : meuId)}
          className={`btn btn-sm ${meus ? 'btn-primario' : 'btn-secundario'}`}
        >
          Meus itens
        </button>
        <button
          onClick={() => trocar('encerrados', params.get('encerrados') === '1' ? null : '1')}
          className={`btn btn-sm ${params.get('encerrados') === '1' ? 'btn-primario' : 'btn-secundario'}`}
        >
          Mostrar encerrados
        </button>
        {temFiltro && (
          <button onClick={() => router.push(url({
            status: null, prioridade: null, responsavel: null, evento: null, origem: null, busca: null, encerrados: null,
          }))} className="btn btn-secundario btn-sm">
            <X className="w-3.5 h-3.5" /> Limpar
          </button>
        )}
      </div>

      {erro && (
        <p className="flex items-start gap-1.5 text-red-600 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}

      {/* ── A leitura escolhida ──────────────────────────────────────────── */}
      {ver === 'quadro' && (
        <div className="space-y-3">
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl shadow-sm p-1 w-max">
            {(['cliente', 'tarefa'] as TipoItem[]).map(t => (
              <button
                key={t}
                onClick={() => router.push(url({ tipo: t, status: null }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tipo === t ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {t === 'cliente' ? <Building2 className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />}
                {t === 'cliente' ? 'Possíveis clientes' : 'Tarefas'}
              </button>
            ))}
          </div>
          <Quadro
            tipo={tipo}
            itens={comMovimento.filter(i => i.tipo === tipo)}
            hoje={hoje}
            onAbrir={setAberto}
            onMover={mover}
          />
        </div>
      )}

      {ver === 'agenda' && (
        <Secao
          icone={<CalendarDays className="w-3.5 h-3.5" />}
          titulo="Calendário"
          descricao="Cada card é um item do Backlog com data — a cor vem da prioridade"
          corpoClassName="p-4"
        >
          <Calendario
            compromissos={compromissos}
            escala={escala}
            ancora={ancora}
            hoje={hoje}
            href={m => url({ ver: 'agenda', escala: m.escala ?? escala, dia: m.dia ?? ancora, mes: null })}
            onAbrirItem={abrirPorId}
          />
        </Secao>
      )}

      {ver === 'contatos' && (
        <div className="space-y-4">
          <ListaDeCobrancas
            titulo="Atrasados" descricao="Passou da data e ninguém encostou"
            tom="aviso" itens={fila.atrasados} onAbrir={setAberto}
            vazio="Nada atrasado. Bom sinal."
          />
          <ListaDeCobrancas
            titulo="Hoje" descricao="O que vence ou precisa de retorno hoje"
            tom="acento" itens={fila.hoje} onAbrir={setAberto}
            vazio="Nada marcado pra hoje."
          />
          <ListaDeCobrancas
            titulo="Em breve" descricao="Os próximos, na ordem em que chegam"
            tom="neutro" itens={fila.proximos.slice(0, 20)} onAbrir={setAberto}
            vazio="Nenhuma data marcada daqui pra frente."
          />
        </div>
      )}

      {ver === 'lista' && (
        <Secao
          icone={<ClipboardList className="w-3.5 h-3.5" />}
          titulo="Todos os itens"
          descricao={`${comMovimento.length} ${comMovimento.length === 1 ? 'item' : 'itens'} no recorte atual`}
          corpoClassName="p-4"
        >
          {!comMovimento.length ? (
            <EmptyState
              icone={<KanbanSquare className="w-7 h-7" />}
              titulo="Nada por aqui"
              descricao={temFiltro ? 'Nenhum item casa com os filtros escolhidos.' : 'Comece adicionando um possível cliente ou uma tarefa.'}
            />
          ) : (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {comMovimento.map(item => (
                <CartaoItem key={item.id} item={item} hoje={hoje} onAbrir={() => setAberto(item)} />
              ))}
            </div>
          )}
        </Secao>
      )}

      {/* ── Modais ───────────────────────────────────────────────────────── */}
      {criando && (
        <FormularioItem tipoInicial={tipo} opcoes={opcoes} onFechar={() => setCriando(false)} />
      )}
      {editando && (
        <FormularioItem item={editando} opcoes={opcoes} onFechar={() => setEditando(null)} />
      )}
      {aberto && !editando && (
        <PainelDoItem
          item={comMovimento.find(i => i.id === aberto.id) ?? aberto}
          opcoes={opcoes}
          onFechar={() => setAberto(null)}
          onEditar={() => setEditando(comMovimento.find(i => i.id === aberto.id) ?? aberto)}
        />
      )}
    </div>
  )
}

function ListaDeCobrancas({
  titulo, descricao, tom, itens, onAbrir, vazio,
}: {
  titulo: string
  descricao: string
  tom: 'aviso' | 'acento' | 'neutro'
  itens: Cobranca[]
  onAbrir: (item: ItemBacklog) => void
  vazio: string
}) {
  return (
    <Secao
      tom={tom} icone={<BellRing className="w-3.5 h-3.5" />}
      titulo={`${titulo} (${itens.length})`} descricao={descricao}
      corpoClassName="p-4"
    >
      {!itens.length ? (
        <p className="text-slate-400 text-sm py-3">{vazio}</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {itens.map(({ item, data, diasDeAtraso }) => (
            <li key={item.id}>
              <button onClick={() => onAbrir(item)} className="w-full text-left flex items-center gap-3 py-2.5 hover:bg-slate-50 transition-colors px-1 -mx-1 rounded-lg">
                <span className="text-slate-500 text-xs tabular-nums w-20 shrink-0">{diaLongo(data)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-slate-800 text-sm font-medium truncate">{item.titulo}</span>
                  <span className="block text-slate-400 text-2xs truncate">
                    {item.tipo === 'cliente'
                      ? (item.contatoNome ? `Retornar para ${item.contatoNome}` : 'Retornar contato')
                      : (item.descricao ?? 'Tarefa')}
                    {item.responsavelNome ? ` · ${item.responsavelNome}` : ''}
                  </span>
                </span>
                <span className={`text-2xs font-semibold shrink-0 ${
                  diasDeAtraso > 0 ? 'text-red-600' : diasDeAtraso === 0 ? 'text-amber-700' : 'text-slate-400'
                }`}>
                  {diasDeAtraso > 0
                    ? `${diasDeAtraso} dia${diasDeAtraso === 1 ? '' : 's'} atrasado`
                    : diasDeAtraso === 0 ? 'hoje' : `em ${-diasDeAtraso} dia${diasDeAtraso === -1 ? '' : 's'}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  )
}
