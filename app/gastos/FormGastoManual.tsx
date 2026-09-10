'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Save, Paperclip, AlertTriangle } from 'lucide-react'
import { LogoLoading } from '@/components/LogoLoading'
import { criarGasto, editarGasto } from '@/lib/actions-gastos'
import { CATEGORIAS_GASTO, CATEGORIA_PADRAO } from '@/lib/gastos-constantes'
import type { Gasto } from '@/lib/gastos'
import SeletorLista from '@/components/SeletorLista'
import DateTimePicker from '@/components/DateTimePicker'

const hoje = () => new Date().toISOString().slice(0, 10)

type EventoOpcao = { id: string; nome: string }

/**
 * "+ Adicionar manualmente" — e a edição de um gasto, que é o mesmo
 * formulário. Fica atrás do botão de áudio de propósito: é o caminho pra
 * quando o produtor prefere digitar ou não pode falar (reunião, lugar
 * barulhento, microfone negado).
 */
export default function FormGastoManual({
  eventos, eventoIdInicial, gasto, aberto: abertoControlado, onFechar,
}: {
  eventos: EventoOpcao[]
  eventoIdInicial?: string
  /** Preenchido = edição. */
  gasto?: Gasto
  /** Modo controlado (edição vinda de fora). Sem isto, o componente tem o próprio botão. */
  aberto?: boolean
  onFechar?: () => void
}) {
  const [abertoInterno, setAbertoInterno] = useState(false)
  const aberto = abertoControlado ?? abertoInterno
  const fechar = () => (onFechar ? onFechar() : setAbertoInterno(false))

  return (
    <>
      {abertoControlado === undefined && (
        <button onClick={() => setAbertoInterno(true)} className="btn btn-secundario w-full justify-center">
          <Plus className="w-3.5 h-3.5" /> Adicionar manualmente
        </button>
      )}
      {aberto && (
        <Formulario
          eventos={eventos}
          eventoIdInicial={eventoIdInicial}
          gasto={gasto}
          onFechar={fechar}
        />
      )}
    </>
  )
}

function Formulario({
  eventos, eventoIdInicial, gasto, onFechar,
}: {
  eventos: EventoOpcao[]
  eventoIdInicial?: string
  gasto?: Gasto
  onFechar: () => void
}) {
  const router = useRouter()
  const editando = !!gasto
  const [eventoId, setEventoId] = useState(gasto?.eventoId ?? eventoIdInicial ?? '')
  const [categoria, setCategoria] = useState(gasto?.categoria ?? CATEGORIA_PADRAO)
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const salvar = (formData: FormData) => {
    setErro(null)
    if (!eventoId) { setErro('Escolha o evento.'); return }
    formData.set('evento_id', eventoId)
    formData.set('categoria', categoria)
    formData.set('origem', 'manual')
    startTransition(async () => {
      const r = editando ? await editarGasto(gasto!.id, formData) : await criarGasto(formData)
      if (!r.ok) { setErro(r.erro); return }
      onFechar()
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !pendente && onFechar()}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-slate-800 font-bold">{editando ? 'Editar gasto' : 'Adicionar gasto'}</h2>
          <button onClick={onFechar} disabled={pendente} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form action={salvar} className="p-6 space-y-4">
          <Campo rotulo="Evento *">
            <SeletorLista
              valor={eventoId}
              onChange={setEventoId}
              placeholder="Escolha o evento"
              titulo="Evento"
              busca={eventos.length > 8}
              opcoes={eventos.map(e => ({ valor: e.id, rotulo: e.nome }))}
            />
          </Campo>

          <Campo rotulo="Descrição *">
            <input name="descricao" required defaultValue={gasto?.descricao ?? ''} placeholder="Ex.: aluguel de estrutura" className="input" autoFocus />
          </Campo>

          <div className="grid sm:grid-cols-2 gap-3">
            <Campo rotulo="Valor (R$) *">
              <input name="valor" inputMode="decimal" required defaultValue={gasto?.valor ? String(gasto.valor).replace('.', ',') : ''} placeholder="0,00" className="input tabular-nums" />
            </Campo>
            <Campo rotulo="Categoria *">
              <SeletorLista valor={categoria} onChange={setCategoria} titulo="Categoria" opcoes={CATEGORIAS_GASTO.map(c => ({ valor: c, rotulo: c }))} />
            </Campo>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Campo rotulo="Fornecedor">
              <input name="fornecedor" defaultValue={gasto?.fornecedor ?? ''} placeholder="Ex.: XYZ Eventos" className="input" />
            </Campo>
            <Campo rotulo="Data do gasto *">
              <DateTimePicker modo="data" name="data_gasto" defaultValue={gasto?.dataGasto ?? hoje()} required />
            </Campo>
          </div>

          <Campo rotulo="Observação">
            <textarea name="observacao" rows={2} defaultValue={gasto?.observacao ?? ''} placeholder="Detalhe opcional" className="input resize-none" />
          </Campo>

          <Campo rotulo={`Comprovante ${gasto?.temComprovante ? '(trocar arquivo)' : ''}`}>
            <label className="btn btn-secundario w-full cursor-pointer justify-center">
              <Paperclip className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{nomeArquivo || (gasto?.temComprovante ? gasto.comprovanteNome ?? 'Comprovante anexado' : 'Anexar foto ou PDF')}</span>
              <input type="file" name="comprovante" accept=".pdf,image/*" className="hidden" onChange={e => setNomeArquivo(e.target.files?.[0]?.name ?? null)} />
            </label>
          </Campo>

          {erro && (
            <p className="flex items-start gap-1.5 text-red-600 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={pendente} className="btn btn-primario disabled:opacity-50">
              {pendente ? <LogoLoading tamanho={14} /> : <Save className="w-3.5 h-3.5" />}
              {pendente ? 'Salvando…' : editando ? 'Salvar' : 'Adicionar gasto'}
            </button>
            <button type="button" onClick={onFechar} disabled={pendente} className="btn btn-secundario">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{rotulo}</label>
      {children}
    </div>
  )
}
