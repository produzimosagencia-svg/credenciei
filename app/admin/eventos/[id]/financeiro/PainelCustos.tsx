'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, X, Save, Trash2, Pencil, Paperclip, ChevronDown, ChevronRight,
  FileText, AlertTriangle, Loader2, Receipt,
} from 'lucide-react'
import { criarCusto, editarCusto, excluirCusto, urlComprovanteCusto } from '@/lib/actions-financeiro'
import type { Custo } from '@/lib/financeiro'
import { CATEGORIAS_CUSTO } from '@/lib/financeiro-categorias'
import { formatarBR } from '@/lib/tz'
import { mensagemAmigavel } from '@/lib/erros'
import SeletorLista from '@/components/SeletorLista'
import DateTimePicker from '@/components/DateTimePicker'
import ConfirmModal from '@/components/ConfirmModal'
import { EmptyState } from '@/components/ui/Superficie'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const hoje = () => new Date().toISOString().slice(0, 10)

/**
 * Os custos do evento — a lista, o "+ Adicionar custo", e a expansão por
 * categoria que o pedido descreve.
 */
export default function PainelCustos({
  eventoId, custos,
}: {
  eventoId: string | null
  custos: Custo[]
}) {
  const [formulario, setFormulario] = useState<{ modo: 'criar' } | { modo: 'editar'; custo: Custo } | null>(null)
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set())
  const [paraExcluir, setParaExcluir] = useState<Custo | null>(null)

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, Custo[]>()
    for (const c of custos) mapa.set(c.categoria, [...(mapa.get(c.categoria) ?? []), c])
    return [...mapa.entries()]
      .map(([categoria, itens]) => ({ categoria, itens, total: itens.reduce((s, i) => s + i.valor, 0) }))
      .sort((a, b) => b.total - a.total)
  }, [custos])

  const alternarCategoria = (categoria: string) => {
    setExpandidas(atual => {
      const proximo = new Set(atual)
      if (proximo.has(categoria)) proximo.delete(categoria)
      else proximo.add(categoria)
      return proximo
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-slate-700 text-sm font-semibold">
          {custos.length} lançamento{custos.length === 1 ? '' : 's'}
        </p>
        <button onClick={() => setFormulario({ modo: 'criar' })} className="btn btn-primario btn-sm">
          <Plus className="w-3.5 h-3.5 shrink-0" /> Adicionar custo
        </button>
      </div>

      {!custos.length ? (
        <EmptyState
          icone={<Receipt className="w-7 h-7" />}
          titulo="Nenhum custo lançado ainda"
          descricao='Clique em "Adicionar custo" pra registrar o primeiro gasto deste evento.'
        />
      ) : (
        /*
         * Agrupado por categoria, recolhido — é o "expandir os custos para
         * ver detalhadamente" do pedido. Recolhido de início porque um
         * evento grande acumula dezenas de lançamentos, e a pergunta mais
         * comum ao abrir a tela é "quanto custou cada categoria", não "me
         * mostra tudo de uma vez".
         */
        <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {porCategoria.map(grupo => {
            const aberta = expandidas.has(grupo.categoria)
            return (
              <div key={grupo.categoria}>
                <button
                  onClick={() => alternarCategoria(grupo.categoria)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 transition-colors text-left"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    {aberta ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                    <span className="text-slate-800 text-sm font-medium truncate">{grupo.categoria}</span>
                    <span className="text-slate-400 text-xs shrink-0">
                      {grupo.itens.length} lançamento{grupo.itens.length === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span className="text-slate-700 text-sm font-semibold tabular-nums shrink-0">{brl(grupo.total)}</span>
                </button>
                {aberta && (
                  <div className="divide-y divide-slate-50 bg-slate-50/50">
                    {grupo.itens.map(c => (
                      <div key={c.id} className="flex items-start justify-between gap-3 px-4 py-3 pl-10">
                        <div className="min-w-0">
                          <p className="text-slate-700 text-sm font-medium truncate">{c.descricao}</p>
                          <p className="flex flex-wrap items-center gap-x-2 text-slate-400 text-xs mt-0.5">
                            <span className="tabular-nums">{formatarBR(`${c.data}T12:00:00-03:00`, 'data')}</span>
                            {c.observacao && <span className="truncate">· {c.observacao}</span>}
                            {c.criadoPorNome && <span>· lançado por {c.criadoPorNome}</span>}
                          </p>
                          {c.temComprovante && <BotaoComprovante custoId={c.id} />}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-slate-800 text-sm font-semibold tabular-nums mr-1">{brl(c.valor)}</span>
                          <button
                            onClick={() => setFormulario({ modo: 'editar', custo: c })}
                            className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-600 hover:bg-white"
                            aria-label={`Editar ${c.descricao}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setParaExcluir(c)}
                            className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-white"
                            aria-label={`Excluir ${c.descricao}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {formulario && (
        <FormularioCusto eventoId={eventoId} alvo={formulario} onFechar={() => setFormulario(null)} />
      )}

      <ExcluirCustoModal custo={paraExcluir} eventoId={eventoId} onFechar={() => setParaExcluir(null)} />
    </div>
  )
}

function BotaoComprovante({ custoId }: { custoId: string }) {
  const [abrindo, startTransition] = useTransition()
  const [erro, setErro] = useState(false)
  const abrir = () => {
    setErro(false)
    startTransition(async () => {
      const url = await urlComprovanteCusto(custoId)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else setErro(true)
    })
  }
  return (
    <button onClick={abrir} disabled={abrindo} className="flex items-center gap-1 text-brand-600 hover:text-brand-700 text-2xs font-medium mt-1">
      {abrindo ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
      {erro ? 'Não consegui abrir — tente de novo' : 'Ver comprovante'}
    </button>
  )
}

function FormularioCusto({
  eventoId, alvo, onFechar,
}: {
  eventoId: string | null
  alvo: { modo: 'criar' } | { modo: 'editar'; custo: Custo }
  onFechar: () => void
}) {
  const router = useRouter()
  const isEditar = alvo.modo === 'editar'
  const custo = isEditar ? alvo.custo : null
  const [categoria, setCategoria] = useState(custo?.categoria ?? CATEGORIAS_CUSTO[0])
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const salvar = (formData: FormData) => {
    setErro(null)
    formData.set('categoria', categoria)
    startTransition(async () => {
      try {
        if (isEditar) await editarCusto(custo!.id, eventoId, formData)
        else await criarCusto(eventoId, formData)
        onFechar()
        router.refresh()
      } catch (e) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !pendente && onFechar()}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div
        className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-slate-800 font-bold flex items-center gap-2">
            <Receipt className="w-4 h-4 text-brand-500" /> {isEditar ? 'Editar custo' : 'Adicionar custo'}
          </h2>
          <button onClick={onFechar} disabled={pendente} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form action={salvar} className="p-6 space-y-4">
          <Field label="Descrição do gasto *">
            <input
              name="descricao" required defaultValue={custo?.descricao ?? ''}
              placeholder="Ex.: Aluguel de som, diária dos seguranças…" className="input" autoFocus
            />
          </Field>

          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Categoria *">
              <SeletorLista
                valor={categoria}
                onChange={setCategoria}
                titulo="Categoria do custo"
                opcoes={CATEGORIAS_CUSTO.map(c => ({ valor: c, rotulo: c }))}
              />
            </Field>
            <Field label="Valor (R$) *">
              <input
                name="valor" type="number" min="0" step="0.01" required
                defaultValue={custo?.valor || ''} placeholder="0,00" className="input tabular-nums"
              />
            </Field>
          </div>

          <Field label="Data do gasto *">
            <DateTimePicker modo="data" name="data" defaultValue={custo?.data ?? hoje()} required />
          </Field>

          <Field label="Observação">
            <textarea
              name="observacao" rows={2} defaultValue={custo?.observacao ?? ''}
              placeholder="Detalhe opcional sobre este gasto" className="input resize-none"
            />
          </Field>

          <Field label={`Comprovante ${custo?.temComprovante ? '(trocar arquivo)' : ''}`}>
            <label className="btn btn-secundario btn-sm w-full cursor-pointer justify-center">
              <Paperclip className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{nomeArquivo || (custo?.temComprovante ? 'Comprovante já anexado' : 'Anexar PDF ou imagem')}</span>
              <input
                type="file" name="comprovante" accept=".pdf,image/*" className="hidden"
                onChange={e => setNomeArquivo(e.target.files?.[0]?.name ?? null)}
              />
            </label>
          </Field>

          {erro && (
            <p className="flex items-start gap-1.5 text-red-600 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={pendente} className="btn btn-primario disabled:opacity-50">
              <Save className="w-3.5 h-3.5 shrink-0" /> {pendente ? 'Salvando…' : 'Salvar custo'}
            </button>
            <button type="button" onClick={onFechar} disabled={pendente} className="btn btn-secundario">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ExcluirCustoModal({
  custo, eventoId, onFechar,
}: {
  custo: Custo | null
  eventoId: string | null
  onFechar: () => void
}) {
  const router = useRouter()
  const [pendente, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  const confirmar = () => {
    if (!custo) return
    setErro(null)
    startTransition(async () => {
      try {
        await excluirCusto(custo.id, eventoId)
        onFechar()
        router.refresh()
      } catch (e) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <ConfirmModal
      open={!!custo}
      onClose={onFechar}
      onConfirm={confirmar}
      isPending={pendente}
      titulo="Excluir custo"
      mensagem={custo
        ? `Apagar "${custo.descricao}" (${brl(custo.valor)})? Isso não tem desfazer${erro ? `\n\n${erro}` : ''}.`
        : ''}
    />
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  )
}
