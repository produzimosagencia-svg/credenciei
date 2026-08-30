'use client'
import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Check, X, Search } from 'lucide-react'

/**
 * Copiar os links de cadastro de vários setores de uma vez.
 *
 * O caminho de antes era abrir setor por setor e clicar em "Link do
 * formulário" em cada um — num evento com sete setores, sete idas e vindas, e
 * depois montar a mensagem à mão. Aqui sai tudo já formatado, pronto para
 * colar no WhatsApp.
 *
 * O texto vai como `Setor - link`, uma linha por setor, porque é assim que ele
 * vai ser lido do outro lado: quem recebe precisa saber qual link é de qual
 * equipe. Uma lista de URLs soltas obrigaria a explicar depois.
 */

export type SetorParaCopiar = {
  id: string
  nome: string
  /** Sem token não há link — o setor aparece marcado como indisponível. */
  token: string | null
}

/**
 * Monta o texto final.
 *
 * Uma LINHA EM BRANCO entre os setores, e o link embaixo do nome — não tudo
 * numa linha corrida.
 *
 * A primeira versão colava um por linha, e com vinte setores virava um
 * paredão: o WhatsApp quebra cada URL em duas ou três linhas, e sem respiro
 * entre os itens não dá para saber onde um termina e o outro começa. Quem
 * recebe precisa achar UM link no meio de vinte — a separação é o que torna
 * isso possível de bater o olho.
 *
 * O nome vai em negrito do WhatsApp (`*Bar*`). Lá ele aparece destacado; em
 * outros lugares os asteriscos ficam visíveis, e mesmo assim marcam onde cada
 * item começa. É o único formato que serve razoavelmente aos dois destinos —
 * e o WhatsApp é para onde isto vai em nove de cada dez vezes.
 */
export function montarTexto(setores: SetorParaCopiar[], origem: string): string {
  return setores
    // Setor sem link não entra: uma linha "Bar - " no meio da mensagem faria
    // quem recebe achar que o link se perdeu no caminho.
    .filter(s => s.token)
    .map(s => `*${s.nome}*\n${origem}/form/${s.token}`)
    .join('\n\n')
}

export default function CopiarLinks({ setores }: { setores: SetorParaCopiar[] }) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [aviso, setAviso] = useState<string | null>(null)

  const comLink = useMemo(() => setores.filter(s => s.token), [setores])
  const semLink = setores.length - comLink.length

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return t ? setores.filter(s => s.nome.toLowerCase().includes(t)) : setores
  }, [setores, busca])

  // Abre com todos marcados: copiar tudo é o caso comum, e desmarcar dois é
  // menos trabalho do que marcar cinco.
  useEffect(() => {
    if (aberto) {
      setMarcados(new Set(comLink.map(s => s.id)))
      setBusca('')
    }
  }, [aberto, comLink])

  // O aviso some sozinho — quem copiou já foi colar em outro lugar.
  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 2600)
    return () => clearTimeout(t)
  }, [aviso])

  const alternar = (id: string) =>
    setMarcados(atual => {
      const proximo = new Set(atual)
      if (proximo.has(id)) proximo.delete(id)
      else proximo.add(id)
      return proximo
    })

  const copiar = async (quais: SetorParaCopiar[]) => {
    const texto = montarTexto(quais, window.location.origin)
    if (!texto) {
      setAviso('Nenhum setor selecionado tem link.')
      return
    }
    try {
      await navigator.clipboard.writeText(texto)
      const n = texto.split('\n').length
      setAviso(`${n} link${n === 1 ? '' : 's'} copiado${n === 1 ? '' : 's'}.`)
      setAberto(false)
    } catch {
      /*
       * A área de transferência pode ser negada — acontece em navegador sem
       * HTTPS ou quando a permissão foi recusada. Dizer só "não foi possível"
       * deixaria a pessoa sem saída; o texto fica na tela para copiar à mão.
       */
      setAviso('Seu navegador bloqueou a cópia. O texto está na tela para copiar à mão.')
    }
  }

  if (!setores.length) return null

  const selecionados = comLink.filter(s => marcados.has(s.id))

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="btn btn-secundario btn-sm"
        title="Copiar os links de cadastro de vários setores de uma vez"
      >
        <ClipboardList className="w-3.5 h-3.5 shrink-0" />
        Copiar links
      </button>

      {/* O aviso vive fora do modal: ele precisa continuar visível depois que
          o modal fecha, que é justamente quando a cópia deu certo. */}
      {aviso && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] max-w-[92vw]
                     bg-slate-900 text-white text-sm rounded-xl px-4 py-3 shadow-2xl
                     flex items-center gap-2"
        >
          <Check className="w-4 h-4 shrink-0 text-green-400" />
          {aviso}
        </div>
      )}

      {aberto && (
        <div className="fixed inset-0 z-[80] bg-slate-900/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">

            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="min-w-0">
                <h2 className="font-bold text-slate-900">Copiar links</h2>
                <p className="text-slate-500 text-xs mt-0.5">
                  Nome do setor em negrito, link embaixo, um bloco por setor
                </p>
              </div>
              <button
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="p-1 -mr-1 text-slate-400 hover:text-slate-700 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* A busca só aparece quando a lista é grande o bastante para
                justificar — com quatro setores ela seria só mais um campo. */}
            {setores.length > 6 && (
              <div className="px-5 pt-4">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    value={busca}
                    onChange={e => setBusca(e.target.value)}
                    placeholder="Filtrar setores…"
                    className="input pl-9 text-sm"
                  />
                </div>
              </div>
            )}

            <div className="px-5 py-4 overflow-y-auto flex-1 space-y-1">
              <button
                onClick={() =>
                  setMarcados(
                    selecionados.length === comLink.length
                      ? new Set()
                      : new Set(comLink.map(s => s.id)),
                  )
                }
                className="text-brand-600 text-xs font-semibold hover:underline mb-2"
              >
                {selecionados.length === comLink.length ? 'Desmarcar todos' : 'Selecionar todos'}
              </button>

              {visiveis.map(s => {
                const temLink = !!s.token
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                      temLink ? 'hover:bg-slate-50 cursor-pointer' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <input
                      type="checkbox"
                      disabled={!temLink}
                      checked={marcados.has(s.id)}
                      onChange={() => alternar(s.id)}
                      className="w-4 h-4 rounded border-slate-300 text-brand-500 focus:ring-brand-400 shrink-0"
                    />
                    <span className="text-slate-800 text-sm truncate flex-1">{s.nome}</span>
                    {!temLink && <span className="text-slate-400 text-2xs shrink-0">sem link</span>}
                  </label>
                )
              })}

              {!visiveis.length && (
                <p className="text-slate-400 text-sm text-center py-4">Nenhum setor com esse nome.</p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-slate-100 space-y-2">
              {semLink > 0 && (
                <p className="text-slate-400 text-2xs">
                  {semLink} setor{semLink === 1 ? '' : 'es'} sem link de formulário {semLink === 1 ? 'fica' : 'ficam'} de fora.
                </p>
              )}
              <button
                onClick={() => copiar(selecionados)}
                disabled={!selecionados.length}
                className="btn btn-primario btn-lg w-full disabled:opacity-50"
              >
                <ClipboardList className="w-4 h-4" />
                Copiar {selecionados.length} selecionado{selecionados.length === 1 ? '' : 's'}
              </button>
              <button
                onClick={() => copiar(comLink)}
                className="btn btn-secundario w-full"
              >
                Copiar todos ({comLink.length})
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
