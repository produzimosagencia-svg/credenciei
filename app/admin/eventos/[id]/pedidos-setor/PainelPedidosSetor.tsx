'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, X, Phone, Save, ExternalLink } from 'lucide-react'
import { aprovarItemDoPedido, negarItensDoPedido, salvarItemDoPedido, type DadosDoSetor } from '@/lib/actions-pedidos-setor'
import type { PedidoCompleto, ItemDoPedido } from '@/lib/pedidos-setor-consulta'
import { descreverDias, statusDoPedido } from '@/lib/pedido-setor-regras'
import type { DiaDaEscala } from '@/lib/escala-regras'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Badge, EmptyState } from '@/components/ui/Superficie'
import { CpfInput, TelefoneInput, NomeInput, NomeMaiusculoInput } from '@/components/inputs'
import SeletorLista from '@/components/SeletorLista'
import DiasComQuantidade from '@/components/DiasComQuantidade'

type Edicao = {
  nome: string
  subeventoId: string
  quantidade: string
  dias: Record<string, string>
  supervisor: { nome: string; cpf: string; telefone: string }
}
type Retorno = { tipo: 'ok' | 'erro'; texto: string }

const daEdicao = (e: Edicao): DadosDoSetor => ({
  nome: e.nome,
  subeventoId: e.subeventoId || null,
  quantidade: e.quantidade,
  porDia: Object.fromEntries(Object.entries(e.dias).filter(([, q]) => q.trim() !== '')),
  supervisor: e.supervisor,
})

const edicaoInicial = (i: ItemDoPedido): Edicao => ({
  nome: i.nome,
  subeventoId: i.subeventoId ?? '',
  quantidade: i.quantidade ? String(i.quantidade) : '',
  dias: Object.fromEntries(Object.entries(i.porDia).map(([d, n]) => [d, String(n)])),
  supervisor: { ...i.supervisor },
})

/**
 * A fila de pedidos de setor de um evento. Cada setor pendente é editável (nome, subevento, quantidades,
 * dias, supervisor) e decidido sozinho: aprova, salva, ou nega com motivo. Um pedido pode ter vários setores
 * e ser aprovado em parte.
 */
export default function PainelPedidosSetor({
  eventoId, pedidos, dias, subeventos,
}: {
  eventoId: string
  pedidos: PedidoCompleto[]
  /** TODOS os dias do evento (vazio = o evento não pede quantidade por dia). */
  dias: DiaDaEscala[]
  subeventos: { id: string; nome: string }[]
}) {
  const [aba, setAba] = useState<'aguardando' | 'decididos'>('aguardando')
  const aguardando = pedidos.filter(p => p.itens.some(i => i.status === 'pendente'))
  const decididos = pedidos.filter(p => !p.itens.some(i => i.status === 'pendente'))
  const lista = aba === 'aguardando' ? aguardando : decididos

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-slate-200">
        <Aba ativa={aba === 'aguardando'} onClick={() => setAba('aguardando')} rotulo="Aguardando" contagem={aguardando.length} tom="amber" />
        <Aba ativa={aba === 'decididos'} onClick={() => setAba('decididos')} rotulo="Decididos" contagem={decididos.length} tom="slate" />
      </div>

      {!lista.length ? (
        <EmptyState
          titulo={aba === 'aguardando' ? 'Nenhum pedido aguardando' : 'Nenhum pedido decidido ainda'}
          descricao={aba === 'aguardando' ? 'Quando um fornecedor enviar um pedido pelo link, ele aparece aqui.' : 'Os pedidos aprovados e negados ficam nesta aba.'}
        />
      ) : (
        lista.map(p => <PedidoCard key={p.id} eventoId={eventoId} pedido={p} dias={dias} subeventos={subeventos} />)
      )}
    </div>
  )
}

