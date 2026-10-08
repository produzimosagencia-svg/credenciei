'use client'
import { Suspense, useMemo, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarDays, Check, ChevronDown, ChevronRight, Search, X, Building2, Layers } from 'lucide-react'
import { LogoLoading } from '@/components/LogoLoading'
import { entrarNoEventoSupervisor } from '@/lib/actions'
import { escolherEventoDoGestor } from '@/lib/actions-funcoes'
import { mensagemAmigavel } from '@/lib/erros'
import { chaveBusca } from '@/lib/format'
import type { ContextoDeEventos, NoEvento } from '@/lib/contexto-eventos-tipos'

/**
 * O seletor de evento do topo — Evento › Subevento › Fornecedor (pedido do Juan, 07/10/2026).
 *
 * Vale pra todo acesso que tem mais de um evento ligado ao CPF: mostra EM QUAL evento a pessoa
 * está e deixa trocar sem voltar ao menu. O que a árvore traz depende do papel (ver
 * `contextoDeEventos`): o supervisor escolhe até o fornecedor; o Gestor de credenciamento só o
 * evento, porque o acesso dele é do evento inteiro.
 *
 * Com um evento só, vira uma etiqueta (diz onde a pessoa está, sem oferecer escolha nenhuma).
 */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

function Seletor({ contexto }: { contexto: ContextoDeEventos | null }) {
  const pathname = usePathname()
  const router = useRouter()
  const eventoDaUrl = useSearchParams().get('evento')?.toLowerCase() ?? null
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Onde a pessoa está: o setor ativo do supervisor, ou o que a própria URL diz (evento / setor do Encarregado).
  const atualId = useMemo(() => {
    if (!contexto) return null
    const doCaminho = pathname.match(new RegExp(`/admin/eventos/(${UUID})`, 'i'))?.[1]?.toLowerCase()
    if (doCaminho && contexto.eventos.some(e => e.id === doCaminho)) return doCaminho
    const setorDoCaminho = pathname.match(new RegExp(`/encarregado/(${UUID})`, 'i'))?.[1]?.toLowerCase()
    if (setorDoCaminho) {
      const e = contexto.eventos.find(ev => ev.subeventos.some(s => s.setores.some(st => st.id === setorDoCaminho)))
      if (e) return e.id
    }
    // `?evento=` (Gestor de credenciamento escolheu o evento na boas-vindas, por exemplo).
    if (eventoDaUrl && contexto.eventos.some(e => e.id === eventoDaUrl)) return eventoDaUrl
    return contexto.atual.eventoId
  }, [contexto, pathname, eventoDaUrl])

  const termo = chaveBusca(busca)
  const eventos = useMemo(() => {
    if (!contexto) return []
    if (!termo) return contexto.eventos
    // Filtra por evento, subevento ou fornecedor — mantém só o ramo que bate.
    return contexto.eventos.flatMap((e): NoEvento[] => {
      if (chaveBusca(e.nome).includes(termo)) return [e]
      const subs = e.subeventos.flatMap(s => {
        if (chaveBusca(s.nome).includes(termo)) return [s]
        const setores = s.setores.filter(st => chaveBusca(st.nome).includes(termo))
        return setores.length ? [{ ...s, setores }] : []
      })
      return subs.length ? [{ ...e, subeventos: subs }] : []
    })
  }, [contexto, termo])

  if (!contexto || !contexto.eventos.length) return null

  const atual = contexto.eventos.find(e => e.id === atualId) ?? null
  const setorAtual = contexto.atual.setorId
  const rotulo = atual?.nome ?? 'Escolher evento'
  const comEscolha = contexto.eventos.length > 1

  // Um evento só: só diz onde a pessoa está.
  if (!comEscolha) {
    return atual ? (
      <span className="hidden md:inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 min-w-0 max-w-[16rem]" title={atual.nome}>
        <CalendarDays className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{atual.nome}</span>
      </span>
    ) : null
  }

  const fechar = () => { if (!isPending) { setAberto(false); setBusca(''); setErro(null) } }

  const irPara = (destino: string) => { setAberto(false); setBusca(''); router.push(destino) }

  const escolherSetor = (e: NoEvento, setorId: string) => {
    setErro(null)
    if (contexto.modo === 'encarregado') return irPara(`/encarregado/${setorId}`)
    if (contexto.modo !== 'supervisor') return irPara(`/admin/eventos/${e.id}`)
    startTransition(async () => {
      // Grava o setor ativo ANTES de navegar: as outras telas (pendências, atividades, scanner) leem só o ativo.
      let r: Awaited<ReturnType<typeof entrarNoEventoSupervisor>>
      try { r = await entrarNoEventoSupervisor(e.id, setorId) } catch (err) { setErro(mensagemAmigavel(err)); return }
      if (!r.ok) { setErro(r.error ?? 'Não foi possível trocar de evento.'); return }
      setAberto(false); setBusca('')
      router.push(`/admin/eventos/${r.eventoId}/fornecedor/${r.fornecedorId}`)
      router.refresh()
    })
  }

  const escolherEvento = (e: NoEvento) => {
    // Quem tem setores escolhe o setor (a árvore abre); os demais vão direto ao evento.
    if (contexto.modo === 'supervisor' || contexto.modo === 'encarregado') {
      setExpandido(x => x === e.id ? null : e.id)
      return
    }
    if (contexto.modo === 'portao') {
      // O evento pode ser de outra organização em que ele também é Gestor: o servidor ajusta o contexto e a página recarrega inteira.
      setErro(null)
      startTransition(async () => {
        const r = await escolherEventoDoGestor(e.id)
        if ('erro' in r) { setErro(r.erro); return }
        window.location.assign(`/admin/bem-vindo?evento=${e.id}`)
      })
      return
    }
    irPara(`/admin/eventos/${e.id}`)
  }

  const comSetores = contexto.modo === 'supervisor' || contexto.modo === 'encarregado'

  return (
    <>
      <button
        type="button"
        onClick={() => { setExpandido(atualId); setAberto(true) }}
        className="btn btn-secundario btn-sm shrink-0 min-w-0"
        aria-haspopup="dialog"
        title={atual ? `Evento: ${atual.nome} — trocar` : 'Escolher o evento'}
      >
        <CalendarDays className="w-3.5 h-3.5 shrink-0" />
        <span className="hidden sm:inline truncate max-w-[9rem] lg:max-w-[14rem]">{rotulo}</span>
        <ChevronDown className="w-3 h-3 shrink-0 opacity-60" />
      </button>

      {aberto && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" onClick={fechar}>
          <div className="overlay-fade-in absolute inset-0 bg-black/50" />
          <div
            role="dialog"
            aria-label="Escolher evento"
            className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
              <div className="min-w-0">
                <h2 className="text-slate-800 font-bold">Seus eventos</h2>
                <p className="text-slate-400 text-xs mt-0.5">
                  {comSetores
                    ? 'Escolha o evento e o fornecedor em que você quer trabalhar.'
                    : 'Escolha o evento em que você quer trabalhar.'}
                </p>
              </div>
              <button onClick={fechar} disabled={isPending} aria-label="Fechar"
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 pt-3">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Filtrar por evento, subevento ou fornecedor…"
                  className="input pl-9 text-sm"
                />
              </div>
            </div>

            <div className="p-2 overflow-y-auto">
              {!eventos.length && <p className="text-slate-400 text-sm px-3 py-3">Nada encontrado com “{busca}”.</p>}
              {eventos.map(e => {
                const ehAtual = e.id === atualId
                const aberta = !!termo || expandido === e.id
                return (
                  <div key={e.id} className="mb-1">
                    <button
                      type="button"
                      onClick={() => escolherEvento(e)}
                      disabled={isPending}
                      className={`w-full flex items-center gap-2.5 text-left px-3 py-3 rounded-xl transition-colors disabled:opacity-50 ${ehAtual ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                    >
                      <CalendarDays className={`w-4 h-4 shrink-0 ${ehAtual ? 'text-brand-500' : 'text-slate-300'}`} />
                      <span className={`flex-1 min-w-0 truncate text-sm ${ehAtual ? 'text-brand-700 font-semibold' : 'text-slate-800 font-medium'}`}>{e.nome}</span>
                      {!e.ativo && <span className="text-2xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-semibold shrink-0">Encerrado</span>}
                      {comSetores
                        ? <ChevronDown className={`w-4 h-4 text-slate-300 shrink-0 transition-transform ${aberta ? 'rotate-180' : ''}`} />
                        : ehAtual ? <Check className="w-4 h-4 text-brand-500 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />}
                    </button>

                    {/* Subeventos (e, pra quem tem, os fornecedores): o ramo abaixo do evento. */}
                    {aberta && e.subeventos.length > 0 && (
                      <div className="ml-4 pl-3 border-l border-slate-100 mt-0.5 mb-1">
                        {e.subeventos.map(s => (
                          <div key={s.id ?? s.nome ?? 'sem'}>
                            {s.nome && (
                              contexto.modo === 'organizacao' && s.id ? (
                                <button type="button" onClick={() => irPara(`/admin/eventos/${e.id}/subevento/${s.id}`)}
                                  className="w-full flex items-center gap-2 text-left px-2 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-brand-600 hover:underline">
                                  <Layers className="w-3 h-3 shrink-0" /> {s.nome}
                                </button>
                              ) : (
                                <p className="flex items-center gap-2 px-2 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-brand-600">
                                  <Layers className="w-3 h-3 shrink-0" /> {s.nome}
                                </p>
                              )
                            )}
                            {s.setores.map(st => {
                              const ativo = st.id === setorAtual
                              return (
                                <button
                                  key={st.id}
                                  type="button"
                                  onClick={() => escolherSetor(e, st.id)}
                                  disabled={isPending}
                                  className={`w-full flex items-center gap-2.5 text-left px-2.5 py-2.5 rounded-lg transition-colors disabled:opacity-50 ${ativo ? 'bg-brand-50' : 'hover:bg-slate-50'}`}
                                >
                                  <Building2 className={`w-3.5 h-3.5 shrink-0 ${ativo ? 'text-brand-500' : 'text-slate-300'}`} />
                                  <span className={`flex-1 min-w-0 truncate text-sm ${ativo ? 'text-brand-700 font-semibold' : 'text-slate-700'}`}>{st.nome.trim()}</span>
                                  {isPending ? <LogoLoading tamanho={14} /> : ativo && <Check className="w-4 h-4 text-brand-500 shrink-0" />}
                                </button>
                              )
                            })}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {erro && <p className="text-red-500 text-xs px-5 pb-4">{erro}</p>}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

/** `useSearchParams` pede um limite de Suspense; o seletor é um conforto e pode chegar depois do resto do topo. */
export default function SeletorDeEvento(props: { contexto: ContextoDeEventos | null }) {
  return <Suspense fallback={null}><Seletor {...props} /></Suspense>
}
