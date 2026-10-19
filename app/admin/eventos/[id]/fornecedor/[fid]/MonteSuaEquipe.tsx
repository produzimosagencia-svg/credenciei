'use client'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { Users, Search, Loader2, X, Check, RefreshCw, CalendarDays, UserPlus } from 'lucide-react'
import {
  obterHistoricoDaEquipe, adicionarDoHistorico, credenciaisDoHistorico,
  type HistoricoDaEquipe, type PessoaNaTela, type ResultadoDoLote,
} from '@/lib/actions-historico'
import type { StatusDaCredencial } from '@/lib/credencial-whatsapp'
import { ROTULO_SITUACAO, O_QUE_FAZER } from '@/lib/historico-supervisor-regras'
import { ROTULO_FASE } from '@/lib/escala-regras'
import { Secao, Badge } from '@/components/ui/Superficie'

/*
 * MONTE SUA EQUIPE (Juan, 18/10/2026) — no topo da equipe, onde o supervisor já trabalha: quem já trabalhou com ele
 * em outros eventos, para adicionar vários de uma vez, sem recadastro. Cada pessoa entra aprovada e recebe a
 * credencial no WhatsApp (as conferências são no servidor — ver lib/actions-historico.ts).
 */

type Filtro = 'disponiveis' | 'pendencias' | 'todos'

const TOM_SITUACAO: Record<PessoaNaTela['situacao'], 'positivo' | 'atencao' | 'neutro' | 'negativo'> = {
  disponivel: 'positivo', sem_telefone: 'atencao', bloqueado: 'negativo', em_outra_equipe: 'neutro', baixa_na_equipe: 'neutro', na_equipe: 'neutro',
}

const ROTULO_CREDENCIAL: Record<StatusDaCredencial, { texto: string; tom: 'positivo' | 'atencao' | 'negativo' | 'neutro' }> = {
  lida: { texto: 'lida', tom: 'positivo' },
  entregue: { texto: 'entregue', tom: 'positivo' },
  enviada: { texto: 'enviada', tom: 'positivo' },
  na_fila: { texto: 'na fila', tom: 'atencao' },
  falhou: { texto: 'não chegou', tom: 'negativo' },
  sem_mensagem: { texto: 'sem mensagem', tom: 'neutro' },
}

