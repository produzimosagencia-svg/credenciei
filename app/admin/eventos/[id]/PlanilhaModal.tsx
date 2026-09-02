'use client'
import { useState } from 'react'
import { FileSpreadsheet, X } from 'lucide-react'
import ImportarFuncionarios from './ImportarFuncionarios'
import ExportarEquipe from './ExportarEquipe'

type DiaDoEvento = { data: string; tipo: string }

/**
 * As três ações de planilha do setor, atrás de um ícone.
 *
 * Elas ocupavam três botões na frente do card — junto com "Ver equipe",
 * "Link do formulário" e "Criar Supervisor", davam seis controles com o
 * mesmo peso visual e o cartão virava uma parede de botões. Só que as três
 * são a MESMA tarefa ("mexer na lista em planilha") e nenhuma é do dia a
 * dia: importar acontece uma vez, no começo; exportar, no fechamento.
 *
 * Recolhidas aqui, o card volta a mostrar o que se usa toda hora — ver
 * equipe e o link de cadastro — e nada se perde.
 */
export default function PlanilhaModal({
  fornecedorId, eventoId, setorNome, dias = [],
}: {
  fornecedorId: string
  eventoId: string
  setorNome: string
  dias?: DiaDoEvento[]
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={`Planilhas do setor ${setorNome}`}
        title="Planilhas"
        className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-500 hover:bg-brand-50 transition-colors"
      >
        <FileSpreadsheet className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div
            className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="min-w-0">
                <h2 className="text-slate-800 font-bold">Planilhas</h2>
                <p className="text-slate-400 text-xs mt-0.5 truncate">{setorNome}</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-1">
              <ImportarFuncionarios fornecedorId={fornecedorId} variante="item" />
              <ExportarEquipe fornecedorId={fornecedorId} eventoId={eventoId} dias={dias} variante="item" />
            </div>
          </div>
        </div>
      )}
    </>
  )
}
