'use client'
import { useState } from 'react'
import { FileDown, AlertCircle, X, CalendarClock } from 'lucide-react'
import { exportarFuncionariosDoSetor } from '@/lib/actions'
import { exportarPlanilhaDeEquipe } from '@/lib/planilha'
import { mensagemAmigavel } from '@/lib/erros'

type Dia = { data: string; tipo: string }
type Tipo = 'entrada' | 'meio' | 'fim'

const ROTULO_TIPO: Record<Tipo, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

/** "2026-09-05" → "05/09". A data vem sem hora do banco — sem fuso a considerar. */
function dataCurta(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

export default function ExportarEquipe({ fornecedorId, eventoId, dias = [] }: { fornecedorId: string; eventoId: string; dias?: Dia[] }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [comFluxo, setComFluxo] = useState(false)
  const [dia, setDia] = useState(dias.find(d => d.tipo === 'principal')?.data ?? dias[0]?.data ?? '')
  const [tipos, setTipos] = useState<Tipo[]>(['entrada', 'meio', 'fim'])

  const alternarTipo = (t: Tipo) => {
    setTipos(atual => atual.includes(t) ? atual.filter(x => x !== t) : [...atual, t])
  }

  const exportar = async () => {
    setLoading(true)
    setErro(null)
    try {
      const filtro = comFluxo && dia && tipos.length ? { dataRef: dia, tipos } : undefined
      const { setorNome, eventoNome, funcionarios } = await exportarFuncionariosDoSetor(fornecedorId, eventoId, filtro)
      if (!funcionarios.length) {
        setErro('Este setor ainda não tem ninguém cadastrado.')
        return
      }
      await exportarPlanilhaDeEquipe(eventoNome, setorNome, funcionarios, filtro
        ? { diaLabel: dataCurta(filtro.dataRef), colunas: filtro.tipos }
        : undefined)
      setOpen(false)
    } catch (e: any) {
      setErro(mensagemAmigavel(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button onClick={() => { setErro(null); setOpen(true) }} className="btn btn-secundario btn-sm">
        <FileDown className="w-3.5 h-3.5 shrink-0" />
        Exportar planilha
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !loading && setOpen(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <h2 className="text-slate-800 font-bold">Exportar planilha</h2>
              <button onClick={() => setOpen(false)} disabled={loading} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-slate-500 text-xs">
                Sempre inclui nome, CPF, telefone e financeiro. Se quiser ver o fluxo do
                dia — quem já entrou, fez o meio ou saiu — marque abaixo.
              </p>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={comFluxo}
                  onChange={e => setComFluxo(e.target.checked)}
                  disabled={!dias.length}
                  className="w-4 h-4 mt-0.5 rounded border-slate-300 text-brand-500 focus:ring-brand-400 shrink-0"
                />
                <span className="text-sm text-slate-700">
                  <span className="flex items-center gap-1.5 font-medium"><CalendarClock className="w-3.5 h-3.5 text-slate-400" /> Incluir horário de presença de um dia</span>
                  {!dias.length && <span className="block text-slate-400 text-xs mt-0.5">Este evento ainda não tem dias configurados.</span>}
                </span>
              </label>

              {comFluxo && dias.length > 0 && (
                <div className="pl-6 space-y-3">
                  <div>
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">Dia</p>
                    <select value={dia} onChange={e => setDia(e.target.value)} className="input text-sm">
                      {dias.map(d => (
                        <option key={d.data} value={d.data}>
                          {dataCurta(d.data)} {d.tipo === 'principal' ? '— dia do evento' : '— montagem/preparação'}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-1.5">Etapas</p>
                    <div className="flex flex-wrap gap-3">
                      {(['entrada', 'meio', 'fim'] as Tipo[]).map(t => (
                        <label key={t} className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={tipos.includes(t)}
                            onChange={() => alternarTipo(t)}
                            className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400"
                          />
                          {ROTULO_TIPO[t]}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {erro && (
                <p className="flex items-center gap-1 text-red-500 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {erro}
                </p>
              )}

              <button
                onClick={exportar}
                disabled={loading || (comFluxo && (!dia || tipos.length === 0))}
                className="btn btn-primario w-full disabled:opacity-50"
              >
                {loading ? 'Gerando...' : 'Baixar planilha'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
