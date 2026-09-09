'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Save, X, FileText, Paperclip, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { salvarFaturamento, urlNfeEvento } from '@/lib/actions-financeiro'
import { mensagemAmigavel } from '@/lib/erros'

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/**
 * O faturamento do evento, e a NFe — os dois únicos campos que não são
 * "custo": moram numa linha própria (`financeiro_eventos`) porque só existe
 * UM faturamento por evento, contra vários custos.
 */
export default function PainelFaturamento({
  eventoId, faturamento, temNfe, nfeNome,
}: {
  eventoId: string
  faturamento: number
  temNfe: boolean
  nfeNome: string | null
}) {
  const router = useRouter()
  const [editando, setEditando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [removerNfe, setRemoverNfe] = useState(false)
  const [nomeArquivoEscolhido, setNomeArquivoEscolhido] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const [abrindoNfe, startAbrirNfe] = useTransition()

  const salvar = (formData: FormData) => {
    setErro(null)
    if (removerNfe) formData.set('remover_nfe', '1')
    startTransition(async () => {
      try {
        await salvarFaturamento(eventoId, formData)
        setEditando(false)
        setRemoverNfe(false)
        router.refresh()
      } catch (e) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  const abrirNfe = () => {
    startAbrirNfe(async () => {
      const url = await urlNfeEvento(eventoId)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      else setErro('Não consegui abrir a NFe. Tente de novo.')
    })
  }

  if (!editando) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-slate-400 text-xs">Receita do evento</p>
          <p className="text-slate-800 text-2xl font-bold tabular-nums">{brl(faturamento)}</p>
          {temNfe ? (
            <button
              onClick={abrirNfe}
              disabled={abrindoNfe}
              className="flex items-center gap-1.5 text-brand-600 hover:text-brand-700 text-xs font-medium mt-1"
            >
              {abrindoNfe ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileText className="w-3 h-3" />}
              {nfeNome ?? 'Ver NFe anexada'}
            </button>
          ) : (
            <p className="text-slate-400 text-xs mt-1">Nenhuma NFe anexada</p>
          )}
        </div>
        <button onClick={() => setEditando(true)} className="btn btn-secundario btn-sm">
          <Pencil className="w-3.5 h-3.5 shrink-0" /> Editar
        </button>
      </div>
    )
  }

  return (
    <form action={salvar} className="space-y-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-slate-500 text-xs font-medium block mb-1">Receita (R$)</label>
          <input
            name="faturamento" type="number" min="0" step="0.01" required
            defaultValue={faturamento || ''} placeholder="0,00" className="input tabular-nums"
            autoFocus
          />
        </div>
        <div>
          <label className="text-slate-500 text-xs font-medium block mb-1">
            NFe {temNfe ? '(trocar arquivo)' : ''}
          </label>
          <label className="btn btn-secundario btn-sm w-full cursor-pointer justify-center">
            <Paperclip className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{nomeArquivoEscolhido || 'Anexar PDF ou imagem'}</span>
            <input
              type="file" name="nfe" accept=".pdf,image/*" className="hidden"
              onChange={e => setNomeArquivoEscolhido(e.target.files?.[0]?.name ?? null)}
            />
          </label>
        </div>
      </div>

      {temNfe && !nomeArquivoEscolhido && (
        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
          <input
            type="checkbox" checked={removerNfe}
            onChange={e => setRemoverNfe(e.target.checked)}
            className="h-3.5 w-3.5 accent-red-500"
          />
          <span className="flex items-center gap-1">
            <Trash2 className="w-3 h-3" /> Remover a NFe atual ({nfeNome ?? 'anexo'})
          </span>
        </label>
      )}

      {erro && (
        <p className="flex items-start gap-1.5 text-red-600 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" disabled={pendente} className="btn btn-primario btn-sm disabled:opacity-50">
          <Save className="w-3.5 h-3.5 shrink-0" /> {pendente ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={() => { setEditando(false); setErro(null); setRemoverNfe(false); setNomeArquivoEscolhido(null) }}
          disabled={pendente}
          className="btn btn-secundario btn-sm"
        >
          <X className="w-3.5 h-3.5 shrink-0" /> Cancelar
        </button>
      </div>
    </form>
  )
}
