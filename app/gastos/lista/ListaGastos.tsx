'use client'
import { useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  X, Pencil, Trash2, FileText, AlertTriangle, Mic, Keyboard,
} from 'lucide-react'
import { excluirGasto, urlComprovanteGasto } from '@/lib/actions-gastos'
import type { Gasto } from '@/lib/gastos'
import { CATEGORIAS_GASTO, ROTULO_ORIGEM, ROTULO_STATUS, brl } from '@/lib/gastos-constantes'
import SeletorLista from '@/components/SeletorLista'
import DateTimePicker from '@/components/DateTimePicker'
import ConfirmModal from '@/components/ConfirmModal'
import { LogoLoading } from '@/components/LogoLoading'
import FormGastoManual from '../FormGastoManual'
import ExportarGastos from './ExportarGastos'

type EventoOpcao = { id: string; nome: string; ativo: boolean }

/**
 * A tabela completa de gastos + filtros na URL + editar / excluir / detalhe /
 * exportar. Filtros na URL pelo mesmo motivo do resto do sistema: volta,
 * recarrega e link compartilhável mantêm o recorte.
 */
export default function ListaGastos({
  gastos, eventos, fornecedores, eventoAtualId,
}: {
  gastos: Gasto[]
  eventos: EventoOpcao[]
  fornecedores: string[]
  eventoAtualId: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()

  const [editando, setEditando] = useState<Gasto | null>(null)
  const [detalhe, setDetalhe] = useState<Gasto | null>(null)
  const [excluir, setExcluir] = useState<Gasto | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const trocar = (chave: string, valor: string) => {
    const novo = new URLSearchParams(params.toString())
    if (valor) novo.set(chave, valor)
    else novo.delete(chave)
    router.push(`${pathname}?${novo.toString()}`)
  }

  const temFiltro = ['categoria', 'fornecedor', 'pago', 'de', 'ate'].some(c => params.get(c))

  const confirmarExclusao = () => {
    if (!excluir) return
    setErro(null)
    startTransition(async () => {
      const r = await excluirGasto(excluir.id)
      if (!r.ok) { setErro(r.erro); return }
      setExcluir(null)
      router.refresh()
    })
  }

  const total = gastos.reduce((s, g) => s + g.valor, 0)

  return (
    <div className="space-y-4">
      {/* ── Filtros ─────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-3 sm:p-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3">
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-end gap-2 flex-1">
            <div className="min-w-0">
              <label className="text-slate-400 text-2xs font-semibold uppercase tracking-wide block mb-1">De</label>
              <DateTimePicker modo="data" value={params.get('de') ?? ''} onChange={v => trocar('de', v)} placeholder="Início" className="w-full sm:w-36 text-sm" />
            </div>
            <div className="min-w-0">
              <label className="text-slate-400 text-2xs font-semibold uppercase tracking-wide block mb-1">Até</label>
              <DateTimePicker modo="data" value={params.get('ate') ?? ''} onChange={v => trocar('ate', v)} placeholder="Fim" className="w-full sm:w-36 text-sm" />
            </div>
            <div className="min-w-0">
              <label className="text-slate-400 text-2xs font-semibold uppercase tracking-wide block mb-1">Categoria</label>
              <SeletorLista
                className="w-full sm:w-44 text-sm" valor={params.get('categoria') ?? ''}
                onChange={v => trocar('categoria', v)} placeholder="Todas" titulo="Categoria"
                opcoes={[{ valor: '', rotulo: 'Todas' }, ...CATEGORIAS_GASTO.map(c => ({ valor: c, rotulo: c }))]}
              />
            </div>
            {fornecedores.length > 0 && (
              <div className="min-w-0 col-span-2 sm:col-span-1">
                <label className="text-slate-400 text-2xs font-semibold uppercase tracking-wide block mb-1">Fornecedor</label>
                <SeletorLista
                  className="w-full sm:w-44 text-sm" valor={params.get('fornecedor') ?? ''}
                  onChange={v => trocar('fornecedor', v)} placeholder="Todos" titulo="Fornecedor" busca
                  opcoes={[{ valor: '', rotulo: 'Todos' }, ...fornecedores.map(f => ({ valor: f, rotulo: f }))]}
                />
              </div>
            )}
            <div className="min-w-0">
              <label className="text-slate-400 text-2xs font-semibold uppercase tracking-wide block mb-1">Situação</label>
              <SeletorLista
                className="w-full sm:w-36 text-sm" valor={params.get('pago') ?? ''}
                onChange={v => trocar('pago', v)} placeholder="Todos" titulo="Situação do pagamento"
                opcoes={[{ valor: '', rotulo: 'Todos' }, { valor: 'true', rotulo: 'Pago' }, { valor: 'false', rotulo: 'A pagar' }]}
              />
            </div>
            {temFiltro && (
              <button onClick={() => router.push(`${pathname}?evento=${params.get('evento') ?? ''}`)} className="btn btn-secundario btn-sm h-9">
                <X className="w-3.5 h-3.5" /> Limpar
              </button>
            )}
          </div>
          <div className="md:ml-auto md:pb-0.5"><ExportarGastos gastos={gastos} eventoId={eventoAtualId} /></div>
        </div>
      </div>

      {erro && (
        <p className="flex items-start gap-1.5 text-red-600 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}

      {/* ── Tabela ──────────────────────────────────────────────────────── */}
      {!gastos.length ? (
        <p className="text-slate-400 text-sm py-10 text-center border border-slate-200 rounded-xl">
          Nenhum gasto neste recorte.
        </p>
      ) : (
        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 text-2xs uppercase tracking-wide border-b border-slate-100">
                <th className="text-left font-semibold px-3 py-2">Data</th>
                <th className="text-left font-semibold px-3 py-2">Descrição</th>
                <th className="text-left font-semibold px-3 py-2 hidden sm:table-cell">Fornecedor</th>
                <th className="text-left font-semibold px-3 py-2 hidden md:table-cell">Categoria</th>
                <th className="text-left font-semibold px-3 py-2 hidden lg:table-cell">Registro</th>
                <th className="text-right font-semibold px-3 py-2">Valor</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {gastos.map(g => (
                <tr key={g.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-3 py-2 tabular-nums text-slate-500 whitespace-nowrap">
                    {dataBr(g.dataGasto)}
                    <span className="block text-2xs text-slate-400">{hora(g.registradoEm)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => setDetalhe(g)} className="text-slate-800 hover:text-brand-600 text-left font-medium">
                      {g.descricao}
                    </button>
                    <span className="sm:hidden block text-2xs text-slate-400">
                      {g.fornecedor ? `${g.fornecedor} · ` : ''}{g.categoria}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 hidden sm:table-cell">{g.fornecedor ?? '—'}</td>
                  <td className="px-3 py-2 text-slate-600 hidden md:table-cell">{g.categoria}</td>
                  <td className="px-3 py-2 hidden lg:table-cell">
                    <span className="inline-flex items-center gap-1 text-2xs text-slate-500">
                      {g.origem === 'audio' ? <Mic className="w-3 h-3" /> : <Keyboard className="w-3 h-3" />}
                      {ROTULO_ORIGEM[g.origem]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                    {brl(g.valor)}
                    {!g.pago && (
                      <span className="block text-2xs font-semibold text-amber-600 tracking-wide">A pagar</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setEditando(g)} className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-600 hover:bg-white" aria-label="Editar">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setExcluir(g)} className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-white" aria-label="Excluir">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-100 font-semibold text-slate-800">
                <td className="px-3 py-2" colSpan={5}>Total ({gastos.length})</td>
                <td className="px-3 py-2 text-right tabular-nums" colSpan={2}>{brl(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {editando && (
        <FormGastoManual
          eventos={eventos.map(e => ({ id: e.id, nome: e.nome }))}
          gasto={editando}
          aberto
          onFechar={() => setEditando(null)}
        />
      )}

      {detalhe && <DetalheGasto gasto={detalhe} onFechar={() => setDetalhe(null)} onEditar={() => { setEditando(detalhe); setDetalhe(null) }} />}

      <ConfirmModal
        open={!!excluir}
        onClose={() => setExcluir(null)}
        onConfirm={confirmarExclusao}
        isPending={pendente}
        titulo="Excluir gasto"
        mensagem={excluir ? `Apagar "${excluir.descricao}" (${brl(excluir.valor)})? Isso não tem desfazer.` : ''}
      />
    </div>
  )
}

function DetalheGasto({ gasto, onFechar, onEditar }: { gasto: Gasto; onFechar: () => void; onEditar: () => void }) {
  const [abrindo, startAbrir] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const verComprovante = () => {
    setErro(null)
    startAbrir(async () => {
      const r = await urlComprovanteGasto(gasto.id)
      if (!r.ok) { setErro(r.erro); return }
      if (r.url) window.open(r.url, '_blank', 'noopener,noreferrer')
      else setErro('Sem comprovante anexado.')
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
          <h2 className="text-slate-800 font-bold">{gasto.descricao}</h2>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6 space-y-2.5 text-sm">
          <Linha rotulo="Valor" valor={brl(gasto.valor)} />
          <Linha rotulo="Evento" valor={gasto.eventoNome ?? '—'} />
          <Linha rotulo="Fornecedor" valor={gasto.fornecedor ?? '—'} />
          {gasto.formaPagamento && <Linha rotulo="Forma de pagamento" valor={gasto.formaPagamento} />}
          {gasto.pagador && <Linha rotulo="Pagador" valor={gasto.pagador} />}
          <Linha rotulo="Situação" valor={gasto.pago ? 'Pago' : 'A pagar'} destaque={!gasto.pago} />
          <Linha rotulo="Categoria" valor={gasto.categoria} />
          <Linha rotulo="Data do gasto" valor={dataBr(gasto.dataGasto)} />
          <Linha rotulo="Registrado em" valor={`${dataBr(gasto.registradoEm.slice(0, 10))} ${hora(gasto.registradoEm)}`} />
          <Linha rotulo="Forma" valor={ROTULO_ORIGEM[gasto.origem]} />
          <Linha rotulo="Status" valor={ROTULO_STATUS[gasto.status]} />
          {gasto.criadoPorNome && <Linha rotulo="Lançado por" valor={gasto.criadoPorNome} />}
          {gasto.observacao && <div><p className="text-slate-400 text-2xs uppercase tracking-wide">Observação</p><p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{gasto.observacao}</p></div>}
          {gasto.transcricao && <div><p className="text-slate-400 text-2xs uppercase tracking-wide">Áudio transcrito</p><p className="text-slate-500 italic mt-0.5">&ldquo;{gasto.transcricao}&rdquo;</p></div>}

          {gasto.temComprovante && (
            <button onClick={verComprovante} disabled={abrindo} className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700 text-xs font-medium mt-1">
              {abrindo ? <LogoLoading tamanho={14} /> : <FileText className="w-3.5 h-3.5" />}
              Ver comprovante {gasto.comprovanteNome ? `(${gasto.comprovanteNome})` : ''}
            </button>
          )}
          {erro && <p className="text-red-600 text-xs">{erro}</p>}

          <div className="flex gap-2 pt-2">
            <button onClick={onEditar} className="btn btn-secundario btn-sm"><Pencil className="w-3.5 h-3.5" /> Editar</button>
            <button onClick={onFechar} className="btn btn-secundario btn-sm">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-400 text-xs">{rotulo}</span>
      <span className={`text-right ${destaque ? 'text-amber-600 font-semibold' : 'text-slate-700'}`}>{valor}</span>
    </div>
  )
}

function dataBr(iso: string) {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}
function hora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}
