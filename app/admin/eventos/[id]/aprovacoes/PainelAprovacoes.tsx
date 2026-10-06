'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ClipboardCheck, Search, X } from 'lucide-react'
import { aprovarCredenciamentosEmLote } from '@/lib/actions'
import { formatCpf, formatTelefone } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Secao, EmptyState, Badge } from '@/components/ui/Superficie'
import SeletorLista from '@/components/SeletorLista'
import {
  ROTULO_STATUS_CREDENCIAMENTO, TOM_STATUS_CREDENCIAMENTO, STATUS_CREDENCIAMENTO,
  type StatusCredenciamento,
} from '@/lib/credenciamento-constantes'
import { listarDias, type DiaDaEscala, type StatusEscala } from '@/lib/escala-regras'
import AcoesCredenciamento from './AcoesCredenciamento'
import ModalCredenciamento from './ModalCredenciamento'

export type CredenciamentoLinha = {
  id: string
  nome: string
  cpf: string
  telefone: string
  empresa: string | null
  cargo: string | null
  setorId: string
  setorNome: string
  /** 'formulario' | 'portaria' | 'planilha' — texto livre, vindo de `funcionarios.origem`. */
  origem: string
  status: StatusCredenciamento
  motivoNegacao: string | null
  criadoEm: string
  /** Quando e por quem foi aprovado/negado — nulo enquanto pendente. */
  decididoEm: string | null
  decididoPor: string | null
  /** Evento de subeventos: os dias pedidos e os aprovados. `null` = fora da escala por dia. */
  escala: {
    status: StatusEscala
    pedidos: string[]
    aprovados: string[]
    decididaEm: string | null
    decididaPor: string | null
  } | null
}

const ROTULO_ORIGEM: Record<string, string> = {
  formulario: 'Link (formulário)',
  portaria: 'Portaria (cartaz)',
  planilha: 'Planilha',
}

/**
 * Credenciamentos pendentes/aprovados/negados de um evento inteiro — mesmo
 * padrão de busca local e filtro de app/admin/veiculos/PainelVeiculos.tsx.
 * Supervisor só recebe (do Server Component) as linhas dos próprios setores;
 * aqui não há isolamento a mais para aplicar.
 */