function Aba({ ativa, onClick, rotulo, contagem, tom }: { ativa: boolean; onClick: () => void; rotulo: string; contagem: number; tom: 'amber' | 'slate' }) {
  return (
    <button type="button" onClick={onClick} className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${ativa ? 'border-brand-500 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
      {rotulo}
      <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${tom === 'amber' && contagem ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{contagem}</span>
    </button>
  )
}

function PedidoCard({ eventoId, pedido, dias, subeventos }: { eventoId: string; pedido: PedidoCompleto; dias: DiaDaEscala[]; subeventos: { id: string; nome: string }[] }) {
  const router = useRouter()
  const pendentes = pedido.itens.filter(i => i.status === 'pendente')
  const status = statusDoPedido(pedido.itens)
  const [edicoes, setEdicoes] = useState<Record<string, Edicao>>(() => Object.fromEntries(pendentes.map(i => [i.id, edicaoInicial(i)])))
  const [retornos, setRetornos] = useState<Record<string, Retorno>>({})
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [negando, setNegando] = useState<string | null>(null) // id do setor, ou 'todos'
  const [motivo, setMotivo] = useState('')

  const retorno = (id: string, r: Retorno | null) => setRetornos(m => { const n = { ...m }; if (r) n[id] = r; else delete n[id]; return n })
  const mudar = (id: string, parte: Partial<Edicao>) => setEdicoes(m => ({ ...m, [id]: { ...m[id], ...parte } }))

  const aprovar = async (id: string) => {
    retorno(id, null)
    const r = await aprovarItemDoPedido(id, daEdicao(edicoes[id]))
    if ('erro' in r) { retorno(id, { tipo: 'erro', texto: r.erro }); return false }
    return true
  }

  const aprovarUm = async (id: string) => {
    setOcupado(id)
    const ok = await aprovar(id)
    setOcupado(null)
    if (ok) router.refresh()
  }

  const aprovarTodos = async () => {
    setOcupado('todos')
    let algum = false
    for (const i of pendentes) { if (await aprovar(i.id)) algum = true }
    setOcupado(null)
    if (algum) router.refresh()
  }

  const salvar = async (id: string) => {
    setOcupado(id)
    retorno(id, null)
    const r = await salvarItemDoPedido(id, daEdicao(edicoes[id]))
    setOcupado(null)
    retorno(id, 'erro' in r ? { tipo: 'erro', texto: r.erro } : { tipo: 'ok', texto: 'Alterações salvas.' })
  }

  const negar = async () => {
    const ids = negando === 'todos' ? pendentes.map(i => i.id) : negando ? [negando] : []
    if (!ids.length) return
    setOcupado(negando)
    const r = await negarItensDoPedido(ids, motivo)
    setOcupado(null)
    if ('erro' in r) { retorno(negando ?? 'todos', { tipo: 'erro', texto: r.erro }); return }
    setNegando(null)
    setMotivo('')
    router.refresh()
  }

  return (
    <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-slate-800 font-bold text-sm">{pedido.contato.nome}</p>
          <p className="text-slate-500 text-xs mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{formatarBR(pedido.criadoEm, 'completo')}</span>
            <span>CPF {formatCpf(pedido.contato.cpf)}</span>
            <a href={`https://wa.me/55${pedido.contato.telefone}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
              <Phone className="w-3 h-3" /> {pedido.contato.telefone}
            </a>
          </p>
          {pedido.observacao && <p className="text-slate-600 text-xs mt-1.5 italic">“{pedido.observacao}”</p>}
        </div>
        <div className="flex items-center gap-2">
          <Badge tom={status === 'aprovado' ? 'positivo' : status === 'negado' ? 'negativo' : status === 'parcial' ? 'marca' : 'atencao'}>
            {status === 'aprovado' ? 'Aprovado' : status === 'negado' ? 'Negado' : status === 'parcial' ? 'Aprovado em parte' : 'Aguardando'}
          </Badge>
        </div>
      </header>

      <div className="divide-y divide-slate-100">
        {pedido.itens.map(i => i.status === 'pendente' ? (
          <ItemEditavel
            key={i.id} item={i} edicao={edicoes[i.id] ?? edicaoInicial(i)} dias={dias} subeventos={subeventos}
            ocupado={ocupado === i.id || ocupado === 'todos'} retorno={retornos[i.id]}
            onMudar={parte => mudar(i.id, parte)}
            onAprovar={() => aprovarUm(i.id)} onSalvar={() => salvar(i.id)}
            onNegar={() => { setNegando(i.id); setMotivo('') }}
          />
        ) : (
          <ItemDecidido key={i.id} item={i} eventoId={eventoId} />
        ))}
      </div>

      {pendentes.length > 1 && (
        <footer className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center gap-2">
          <button type="button" onClick={aprovarTodos} disabled={!!ocupado} className="btn btn-primario btn-sm">
            <Check className="w-3.5 h-3.5" /> {ocupado === 'todos' ? 'Aprovando…' : `Aprovar os ${pendentes.length} pendentes`}
          </button>
          <button type="button" onClick={() => { setNegando('todos'); setMotivo('') }} disabled={!!ocupado} className="btn btn-secundario btn-sm">
            <X className="w-3.5 h-3.5" /> Negar os {pendentes.length} pendentes
          </button>
          {retornos.todos && <span className="text-red-500 text-xs">{retornos.todos.texto}</span>}
        </footer>
      )}

      {negando && (
        <div className="px-4 py-3 border-t border-red-200 bg-red-50 space-y-2">
          <p className="text-red-800 text-sm font-semibold">
            {negando === 'todos' ? `Negar os ${pendentes.length} setores pendentes` : `Negar “${pendentes.find(i => i.id === negando)?.nome ?? ''}”`}
          </p>
          <p className="text-red-700 text-xs">O supervisor recebe uma mensagem no WhatsApp com este motivo, e também o vê na página de acompanhamento.</p>
          <textarea
            rows={2} maxLength={300} autoFocus value={motivo} onChange={e => setMotivo(e.target.value)}
            className="input" placeholder="Motivo da reprovação (obrigatório)"
          />
          {retornos[negando] && <p className="text-red-600 text-xs">{retornos[negando].texto}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={negar} disabled={!!ocupado || motivo.trim().length < 3} className="btn btn-perigo btn-sm">
              {ocupado === negando ? 'Negando…' : 'Confirmar reprovação'}
            </button>
            <button type="button" onClick={() => setNegando(null)} disabled={!!ocupado} className="btn btn-secundario btn-sm">Cancelar</button>
          </div>
        </div>
      )}
    </section>
  )
}

function ItemEditavel({
  item, edicao, dias, subeventos, ocupado, retorno, onMudar, onAprovar, onSalvar, onNegar,
}: {
  item: ItemDoPedido; edicao: Edicao; dias: DiaDaEscala[]; subeventos: { id: string; nome: string }[]
  ocupado: boolean; retorno?: Retorno
  onMudar: (parte: Partial<Edicao>) => void; onAprovar: () => void; onSalvar: () => void; onNegar: () => void
}) {
  const original = item.original
  const mudouQuantidade = original?.quantidade != null && String(original.quantidade) !== edicao.quantidade
  return (
    <div className="p-4 space-y-3">
      <p className="text-slate-500 text-xs">
        Pedido original: <strong className="text-slate-700">{original?.nome ?? item.nome}</strong> — {original?.quantidade ?? item.quantidade ?? '?'} pessoas
        {descreverDias(original?.porDia ?? item.porDia) && <> ({descreverDias(original?.porDia ?? item.porDia)})</>}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Campo rotulo="Nome do setor">
          <NomeMaiusculoInput className="input" defaultValue={edicao.nome} onValueChange={nome => onMudar({ nome })} />
        </Campo>
        {subeventos.length > 0 && (
          <Campo rotulo="Subevento">
            <SeletorLista
              valor={edicao.subeventoId}
              onChange={v => onMudar({ subeventoId: v })}
              placeholder="Escolha o subevento…"
              titulo="Em qual subevento?"
              opcoes={subeventos.map(x => ({ valor: x.id, rotulo: x.nome.toLocaleUpperCase('pt-BR') }))}
            />
          </Campo>
        )}
        <Campo rotulo={`Quantidade de colaboradores${mudouQuantidade ? ' (alterada)' : ''}`}>
          <input type="number" inputMode="numeric" min={1} className="input tabular-nums" value={edicao.quantidade} onChange={e => onMudar({ quantidade: e.target.value })} />
        </Campo>
      </div>

      {dias.length > 0 && (
        <Campo rotulo="Dias de trabalho e pessoas por dia">
          <DiasComQuantidade
            dias={dias}
            valores={edicao.dias}
            sugestao={edicao.quantidade}
            onChange={valores => onMudar({ dias: valores })}
          />
        </Campo>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Campo rotulo="Supervisor">
          <NomeInput className="input" defaultValue={edicao.supervisor.nome} onValueChange={nome => onMudar({ supervisor: { ...edicao.supervisor, nome } })} />
        </Campo>
        <Campo rotulo="CPF">
          <CpfInput className="input" defaultValue={edicao.supervisor.cpf} onValueChange={cpf => onMudar({ supervisor: { ...edicao.supervisor, cpf } })} />
        </Campo>
        <Campo rotulo="WhatsApp">
          <TelefoneInput className="input" defaultValue={edicao.supervisor.telefone} onValueChange={telefone => onMudar({ supervisor: { ...edicao.supervisor, telefone } })} />
        </Campo>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onAprovar} disabled={ocupado} className="btn btn-primario btn-sm">
          <Check className="w-3.5 h-3.5" /> {ocupado ? 'Aguarde…' : 'Aprovar'}
        </button>
        <button type="button" onClick={onSalvar} disabled={ocupado} className="btn btn-secundario btn-sm">
          <Save className="w-3.5 h-3.5" /> Salvar alterações
        </button>
        <button type="button" onClick={onNegar} disabled={ocupado} className="btn btn-secundario btn-sm text-red-600">
          <X className="w-3.5 h-3.5" /> Negar
        </button>
        {retorno && <span className={`text-xs ${retorno.tipo === 'erro' ? 'text-red-600' : 'text-green-700'}`}>{retorno.texto}</span>}
      </div>
    </div>
  )
}

function ItemDecidido({ item, eventoId }: { item: ItemDoPedido; eventoId: string }) {
  const aprovado = item.status === 'aprovado'
  const original = item.original
  const mudou = aprovado && original?.quantidade != null && original.quantidade !== item.quantidade
  return (
    <div className="px-4 py-3 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-slate-800 text-sm font-semibold break-words">
          {item.nome}
          {item.subeventoNome && <span className="text-slate-500 font-normal"> · {item.subeventoNome}</span>}
        </p>
        <p className="text-slate-600 text-xs mt-0.5">
          {aprovado ? 'Aprovado' : 'Negado'}: {item.quantidade ?? '?'} pessoas{descreverDias(item.porDia) && <> ({descreverDias(item.porDia)})</>}
          {mudou && <span className="text-amber-700"> — pediu {original?.quantidade}</span>}
        </p>
        {!aprovado && item.motivoNegacao && <p className="text-red-700 text-xs mt-0.5">Motivo: {item.motivoNegacao}</p>}
        <p className="text-slate-400 text-2xs mt-0.5">
          {item.decididoPor ?? 'Alguém'}{item.decididoEm ? ` · ${formatarBR(item.decididoEm, 'completo')}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Badge tom={aprovado ? 'positivo' : 'negativo'}>{aprovado ? 'Aprovado' : 'Negado'}</Badge>
        {aprovado && item.fornecedorId && (
          <Link href={`/admin/eventos/${eventoId}/fornecedor/${item.fornecedorId}`} className="text-brand-600 text-xs inline-flex items-center gap-1 hover:underline">
            Abrir setor <ExternalLink className="w-3 h-3" />
          </Link>
        )}
      </div>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-slate-600">{rotulo}</label>
      {children}
    </div>
  )
}
