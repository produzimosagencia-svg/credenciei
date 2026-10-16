'use client'
import { useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, UserPlus, Check, CheckCircle2, Pencil, Trash2, RotateCcw, Eye, EyeOff, ListChecks, AlertTriangle } from 'lucide-react'
import { confirmarEntradaNaLista, desfazerEntradaNaLista, tirarDaLista, buscarCpfNaListaManual } from '@/lib/actions-lista-manual'
import { bateComABusca, type PessoaDaLista } from '@/lib/lista-manual-regras'
import { formatCpf, formatTelefone } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Secao, EmptyState, Badge } from '@/components/ui/Superficie'
import SeletorLista from '@/components/SeletorLista'
import ConfirmModal from '@/components/ConfirmModal'
import FormPessoaLista from './FormPessoaLista'

/** Quantas pessoas a lista desenha de cada vez (lista grande num celular de portaria). */
const POR_PAGINA = 60

type Situacao = 'todos' | 'aguardando' | 'presentes'
type AvisoDaTela = { tom: 'sucesso' | 'atencao' | 'erro'; texto: string }

const TOM_DO_AVISO: Record<AvisoDaTela['tom'], string> = {
  sucesso: 'bg-green-50 border-green-200 text-green-800',
  atencao: 'bg-amber-50 border-amber-300 text-amber-900',
  erro: 'bg-red-50 border-red-200 text-red-700',
}

/**
 * A lista manual de um evento (Juan, 16/10/2026) — feita para a portaria: busca por nome ou CPF, o "Confirmar
 * entrada" à vista em cada pessoa, quem já entrou em verde com o horário e quem confirmou. Quem gerencia a lista
 * também cadastra, corrige, tira da lista e desfaz uma entrada (com motivo).
 *
 * A lista vem do servidor (de novo a cada 15s — `AutoRefresh` na página — e depois de cada ação); o que esta tela
 * acabou de fazer aparece na hora, por cima, até o servidor confirmar.
 */
