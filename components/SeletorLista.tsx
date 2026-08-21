'use client'
import { useState } from 'react'
import { ChevronDown, Search } from 'lucide-react'

/**
 * Seletor de item numa lista, no mesmo desenho do DateTimePicker.
 *
 * Existe porque `<select>` nativo destoa do resto do sistema: ele herda a
 * aparência do sistema operacional, não respeita a altura nem o raio dos
 * campos, e no Windows abre uma lista cinza que não parece do produto. Onde a
 * escolha é o passo principal da tela — não um detalhe de formulário — vale o
 * mesmo tratamento que a data e a hora recebem.
 *
 * Um `<select>` continua sendo a escolha certa para lista curta e secundária
 * (tolerância, status). Aqui a lista é de eventos, com nome longo e data.
 */

export type OpcaoLista = {
  valor: string
  rotulo: string
  /** Linha de apoio abaixo do rótulo — data, organização, situação. */
  detalhe?: string
  desabilitada?: boolean
}

export default function SeletorLista({
  opcoes, valor, onChange, placeholder = 'Escolher…', titulo = 'Escolha uma opção',
  vazio = 'Nada para escolher', busca = false, className = '',
}: {
  opcoes: OpcaoLista[]
  valor: string
  onChange: (valor: string) => void
  placeholder?: string
  /** Cabeçalho do modal. */
  titulo?: string
  vazio?: string
  /** Campo de busca — só faz sentido quando a lista pode ficar longa. */
  busca?: boolean
  className?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')

  const escolhida = opcoes.find(o => o.valor === valor)
  const filtradas = termo.trim()
    ? opcoes.filter(o => `${o.rotulo} ${o.detalhe ?? ''}`.toLowerCase().includes(termo.trim().toLowerCase()))
    : opcoes

  const escolher = (v: string) => {
    onChange(v)
    setAberto(false)
    setTermo('')
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`input flex items-center justify-between gap-2 text-left ${className}`}
      >
        <span className={`truncate ${escolhida ? 'text-slate-800' : 'text-slate-400'}`}>
          {escolhida ? escolhida.rotulo : placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      </button>

      {aberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setAberto(false)}>
          <div className="overlay-fade-in absolute inset-0 bg-black/45" />
          <div
            className="modal-pop-in relative bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]"
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 pt-5 pb-3 shrink-0">
              <p className="text-sm font-bold text-slate-800">{titulo}</p>
              {busca && (
                <div className="relative mt-3">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    autoFocus
                    value={termo}
                    onChange={e => setTermo(e.target.value)}
                    placeholder="Buscar…"
                    className="input"
                    style={{ paddingLeft: 36 }}
                  />
                </div>
              )}
            </div>

            <div className="overflow-y-auto px-3 pb-3 space-y-1.5 flex-1">
              {!filtradas.length ? (
                <p className="text-slate-500 text-sm text-center py-10">
                  {termo ? 'Nada encontrado para esta busca.' : vazio}
                </p>
              ) : (
                filtradas.map(o => {
                  const ativa = o.valor === valor
                  return (
                    <button
                      key={o.valor}
                      type="button"
                      disabled={o.desabilitada}
                      onClick={() => escolher(o.valor)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl border transition-colors disabled:opacity-40 ${
                        ativa
                          ? 'bg-brand-500 border-brand-500 text-white'
                          : 'bg-white border-slate-200 text-slate-700 hover:border-brand-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="block text-sm font-medium truncate">{o.rotulo}</span>
                      {o.detalhe && (
                        <span className={`block text-xs truncate ${ativa ? 'text-white/70' : 'text-slate-500'}`}>
                          {o.detalhe}
                        </span>
                      )}
                    </button>
                  )
                })
              )}
            </div>

            <div className="flex items-center justify-end border-t border-slate-100 px-5 py-4 bg-slate-50 shrink-0">
              <button
                type="button"
                onClick={() => { setAberto(false); setTermo('') }}
                className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