export default function PainelAprovacoes({
  eventoId, linhas, diasDoEvento = null,
}: {
  eventoId: string
  linhas: CredenciamentoLinha[]
  /** Evento de subeventos: os dias de trabalho do evento. `null` = evento normal, sem coluna de dias. */
  diasDoEvento?: DiaDaEscala[] | null
}) {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'' | StatusCredenciamento>('pendente')
  // A linha cujo modal está aberto (clique no nome) — ver ModalCredenciamento.
  const [aberta, setAberta] = useState<CredenciamentoLinha | null>(null)

  /*
   * Aprovação em lote — evento de 4 mil pessoas não se aprova um por um.
   * Só pendentes entram na seleção. A action aprova até 200 por chamada;
   * acima disso a tela manda em levas e mostra o andamento.
   */
  const router = useRouter()
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [confirmandoLote, setConfirmandoLote] = useState(false)
  const [progresso, setProgresso] = useState<string | null>(null)
  const [resultadoLote, setResultadoLote] = useState<string | null>(null)
  const [aprovandoLote, startLote] = useTransition()

  const contagens = useMemo(() => {
    const c: Record<StatusCredenciamento, number> = { pendente: 0, aprovado: 0, negado: 0 }
    for (const l of linhas) c[l.status]++
    return c
  }, [linhas])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const cru = termo.replace(/[^a-z0-9]/g, '')
    return linhas.filter(l => {
      if (filtroStatus && l.status !== filtroStatus) return false
      if (!termo) return true
      const campos = [l.nome, l.cpf, l.telefone, l.empresa, l.cargo, l.setorNome].filter(Boolean).join(' ').toLowerCase()
      return campos.includes(termo) || (!!cru && campos.replace(/[^a-z0-9]/g, '').includes(cru))
    })
  }, [busca, filtroStatus, linhas])

  const pendentesFiltrados = filtrados.filter(l => l.status === 'pendente')
  const todosPendentesMarcados = pendentesFiltrados.length > 0 && pendentesFiltrados.every(l => selecionados.has(l.id))
  const alternarSelecao = (id: string) => setSelecionados(atual => {
    const novo = new Set(atual)
    if (novo.has(id)) novo.delete(id)
    else novo.add(id)
    return novo
  })
  const alternarTodos = () => setSelecionados(todosPendentesMarcados ? new Set() : new Set(pendentesFiltrados.map(l => l.id)))

  const aprovarSelecionados = () => {
    const itens = linhas
      .filter(l => selecionados.has(l.id) && l.status === 'pendente')
      .map(l => ({ funcionarioId: l.id, fornecedorId: l.setorId }))
    setResultadoLote(null)
    startLote(async () => {
      let aprovados = 0
      const falhas: string[] = []
      try {
        for (let i = 0; i < itens.length; i += 200) {
          setProgresso(`Aprovando ${Math.min(i + 200, itens.length)} de ${itens.length}...`)
          const r = await aprovarCredenciamentosEmLote(itens.slice(i, i + 200), eventoId)
          aprovados += r.aprovados
          falhas.push(...r.falhas.map(f => f.erro))
        }
      } catch {
        falhas.push('A conexão caiu no meio — confira a internet; quem já foi aprovado continua aprovado.')
      }
      setProgresso(null)
      setConfirmandoLote(false)
      setSelecionados(new Set())
      setResultadoLote(
        `${aprovados} aprovado${aprovados === 1 ? '' : 's'}` +
        (falhas.length ? ` · ${falhas.length} não aprovado${falhas.length === 1 ? '' : 's'} (${[...new Set(falhas)].slice(0, 2).join(' / ')})` : ''),
      )
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {/* Contadores — pendentes em destaque, é o que importa no dia do evento. */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => setFiltroStatus('pendente')} className={`text-left bg-white border rounded-2xl p-4 transition-colors ${filtroStatus === 'pendente' ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200 hover:border-amber-200'}`}>
          <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">Pendentes</p>
          <p className="text-2xl font-extrabold mt-1 tabular-nums text-amber-600">{contagens.pendente}</p>
        </button>
        <button onClick={() => setFiltroStatus('aprovado')} className={`text-left bg-white border rounded-2xl p-4 transition-colors ${filtroStatus === 'aprovado' ? 'border-green-300 ring-2 ring-green-100' : 'border-slate-200 hover:border-green-200'}`}>
          <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">Aprovados</p>
          <p className="text-2xl font-extrabold mt-1 tabular-nums text-green-600">{contagens.aprovado}</p>
        </button>
        <button onClick={() => setFiltroStatus('negado')} className={`text-left bg-white border rounded-2xl p-4 transition-colors ${filtroStatus === 'negado' ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200 hover:border-red-200'}`}>
          <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">Negados</p>
          <p className="text-2xl font-extrabold mt-1 tabular-nums text-red-600">{contagens.negado}</p>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Consultar nome, CPF, telefone, empresa ou fornecedor"
            className="input pl-9 pr-9"
            autoComplete="off"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <SeletorLista
          className="w-full sm:w-48" valor={filtroStatus} onChange={v => setFiltroStatus(v as '' | StatusCredenciamento)}
          placeholder="Status" titulo="Status"
          opcoes={[{ valor: '', rotulo: 'Todos os status' }, ...STATUS_CREDENCIAMENTO.map(s => ({ valor: s, rotulo: ROTULO_STATUS_CREDENCIAMENTO[s] }))]}
        />
      </div>

      {(selecionados.size > 0 || resultadoLote) && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-brand-200 rounded-2xl p-3">
          {selecionados.size > 0 && !confirmandoLote && (
            <>
              <p className="text-slate-700 text-sm font-semibold flex-1 min-w-[10rem]">
                {selecionados.size} selecionado{selecionados.size === 1 ? '' : 's'}
              </p>
              <button type="button" onClick={() => setSelecionados(new Set())} className="btn btn-secundario btn-sm">Limpar</button>
              <button type="button" onClick={() => setConfirmandoLote(true)} className="btn btn-primario btn-sm">
                <Check className="w-3.5 h-3.5" /> Aprovar selecionados
              </button>
            </>
          )}
          {selecionados.size > 0 && confirmandoLote && (
            <>
              <p className="text-slate-700 text-sm flex-1 min-w-[12rem]">
                {progresso ?? <>Aprovar <strong>{selecionados.size}</strong> pessoa{selecionados.size === 1 ? '' : 's'}?
                  {diasDoEvento && ' Cada uma com os dias que pediu — para ajustar dias, aprove pelo nome.'}
                  {' '}Cada uma recebe a credencial no WhatsApp.</>}
              </p>
              <button type="button" onClick={() => setConfirmandoLote(false)} disabled={aprovandoLote} className="btn btn-secundario btn-sm">Cancelar</button>
              <button type="button" onClick={aprovarSelecionados} disabled={aprovandoLote} className="btn btn-primario btn-sm">
                {aprovandoLote ? 'Aprovando...' : 'Confirmar aprovação'}
              </button>
            </>
          )}
          {!selecionados.size && resultadoLote && (
            <>
              <p className="text-slate-700 text-sm flex-1">{resultadoLote}</p>
              <button type="button" onClick={() => setResultadoLote(null)} className="text-slate-400 hover:text-slate-600" aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      )}

      <Secao
        tom="acento"
        icone={<ClipboardCheck className="w-3.5 h-3.5" />}
        titulo={busca || filtroStatus
          ? `${filtrados.length} de ${linhas.length} credenciamento${linhas.length === 1 ? '' : 's'}`
          : `${linhas.length} credenciamento${linhas.length === 1 ? '' : 's'} neste evento`}
        corpoClassName={filtrados.length ? '' : 'p-4'}
      >
        {!linhas.length ? (
          <EmptyState
            icone={<ClipboardCheck className="w-7 h-7" />}
            titulo="Nenhum credenciamento ainda"
            descricao="Assim que alguém se cadastrar pelo link ou pela portaria, aparece aqui."
          />
        ) : !filtrados.length ? (
          <EmptyState
            icone={<Search className="w-7 h-7" />}
            titulo="Nada encontrado"
            descricao="Confira o nome, CPF ou tente outro filtro de status."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th className="w-8">
                    {pendentesFiltrados.length > 0 && (
                      <input
                        type="checkbox" checked={todosPendentesMarcados} onChange={alternarTodos}
                        aria-label="Selecionar todos os pendentes"
                        className="w-4 h-4 accent-brand-500 cursor-pointer"
                      />
                    )}
                  </th>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Empresa/Cargo</th>
                  <th>Fornecedor</th>
                  <th>Origem</th>
                  <th>Recebido em</th>
                  <th>Status</th>
                  {diasDoEvento && <th>Dias de trabalho</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(l => (
                  <tr key={l.id}>
                    <td>
                      {l.status === 'pendente' && (
                        <input
                          type="checkbox" checked={selecionados.has(l.id)} onChange={() => alternarSelecao(l.id)}
                          aria-label={`Selecionar ${l.nome}`}
                          className="w-4 h-4 accent-brand-500 cursor-pointer"
                        />
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => setAberta(l)}
                        className="text-slate-700 font-medium text-left hover:text-brand-600 hover:underline"
                      >
                        {l.nome}
                      </button>
                    </td>
                    <td>
                      <p className="text-slate-700 text-2xs tabular-nums">{formatCpf(l.cpf)}</p>
                      <p className="text-slate-400 text-2xs tabular-nums">{formatTelefone(l.telefone)}</p>
                    </td>
                    <td className="text-slate-500 text-2xs">
                      {[l.empresa, l.cargo].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="text-slate-500 text-2xs">{l.setorNome}</td>
                    <td className="text-slate-500 text-2xs">{ROTULO_ORIGEM[l.origem] ?? l.origem}</td>
                    <td className="text-slate-500 text-2xs whitespace-nowrap">{formatarBR(l.criadoEm, 'curto')}</td>
                    <td>
                      <Badge tom={TOM_STATUS_CREDENCIAMENTO[l.status]}>{ROTULO_STATUS_CREDENCIAMENTO[l.status]}</Badge>
                      {l.status === 'negado' && l.motivoNegacao && (
                        <p className="text-slate-400 text-2xs mt-0.5 max-w-[16rem]">{l.motivoNegacao}</p>
                      )}
                    </td>
                    {diasDoEvento && (
                      <td className="text-2xs max-w-[14rem]">
                        {!l.escala ? (
                          <span className="text-slate-400">Sem escala por dia</span>
                        ) : l.escala.status === 'aprovada' ? (
                          <>
                            <p className="text-green-700 font-semibold">Aprovados: {listarDias(l.escala.aprovados)}</p>
                            {l.escala.decididaPor && (
                              <p className="text-slate-400">
                                por {l.escala.decididaPor}{l.escala.decididaEm ? ` · ${formatarBR(l.escala.decididaEm, 'curto')}` : ''}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-amber-700">Pediu: {listarDias(l.escala.pedidos)}</p>
                        )}
                      </td>
                    )}
                    <td className="text-right">
                      {l.status === 'pendente' ? (
                        <AcoesCredenciamento
                          funcionarioId={l.id} fornecedorId={l.setorId} eventoId={eventoId} nome={l.nome}
                          onAprovarComDias={diasDoEvento ? () => setAberta(l) : undefined}
                        />
                      ) : (
                        <div className="text-2xs whitespace-nowrap">
                          <p className="text-slate-600">
                            {l.status === 'negado' ? 'Negado' : 'Aprovado'} por{' '}
                            <strong className="text-slate-800">{l.decididoPor ?? '—'}</strong>
                          </p>
                          {l.decididoEm && <p className="text-slate-400">{formatarBR(l.decididoEm, 'curto')}</p>}
                          {l.status === 'aprovado' && diasDoEvento && (
                            <button
                              type="button"
                              onClick={() => setAberta(l)}
                              className="btn-press mt-1 inline-flex items-center gap-1 text-2xs font-semibold rounded-lg px-2 py-1 text-brand-600 hover:bg-brand-50"
                            >
                              Ajustar dias
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {aberta && (
        <ModalCredenciamento
          funcionarioId={aberta.id} fornecedorId={aberta.setorId} eventoId={eventoId}
          nome={aberta.nome} onFechar={() => setAberta(null)}
        />
      )}
    </div>
  )
}