export default function PainelListaManual({
  eventoId, pessoas: doServidor, podeGerenciar, podeConfirmar, acontecendoHoje, categorias,
}: {
  eventoId: string
  pessoas: PessoaDaLista[]
  podeGerenciar: boolean
  /** Confirmar a entrada (master/admin). Sem isto a tela é só consulta — o operador de portão, por padrão. */
  podeConfirmar: boolean
  /** A entrada só é confirmada nos dias do evento (como o scanner). */
  acontecendoHoje: boolean
  categorias: string[]
}) {
  const router = useRouter()
  const [pessoas, setPessoas] = useState(doServidor)
  const [ultimaDoServidor, setUltimaDoServidor] = useState(doServidor)
  // Chegou uma lista nova do servidor: ela é a verdade (já inclui o que esta tela fez).
  if (doServidor !== ultimaDoServidor) {
    setUltimaDoServidor(doServidor)
    setPessoas(doServidor)
  }
  const trocar = (p: PessoaDaLista) => setPessoas(lista => lista.map(x => (x.id === p.id ? p : x)))

  const [busca, setBusca] = useState('')
  const [idsDoCpf, setIdsDoCpf] = useState<Set<string> | null>(null)
  const [categoria, setCategoria] = useState('')
  const [situacao, setSituacao] = useState<Situacao>('todos')
  const [pagina, setPagina] = useState(1)
  const [aviso, setAviso] = useState<AvisoDaTela | null>(null)
  const [confirmando, setConfirmando] = useState<string | null>(null)
  const [cpfAberto, setCpfAberto] = useState<Set<string>>(new Set())
  const campoBusca = useRef<HTMLInputElement>(null)

  /*
   * CPF de quem só vê a máscara (operador de portão): a busca vai ao servidor, que devolve só os ids que batem — o
   * CPF inteiro nunca chega a esta tela. Quem gerencia já tem o CPF e filtra aqui mesmo.
   */
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimaBuscaCpf = useRef('')
  const aoBuscar = (valor: string) => {
    setBusca(valor)
    setPagina(1)
    if (podeGerenciar) return
    if (relogio.current) clearTimeout(relogio.current)
    const digitos = valor.replace(/\D/g, '')
    ultimaBuscaCpf.current = digitos
    if (digitos.length < 3) { setIdsDoCpf(null); return }
    relogio.current = setTimeout(async () => {
      const r = await buscarCpfNaListaManual(eventoId, digitos)
      if (ultimaBuscaCpf.current !== digitos) return
      setIdsDoCpf('erro' in r ? new Set() : new Set(r.ids))
    }, 250)
  }

  const contagem = useMemo(() => {
    const presentes = pessoas.filter(p => p.presenteEm).length
    return { total: pessoas.length, presentes, aguardando: pessoas.length - presentes }
  }, [pessoas])

  const digitosDaBusca = busca.replace(/\D/g, '')
  const filtradas = useMemo(() => pessoas.filter(p => {
    if (categoria && p.categoria !== categoria) return false
    if (situacao === 'aguardando' && p.presenteEm) return false
    if (situacao === 'presentes' && !p.presenteEm) return false
    if (!busca.trim()) return true
    if (bateComABusca(p, busca)) return true
    return !podeGerenciar && digitosDaBusca.length >= 3 && !!idsDoCpf?.has(p.id)
  }), [pessoas, categoria, situacao, busca, digitosDaBusca, idsDoCpf, podeGerenciar])
  const naTela = filtradas.slice(0, pagina * POR_PAGINA)

  // ── Confirmar entrada ─────────────────────────────────────────────────────
  const [, startConfirmar] = useTransition()
  const confirmar = (p: PessoaDaLista) => {
    setAviso(null)
    setConfirmando(p.id)
    startConfirmar(async () => {
      const r = await confirmarEntradaNaLista(eventoId, p.id)
      setConfirmando(null)
      if ('erro' in r) { setAviso({ tom: 'erro', texto: r.erro }); return }
      trocar(r.pessoa)
      if ('jaEntrou' in r) {
        setAviso({
          tom: 'atencao',
          texto: `${r.pessoa.nome} JÁ ENTROU às ${formatarBR(r.pessoa.presenteEm, 'curto')}${r.pessoa.confirmadoPor ? ` (confirmado por ${r.pessoa.confirmadoPor})` : ''}. Não registre de novo.`,
        })
      } else {
        setAviso({ tom: 'sucesso', texto: `Entrada de ${r.pessoa.nome} confirmada às ${formatarBR(r.pessoa.presenteEm, 'hora')}.` })
        // Pronto para a próxima pessoa da fila.
        aoBuscar('')
        campoBusca.current?.focus()
      }
      router.refresh()
    })
  }

  // ── Gerenciar: cadastrar / corrigir / tirar / desfazer ───────────────────
  const [formulario, setFormulario] = useState<{ pessoa?: PessoaDaLista } | null>(null)
  const [paraTirar, setParaTirar] = useState<PessoaDaLista | null>(null)
  const [paraDesfazer, setParaDesfazer] = useState<PessoaDaLista | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erroModal, setErroModal] = useState<string | null>(null)
  const [salvando, startSalvar] = useTransition()

  const aoSalvar = (p: PessoaDaLista, nova: boolean, avisado: boolean) => {
    setFormulario(null)
    setPessoas(lista => (nova ? [...lista, p].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')) : lista.map(x => (x.id === p.id ? p : x))))
    setAviso({ tom: 'sucesso', texto: nova ? `${p.nome} entrou na lista (${p.categoria}).${avisado ? ' O aviso foi para o WhatsApp.' : ''}` : `Cadastro de ${p.nome} corrigido.` })
    router.refresh()
  }

  const confirmarTirar = () => {
    if (!paraTirar) return
    const p = paraTirar
    setErroModal(null)
    startSalvar(async () => {
      const r = await tirarDaLista(eventoId, p.id, motivo)
      if ('erro' in r) { setErroModal(r.erro); return }
      setParaTirar(null)
      setPessoas(lista => lista.filter(x => x.id !== p.id))
      setAviso({ tom: 'sucesso', texto: `${p.nome} saiu da lista.` })
      router.refresh()
    })
  }

  const confirmarDesfazer = () => {
    if (!paraDesfazer) return
    const p = paraDesfazer
    if (motivo.trim().length < 5) { setErroModal('Escreva o motivo — ele fica na auditoria.'); return }
    setErroModal(null)
    startSalvar(async () => {
      const r = await desfazerEntradaNaLista(eventoId, p.id, motivo)
      if ('erro' in r) { setErroModal(r.erro); return }
      setParaDesfazer(null)
      trocar(r.pessoa)
      setAviso({ tom: 'sucesso', texto: `Entrada de ${p.nome} desfeita — voltou para "aguardando".` })
      router.refresh()
    })
  }

  const abrirCpf = (id: string) => setCpfAberto(atual => {
    const novo = new Set(atual)
    if (novo.has(id)) novo.delete(id)
    else novo.add(id)
    return novo
  })

  const filtroAtivo = !!busca.trim() || !!categoria || situacao !== 'todos'

  return (
    <div className="space-y-4">
      {/* Contadores — também são o filtro de situação. */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        {([
          ['todos', 'Na lista', contagem.total, 'text-slate-800', 'border-slate-300 ring-2 ring-slate-100'],
          ['aguardando', 'Aguardando', contagem.aguardando, 'text-amber-600', 'border-amber-300 ring-2 ring-amber-100'],
          ['presentes', 'Já entraram', contagem.presentes, 'text-green-600', 'border-green-200 ring-2 ring-green-100'],
        ] as const).map(([valor, rotulo, n, cor, ativo]) => (
          <button
            key={valor} type="button" onClick={() => { setSituacao(valor); setPagina(1) }}
            className={`text-left bg-white border rounded-2xl p-3 sm:p-4 transition-colors ${situacao === valor ? ativo : 'border-slate-200 hover:border-slate-300'}`}
          >
            <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">{rotulo}</p>
            <p className={`text-2xl font-extrabold mt-1 tabular-nums ${cor}`}>{n}</p>
          </button>
        ))}
      </div>

      {!acontecendoHoje && podeConfirmar && (
        <p className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-600">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-slate-400" />
          Hoje não é dia deste evento: a lista pode ser consultada, mas a entrada só é confirmada nos dias do evento.
        </p>
      )}

      {aviso && (
        <div className={`flex items-start justify-between gap-3 border rounded-xl px-4 py-3 text-sm font-medium ${TOM_DO_AVISO[aviso.tom]}`} role="status">
          <span className="flex items-start gap-2 min-w-0">
            {aviso.tom === 'sucesso' ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
            <span className="min-w-0">{aviso.texto}</span>
          </span>
          <button type="button" onClick={() => setAviso(null)} className="opacity-60 hover:opacity-100 shrink-0" aria-label="Fechar aviso"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            ref={campoBusca}
            value={busca}
            onChange={e => aoBuscar(e.target.value)}
            placeholder="Buscar por nome ou CPF"
            className="input pl-11 pr-10 py-3 text-base"
            autoComplete="off"
            enterKeyHint="search"
            aria-label="Buscar por nome ou CPF"
          />
          {busca && (
            <button type="button" onClick={() => { aoBuscar(''); campoBusca.current?.focus() }} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label="Limpar busca">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <SeletorLista
          className="w-full sm:w-56" valor={categoria} onChange={v => { setCategoria(v); setPagina(1) }}
          placeholder="Categoria" titulo="Categoria"
          opcoes={[{ valor: '', rotulo: 'Todas as categorias' }, ...categorias.map(c => ({ valor: c, rotulo: c }))]}
        />
        {podeGerenciar && (
          <button type="button" onClick={() => setFormulario({})} className="btn btn-primario justify-center shrink-0">
            <UserPlus className="w-4 h-4 shrink-0" /> Adicionar pessoa à lista
          </button>
        )}
      </div>

      <Secao
        tom="acento"
        icone={<ListChecks className="w-3.5 h-3.5" />}
        titulo={filtroAtivo ? `${filtradas.length} de ${pessoas.length} na lista` : `${pessoas.length} pessoa${pessoas.length === 1 ? '' : 's'} na lista`}
        corpoClassName={naTela.length ? '' : 'p-4'}
      >
        {!pessoas.length ? (
          <EmptyState
            icone={<ListChecks className="w-7 h-7" />}
            titulo="Ninguém na lista ainda"
            descricao={podeGerenciar
              ? 'Cadastre convidados, prestadores e equipe que entram sem QR Code — na portaria basta mostrar o documento.'
              : 'Quem gerencia o evento ainda não cadastrou ninguém nesta lista.'}
            acao={podeGerenciar ? <button type="button" onClick={() => setFormulario({})} className="btn btn-primario"><UserPlus className="w-4 h-4" /> Adicionar pessoa à lista</button> : undefined}
          />
        ) : !naTela.length ? (
          <EmptyState
            icone={<Search className="w-7 h-7" />}
            titulo="Ninguém encontrado"
            descricao="Confira o nome ou o CPF (ou limpe os filtros). Quem não está na lista não tem a entrada liberada por aqui."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {naTela.map(p => {
              const cpfInteiroAberto = podeGerenciar && !!p.cpf && cpfAberto.has(p.id)
              return (
                <li key={p.id} className={`px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 ${p.presenteEm ? 'bg-green-50' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-800 font-semibold text-base break-words">{p.nome}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <Badge tom="marca">{p.categoria}</Badge>
                      {p.cpfMascarado ? (
                        <span className="inline-flex items-center gap-1 font-mono tabular-nums">
                          CPF {cpfInteiroAberto ? formatCpf(p.cpf ?? '') : p.cpfMascarado}
                          {podeGerenciar && p.cpf && (
                            <button type="button" onClick={() => abrirCpf(p.id)} className="text-slate-300 hover:text-slate-600" aria-label={cpfInteiroAberto ? 'Esconder o CPF' : 'Mostrar o CPF inteiro'} title={cpfInteiroAberto ? 'Esconder o CPF' : 'Mostrar o CPF inteiro'}>
                              {cpfInteiroAberto ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">Sem CPF — confira pelo nome no documento</span>
                      )}
                      {p.telefone && <span className="tabular-nums">{formatTelefone(p.telefone)}</span>}
                    </div>
                  </div>

                  <div className="shrink-0 flex items-center gap-2 sm:justify-end">
                    {p.presenteEm ? (
                      <div className="flex-1 sm:flex-none rounded-xl bg-green-100 border border-green-200 px-3 py-2 text-green-800">
                        <p className="flex items-center gap-1.5 text-sm font-bold"><CheckCircle2 className="w-4 h-4 shrink-0" /> Entrou {formatarBR(p.presenteEm, 'curto')}</p>
                        {p.confirmadoPor && <p className="text-green-700 text-2xs mt-0.5">Confirmado por {p.confirmadoPor}</p>}
                      </div>
                    ) : podeConfirmar ? (
                      <button
                        type="button" onClick={() => confirmar(p)} disabled={!acontecendoHoje || confirmando === p.id}
                        className="btn btn-primario flex-1 sm:flex-none justify-center py-2.5 px-4 disabled:opacity-50"
                        title={acontecendoHoje ? 'Conferiu o documento? Confirme a entrada' : 'Só nos dias do evento'}
                      >
                        <Check className="w-4 h-4 shrink-0" /> {confirmando === p.id ? 'Confirmando…' : 'Confirmar entrada'}
                      </button>
                    ) : (
                      <Badge tom="atencao">Aguardando</Badge>
                    )}
                    {podeGerenciar && (
                      <div className="flex items-center">
                        <button type="button" onClick={() => setFormulario({ pessoa: p })} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50" aria-label={`Corrigir o cadastro de ${p.nome}`} title="Corrigir o cadastro">
                          <Pencil className="w-4 h-4" />
                        </button>
                        {p.presenteEm ? (
                          <button type="button" onClick={() => { setMotivo(''); setErroModal(null); setParaDesfazer(p) }} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50" aria-label={`Desfazer a entrada de ${p.nome}`} title="Desfazer a entrada (confirmada por engano)">
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        ) : (
                          <button type="button" onClick={() => { setMotivo(''); setErroModal(null); setParaTirar(p) }} className="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50" aria-label={`Tirar ${p.nome} da lista`} title="Tirar da lista">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {filtradas.length > naTela.length && (
          <div className="p-3 border-t border-slate-100 text-center">
            <button type="button" onClick={() => setPagina(n => n + 1)} className="btn btn-secundario btn-sm">
              Mostrar mais ({filtradas.length - naTela.length})
            </button>
          </div>
        )}
      </Secao>

      {formulario && (
        <FormPessoaLista eventoId={eventoId} categorias={categorias} pessoa={formulario.pessoa} onFechar={() => setFormulario(null)} onSalvo={aoSalvar} />
      )}

      <ConfirmModal
        open={!!paraTirar}
        onClose={() => !salvando && setParaTirar(null)}
        onConfirm={confirmarTirar}
        isPending={salvando}
        titulo="Tirar da lista"
        labelConfirmar="Tirar da lista"
        labelConfirmando="Tirando…"
        mensagem={paraTirar ? `Tirar "${paraTirar.nome}" da lista deste evento? A entrada dela deixa de estar liberada por aqui. O histórico (quem cadastrou e quando) fica na auditoria.` : ''}
      >
        <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} className="input text-sm" placeholder="Motivo (opcional — vai para a auditoria)" />
        {erroModal && <p className="text-red-600 text-xs mt-1.5">{erroModal}</p>}
      </ConfirmModal>

      <ConfirmModal
        open={!!paraDesfazer}
        onClose={() => !salvando && setParaDesfazer(null)}
        onConfirm={confirmarDesfazer}
        isPending={salvando}
        titulo="Desfazer a entrada"
        labelConfirmar="Desfazer a entrada"
        labelConfirmando="Desfazendo…"
        mensagem={paraDesfazer ? `A entrada de "${paraDesfazer.nome}" (${formatarBR(paraDesfazer.presenteEm, 'curto')}) volta para "aguardando". Use só para corrigir uma confirmação feita por engano.` : ''}
      >
        <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} className="input text-sm" placeholder="Motivo (obrigatório — vai para a auditoria)" />
        {erroModal && <p className="text-red-600 text-xs mt-1.5">{erroModal}</p>}
      </ConfirmModal>
    </div>
  )
}