const mesAno = (iso: string | null) => {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit', timeZone: 'America/Sao_Paulo' }).replace('.', '').replace(' de ', '/') } catch { return '' }
}
const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join('')
const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export default function MonteSuaEquipe({ fornecedorId, equipeNome }: { fornecedorId: string; equipeNome: string }) {
  const router = useRouter()
  const [dados, setDados] = useState<HistoricoDaEquipe | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('disponiveis')
  const [soComPonto, setSoComPonto] = useState(true)
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [confirmando, setConfirmando] = useState(false)
  const [diasMarcados, setDiasMarcados] = useState<Set<string>>(new Set())
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoDoLote | null>(null)
  const [erroLote, setErroLote] = useState<string | null>(null)
  const [credenciais, setCredenciais] = useState<{ nome: string; status: StatusDaCredencial }[] | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await obterHistoricoDaEquipe(fornecedorId)
      if ('error' in r) { setErro(r.error); return }
      setErro(null)
      setDados(r)
    } catch {
      setErro('Não foi possível carregar o histórico agora.')
    }
  }, [fornecedorId])

  const carregarCredenciais = useCallback(async () => {
    try {
      const r = await credenciaisDoHistorico(fornecedorId)
      if (!('error' in r)) setCredenciais(r.pessoas)
    } catch { /* sem internet: a lista volta na próxima */ }
  }, [fornecedorId])

  useEffect(() => {
    const t = setTimeout(() => { void carregar(); void carregarCredenciais() }, 0)
    return () => clearTimeout(t)
  }, [carregar, carregarCredenciais])

  const visiveis = useMemo(() => {
    if (!dados) return []
    const termo = semAcento(busca.trim())
    return dados.pessoas.filter(p => {
      if (filtro === 'disponiveis' && p.situacao !== 'disponivel') return false
      if (filtro === 'pendencias' && (p.situacao === 'disponivel' || p.situacao === 'na_equipe')) return false
      if (soComPonto && p.diasTrabalhados === 0) return false
      if (!termo) return true
      return semAcento(`${p.nome} ${p.cargo ?? ''} ${p.cidade ?? ''}`).includes(termo)
    })
  }, [dados, busca, filtro, soComPonto])

  if (erro && !dados) return null
  if (!dados) return null
  const prontas = dados.pessoas.filter(p => p.situacao === 'disponivel')
  const naEquipe = dados.pessoas.filter(p => p.situacao === 'na_equipe').length
  if (!dados.pessoas.length && !dados.ocultasSemAceite) return null

  const marcarTodasVisiveis = () => setSelecionadas(new Set(visiveis.filter(p => p.situacao === 'disponivel').map(p => p.chave)))
  const alternar = (chave: string) => setSelecionadas(s => {
    const n = new Set(s)
    if (n.has(chave)) n.delete(chave)
    else n.add(chave)
    return n
  })

  const confirmar = async () => {
    setEnviando(true)
    setErroLote(null)
    try {
      const r = await adicionarDoHistorico(fornecedorId, [...selecionadas], [...diasMarcados])
      if ('error' in r) { setErroLote(r.error); return }
      setResultado(r)
      setConfirmando(false)
      setSelecionadas(new Set())
      await carregar()
      router.refresh()
      // A fila manda em instantes: confere de novo depois.
      setTimeout(() => { void carregarCredenciais() }, 4000)
    } catch {
      setErroLote('A internet falhou no envio. Confira a lista da equipe antes de tentar de novo: ninguém é adicionado duas vezes.')
    } finally {
      setEnviando(false)
    }
  }

  const selecionadasN = selecionadas.size
  const naoCabem = dados.vagas !== null && selecionadasN > dados.vagas

  return (
    <Secao
      tom="acento"
      icone={<Users className="w-3.5 h-3.5" />}
      titulo="Monte sua equipe"
      descricao={prontas.length
        ? `${plural(prontas.length, 'pessoa que já trabalhou', 'pessoas que já trabalharam')} com ${dados.deQuem} ${prontas.length === 1 ? 'pode' : 'podem'} entrar em ${equipeNome} sem novo cadastro.`
        : `Quem já trabalhou com ${dados.deQuem} em outros eventos${naEquipe ? ` — ${plural(naEquipe, 'pessoa já está', 'pessoas já estão')} nesta equipe` : ''}.`}
      acoes={
        <button type="button" onClick={() => setAberto(a => !a)} className={`btn btn-sm ${aberto ? 'btn-secundario' : 'btn-primario'}`}>
          {aberto ? <><X className="w-3.5 h-3.5" /> Fechar</> : <><UserPlus className="w-3.5 h-3.5" /> Ver e adicionar</>}
        </button>
      }
      corpoClassName={aberto || resultado ? 'p-0' : 'hidden'}
    >
      {resultado && (
        <div className="p-4 space-y-2 border-b border-slate-100">
          {resultado.adicionadas.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <Check className="w-4 h-4 shrink-0 mt-0.5" />
              <p><strong>{plural(resultado.adicionadas.length, 'pessoa adicionada', 'pessoas adicionadas')}</strong> a {equipeNome}. Cada uma está recebendo no WhatsApp a confirmação da escala, com a credencial.
              {resultado.semDias.length > 0 && ` ${plural(resultado.semDias.length, 'ficou', 'ficaram')} aguardando aprovação porque os dias não gravaram: ${resultado.semDias.join(', ')}.`}</p>
            </div>
          )}
          {resultado.recusadas.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 space-y-1.5">
              <p className="font-semibold">{plural(resultado.recusadas.length, 'pessoa não entrou', 'pessoas não entraram')}:</p>
              <ul className="space-y-1">
                {resultado.recusadas.map((r, i) => (
                  <li key={i}><strong>{r.nome}</strong>: {r.motivo}{r.oQueFazer ? ` ${r.oQueFazer}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={() => setResultado(null)} className="text-xs text-slate-500 hover:text-slate-700">Fechar aviso</button>
        </div>
      )}

      {aberto && (
        <div className="divide-y divide-slate-100">
          {/* Filtros */}
          <div className="p-4 space-y-3 bg-slate-50/60">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="monte-busca" value={busca} onChange={e => setBusca(e.target.value)}
                placeholder="Buscar por nome, função ou cidade" className="input pl-9 w-full" autoComplete="off"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {([['disponiveis', `Prontas (${prontas.length})`], ['pendencias', 'Com pendência'], ['todos', 'Todos']] as const).map(([v, rot]) => (
                <button
                  key={v} type="button" onClick={() => setFiltro(v)}
                  className={`px-3 py-1.5 rounded-full border font-semibold transition-colors ${filtro === v ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                >{rot}</button>
              ))}
              <label className="inline-flex items-center gap-1.5 ml-1 text-slate-600 cursor-pointer">
                <input type="checkbox" checked={soComPonto} onChange={e => setSoComPonto(e.target.checked)} className="accent-brand-500" />
                Só quem bateu ponto
              </label>
            </div>
            {dados.ocultasSemAceite > 0 && (
              <p className="text-2xs text-slate-400">
                {plural(dados.ocultasSemAceite, 'pessoa de outra organização não autorizou', 'pessoas de outra organização não autorizaram')} aparecer para outros eventos e não {dados.ocultasSemAceite === 1 ? 'aparece' : 'aparecem'} aqui.
              </p>
            )}
          </div>

          {/* Lista */}
          {visiveis.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">
              Ninguém neste filtro. {filtro !== 'todos' && 'Tente "Todos".'} {soComPonto && 'Ou desmarque "Só quem bateu ponto".'}
            </p>
          ) : (
            <>
              {visiveis.some(p => p.situacao === 'disponivel') && (
                <div className="px-4 py-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">{plural(visiveis.length, 'pessoa', 'pessoas')} nesta lista</span>
                  <button type="button" onClick={marcarTodasVisiveis} className="font-semibold text-brand-600 hover:underline">
                    Marcar as prontas desta lista
                  </button>
                </div>
              )}
              <ul className="max-h-[28rem] overflow-y-auto divide-y divide-slate-100">
                {visiveis.map(p => {
                  const pode = p.situacao === 'disponivel'
                  const marcada = selecionadas.has(p.chave)
                  const ultimas = p.participacoes.slice(0, 2)
                  return (
                    <li key={p.chave}>
                      <label className={`flex items-center gap-3 px-4 py-2.5 ${pode ? 'cursor-pointer hover:bg-slate-50' : 'opacity-75'}`}>
                        <input
                          type="checkbox" disabled={!pode} checked={marcada} onChange={() => alternar(p.chave)}
                          className="w-4 h-4 accent-brand-500 shrink-0" aria-label={`Selecionar ${p.nome}`}
                        />
                        {p.fotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.fotoUrl} alt="" className="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0" />
                        ) : (
                          <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 text-xs font-bold flex items-center justify-center shrink-0">{iniciais(p.nome)}</span>
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-800 truncate">{p.nome}</span>
                          <span className="block text-2xs text-slate-500 truncate">
                            {[p.cargo, p.cidade].filter(Boolean).join(' · ') || 'Sem função informada'}
                            {' · '}{p.diasTrabalhados ? plural(p.diasTrabalhados, 'dia trabalhado', 'dias trabalhados') : 'sem ponto batido'}
                          </span>
                          <span className="block text-2xs text-slate-400 truncate">
                            {ultimas.map(x => `${x.evento}${x.quando ? ` (${mesAno(x.quando)})` : ''} · ${x.equipe}`).join('  |  ')}
                            {p.participacoes.length > 2 ? `  +${p.participacoes.length - 2}` : ''}
                          </span>
                          {!pode && p.situacao !== 'na_equipe' && (
                            <span className="block text-2xs text-amber-700 mt-0.5">
                              {p.situacao === 'em_outra_equipe' && p.detalhe ? `Está na equipe ${p.detalhe}. ` : ''}{O_QUE_FAZER[p.situacao as Exclude<PessoaNaTela['situacao'], 'disponivel'>]}
                            </span>
                          )}
                        </span>
                        <Badge tom={TOM_SITUACAO[p.situacao]} className="shrink-0 hidden sm:inline-flex">{ROTULO_SITUACAO[p.situacao]}</Badge>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </>
          )}

          {/* Barra de ação */}
          <div className="sticky bottom-0 bg-white/95 backdrop-blur px-4 py-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-slate-600">
              {selecionadasN ? <><strong>{selecionadasN}</strong> {selecionadasN === 1 ? 'selecionada' : 'selecionadas'}</> : 'Marque quem você quer na equipe'}
              {dados.vagas !== null && <span className="text-slate-400"> · cabem {dados.vagas}</span>}
            </span>
            <div className="flex gap-2">
              {selecionadasN > 0 && (
                <button type="button" onClick={() => setSelecionadas(new Set())} className="btn btn-secundario btn-sm">Limpar</button>
              )}
              <button
                type="button" disabled={!selecionadasN} onClick={() => { setErroLote(null); setConfirmando(true) }}
                className="btn btn-primario btn-sm disabled:opacity-50"
              >
                <UserPlus className="w-3.5 h-3.5" /> Adicionar à equipe
              </button>
            </div>
          </div>

          {/* Credenciais de quem entrou por aqui */}
          {credenciais && credenciais.length > 0 && (
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600">Confirmação no WhatsApp de quem entrou pelo histórico</p>
                <button type="button" onClick={() => void carregarCredenciais()} className="inline-flex items-center gap-1 text-xs text-brand-600 font-semibold hover:underline">
                  <RefreshCw className="w-3 h-3" /> Atualizar
                </button>
              </div>
              {credenciais.some(c => c.status === 'falhou') && (
                <p className="text-2xs text-red-600">Quem está com &ldquo;não chegou&rdquo;: abra a ficha na lista da equipe e corrija o telefone. A credencial é reenviada sozinha.</p>
              )}
              <ul className="flex flex-wrap gap-1.5">
                {credenciais.slice(0, 60).map((c, i) => (
                  <li key={i} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white pl-2.5 pr-1 py-0.5 text-2xs text-slate-700">
                    {c.nome.split(' ').slice(0, 2).join(' ')}
                    <Badge tom={ROTULO_CREDENCIAL[c.status].tom}>{ROTULO_CREDENCIAL[c.status].texto}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Confirmação — no <body>, para nada da seção (overflow, transform) cortar a janela no celular. */}
      {confirmando && typeof document !== 'undefined' && createPortal((
        <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Confirmar">
          <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div>
              <p className="text-lg font-extrabold text-slate-900">Adicionar {plural(selecionadasN, 'pessoa', 'pessoas')} a {equipeNome}?</p>
              <p className="text-sm text-slate-600 mt-1">Cada uma entra aprovada e recebe agora no WhatsApp a confirmação da escala: evento, setor, função, dia e horário, com o link da credencial. Ninguém precisa se cadastrar de novo.</p>
            </div>

            {dados.usaEscala && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> Dias de trabalho</p>
                  <button type="button" onClick={() => setDiasMarcados(new Set(dados.dias.map(d => d.data)))} className="text-xs font-semibold text-brand-600 hover:underline">Marcar todos</button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {dados.dias.map(d => {
                    const on = diasMarcados.has(d.data)
                    return (
                      <button
                        key={d.data} type="button"
                        onClick={() => setDiasMarcados(s => { const n = new Set(s); if (n.has(d.data)) n.delete(d.data); else n.add(d.data); return n })}
                        className={`rounded-xl border px-2.5 py-1.5 text-xs text-left ${on ? 'border-brand-500 bg-brand-50 text-brand-700 font-semibold' : 'border-slate-200 text-slate-600'}`}
                      >
                        {d.data.slice(8, 10)}/{d.data.slice(5, 7)}
                        <span className="block text-2xs opacity-70">{ROTULO_FASE[d.fase]}</span>
                      </button>
                    )
                  })}
                </div>
                <p className="text-2xs text-slate-400">Os mesmos dias valem para todas. Dá para ajustar a escala de cada pessoa depois.</p>
              </div>
            )}

            {naoCabem && (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                A equipe tem vaga para {dados.vagas}. Entram as {dados.vagas} primeiras; as outras aparecem como &ldquo;não coube&rdquo;.
              </p>
            )}
            {erroLote && <p className="text-sm text-red-600">{erroLote}</p>}

            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
              <button type="button" onClick={() => setConfirmando(false)} disabled={enviando} className="btn btn-secundario">Voltar</button>
              <button
                type="button" onClick={() => void confirmar()}
                disabled={enviando || (dados.usaEscala && diasMarcados.size === 0)}
                className="btn btn-primario disabled:opacity-50"
              >
                {enviando ? <><Loader2 className="w-4 h-4 animate-spin" /> Adicionando…</> : <>Adicionar e confirmar a escala</>}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </Secao>
  )
}
