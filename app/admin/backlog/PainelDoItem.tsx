'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  X, Pencil, Trash2, MessageSquarePlus, Building2, CheckSquare, History,
  AlertTriangle, Mail, Phone, CalendarDays, Users, Target, Handshake, ExternalLink,
  Paperclip, FileText,
} from 'lucide-react'
import { LogoLoading } from '@/components/LogoLoading'
import {
  comentarNoItem, excluirItemBacklog, moverItemBacklog, converterEmCliente, historicoParaTela,
  anexosDoItem, anexarFotoBacklog, removerAnexoBacklog, type AnexoBacklog,
} from '@/lib/actions-backlog'
import type { ItemBacklog, EntradaHistorico } from '@/lib/backlog'
import { COLUNAS, ROTULO_ACAO, rotuloDoStatus } from '@/lib/backlog-constantes'
import SeletorLista from '@/components/SeletorLista'
import ConfirmModal from '@/components/ConfirmModal'
import { SeloPrioridade, diaLongo } from './CartaoItem'
import type { Opcoes } from './FormularioItem'

/**
 * O painel do item: tudo que o card não cabe, e as ações do dia a dia.
 *
 * O histórico NÃO vem junto com a lista da página. São dezenas de linhas por
 * item, e quem abre o quadro quer ver o quadro — carregar o histórico de
 * cinquenta itens pra mostrar o de um seria pagar caro por nada. Ele é
 * buscado quando este painel abre, e só dele.
 */
export default function PainelDoItem({
  item, opcoes, onFechar, onEditar,
}: {
  item: ItemBacklog
  opcoes: Opcoes
  onFechar: () => void
  onEditar: () => void
}) {
  const router = useRouter()
  const [historico, setHistorico] = useState<EntradaHistorico[] | null>(null)
  const [comentario, setComentario] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)
  const [convertendo, setConvertendo] = useState(false)
  const [organizacao, setOrganizacao] = useState('')
  const [pendente, startTransition] = useTransition()

  const recarregarHistorico = () => {
    historicoParaTela(item.id).then(r => setHistorico(r.ok ? r.dados.entradas : []))
  }
  useEffect(recarregarHistorico, [item.id])

  // ── Anexos (fotos do item, tipo card do Trello) ──────────────────────────
  const [anexos, setAnexos] = useState<AnexoBacklog[] | null>(null)
  const [subindoAnexo, setSubindoAnexo] = useState(false)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const recarregarAnexos = () => {
    anexosDoItem(item.id).then(r => setAnexos(r.ok ? r.dados.anexos : []))
  }
  useEffect(recarregarAnexos, [item.id])

  const enviarAnexo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    if (!arquivo) return
    setErro(null)
    setSubindoAnexo(true)
    try {
      const fd = new FormData()
      fd.set('arquivo', arquivo)
      const r = await anexarFotoBacklog(item.id, fd)
      if (!r.ok) setErro(r.erro)
      else { recarregarAnexos(); recarregarHistorico() }
    } finally {
      setSubindoAnexo(false)
    }
  }

  const agir = (acao: () => Promise<{ ok: true } | { ok: false; erro: string }>, depois?: () => void) => {
    setErro(null)
    startTransition(async () => {
      const r = await acao()
      if (!r.ok) { setErro(r.erro); return }
      depois?.()
      recarregarHistorico()
      router.refresh()
    })
  }

  const Icone = item.tipo === 'cliente' ? Building2 : CheckSquare

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !pendente && onFechar()}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div
        className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h2 className="flex items-start gap-2 text-slate-800 font-bold">
              <Icone className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
              <span className="min-w-0">{item.titulo}</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5 pl-6">
              <SeloPrioridade prioridade={item.prioridade} />
              <span className="text-slate-400 text-xs">{rotuloDoStatus(item.tipo, item.status)}</span>
              {item.convertidoOrganizacaoNome && (
                <span className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-1.5 py-0.5 text-2xs font-semibold text-green-700">
                  <Handshake className="w-3 h-3" /> Cliente: {item.convertidoOrganizacaoNome}
                </span>
              )}
            </div>
          </div>
          <button onClick={onFechar} disabled={pendente} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* ── Mover de coluna, sem arrastar ─────────────────────────────── */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Status</label>
            <SeletorLista
              valor={item.status}
              onChange={v => agir(() => moverItemBacklog(item.id, v))}
              titulo="Mover para"
              opcoes={COLUNAS[item.tipo].map(c => ({ valor: c.valor, rotulo: c.rotulo }))}
            />
            <p className="text-slate-400 text-2xs">
              No computador dá pra arrastar o card no quadro; aqui funciona também no celular.
            </p>
          </div>

          {/* ── Os dados ──────────────────────────────────────────────────── */}
          <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2.5">
            <Linha icone={<Users className="w-3.5 h-3.5" />} rotulo="Responsável" valor={item.responsavelNome} />
            {!item.eventoId && (
              <Linha icone={<CalendarDays className="w-3.5 h-3.5" />} rotulo="Evento" valor="Interno" />
            )}
            {item.eventoId && item.eventoNome && (
              <div className="min-w-0">
                <dt className="flex items-center gap-1.5 text-slate-400 text-2xs font-semibold uppercase tracking-wide">
                  <CalendarDays className="w-3.5 h-3.5" /> Evento
                </dt>
                <dd className="text-slate-700 text-sm mt-0.5">
                  <Link href={`/admin/eventos/${item.eventoId}`} className="text-brand-600 hover:underline inline-flex items-center gap-1">
                    {item.eventoNome} <ExternalLink className="w-3 h-3" />
                  </Link>
                </dd>
              </div>
            )}

            {item.tipo === 'cliente' ? (
              <>
                <Linha icone={<Users className="w-3.5 h-3.5" />} rotulo="Contato" valor={item.contatoNome} />
                <Linha icone={<Phone className="w-3.5 h-3.5" />} rotulo="WhatsApp" valor={item.whatsapp} />
                <Linha icone={<Mail className="w-3.5 h-3.5" />} rotulo="E-mail" valor={item.email} />
                <Linha icone={<Target className="w-3.5 h-3.5" />} rotulo="Origem do lead" valor={item.origemLead} />
                <Linha icone={<CalendarDays className="w-3.5 h-3.5" />} rotulo="Evento previsto" valor={item.eventoPrevistoNome} />
                <Linha
                  icone={<CalendarDays className="w-3.5 h-3.5" />} rotulo="Data prevista"
                  valor={item.dataEventoPrevista ? diaLongo(item.dataEventoPrevista) : null}
                />
                <Linha
                  icone={<Users className="w-3.5 h-3.5" />} rotulo="Pessoas estimadas"
                  valor={item.quantidadeEstimada?.toLocaleString('pt-BR') ?? null}
                />
                <Linha icone={<Target className="w-3.5 h-3.5" />} rotulo="Serviço / interesse" valor={item.servicoInteresse} />
                <Linha
                  icone={<CalendarDays className="w-3.5 h-3.5" />} rotulo="Próximo contato"
                  valor={item.proximoContatoData ? diaLongo(item.proximoContatoData) : null}
                />
              </>
            ) : (
              <Linha
                icone={<CalendarDays className="w-3.5 h-3.5" />} rotulo="Prazo"
                valor={item.prazo ? diaLongo(item.prazo) : null}
              />
            )}
          </dl>

          {item.descricao && <Bloco titulo="Descrição" texto={item.descricao} />}
          {item.observacoes && <Bloco titulo="Observações" texto={item.observacoes} />}

          {/* ── Anexos: fotos do item ────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between">
              <h3 className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">Anexos</h3>
              <button
                type="button"
                onClick={() => arquivoRef.current?.click()}
                disabled={subindoAnexo}
                className="text-brand-600 hover:text-brand-700 text-xs font-medium inline-flex items-center gap-1 disabled:opacity-50"
              >
                {subindoAnexo ? <LogoLoading tamanho={13} /> : <Paperclip className="w-3.5 h-3.5" />}
                {subindoAnexo ? 'Enviando…' : 'Anexar foto'}
              </button>
              <input
                ref={arquivoRef}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={enviarAnexo}
              />
            </div>

            {anexos === null ? (
              <p className="text-slate-400 text-xs mt-2 flex items-center gap-1.5"><LogoLoading tamanho={13} /> Carregando…</p>
            ) : !anexos.length ? (
              <p className="text-slate-400 text-xs mt-1">Nenhuma foto ainda. Solte um print da conversa, a proposta, a logo do lead…</p>
            ) : (
              <div className="grid grid-cols-3 gap-2 mt-2">
                {anexos.map(a => (
                  <div key={a.id} className="group relative rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                    {a.ehImagem && a.url ? (
                      <a href={a.url} target="_blank" rel="noopener noreferrer">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt={a.nome} className="w-full h-24 object-cover" />
                      </a>
                    ) : (
                      <a href={a.url ?? '#'} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center justify-center h-24 p-2 text-center">
                        <FileText className="w-5 h-5 text-slate-400" />
                        <span className="text-2xs text-slate-500 mt-1 line-clamp-2 break-all">{a.nome}</span>
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => agir(() => removerAnexoBacklog(a.id), recarregarAnexos)}
                      disabled={pendente}
                      aria-label={`Remover ${a.nome}`}
                      className="absolute top-1 right-1 w-6 h-6 rounded-md bg-white/90 border border-slate-200 flex items-center justify-center text-slate-500 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {erro && (
            <p className="flex items-start gap-1.5 text-red-600 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
            </p>
          )}

          {/* ── Converter em cliente ──────────────────────────────────────── */}
          {item.tipo === 'cliente' && !item.convertidoOrganizacaoId && (
            <div className="rounded-xl border border-slate-200 p-3.5 space-y-2.5">
              {!convertendo ? (
                <button onClick={() => setConvertendo(true)} className="btn btn-secundario btn-sm">
                  <Handshake className="w-3.5 h-3.5 shrink-0" /> Converter em cliente
                </button>
              ) : (
                <>
                  <p className="text-slate-600 text-xs">
                    Ligue este possível cliente a uma organização já cadastrada. O item continua
                    aqui, com o histórico inteiro — a conversão vira mais uma linha nele.
                    Se a organização ainda não existe,{' '}
                    <Link href="/admin/organizacoes/novo" className="text-brand-600 hover:underline">cadastre primeiro</Link>.
                  </p>
                  <SeletorLista
                    valor={organizacao}
                    onChange={setOrganizacao}
                    placeholder="Escolha a organização"
                    titulo="Organização deste cliente"
                    busca
                    opcoes={opcoes.organizacoes.map(o => ({ valor: o.id, rotulo: o.nome }))}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => agir(() => converterEmCliente(item.id, organizacao), () => setConvertendo(false))}
                      disabled={pendente || !organizacao}
                      className="btn btn-primario btn-sm disabled:opacity-50"
                    >
                      <Handshake className="w-3.5 h-3.5 shrink-0" /> Confirmar conversão
                    </button>
                    <button onClick={() => setConvertendo(false)} disabled={pendente} className="btn btn-secundario btn-sm">
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Histórico ─────────────────────────────────────────────────── */}
          <div className="space-y-2.5">
            <h3 className="flex items-center gap-1.5 text-slate-700 text-sm font-semibold">
              <History className="w-3.5 h-3.5 text-slate-400" /> Histórico
            </h3>

            <div className="flex gap-2">
              <input
                value={comentario}
                onChange={e => setComentario(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && comentario.trim()) {
                    e.preventDefault()
                    agir(() => comentarNoItem(item.id, comentario), () => setComentario(''))
                  }
                }}
                placeholder="Escrever um comentário…"
                className="input flex-1"
              />
              <button
                onClick={() => agir(() => comentarNoItem(item.id, comentario), () => setComentario(''))}
                disabled={pendente || !comentario.trim()}
                className="btn btn-secundario disabled:opacity-50"
              >
                <MessageSquarePlus className="w-3.5 h-3.5 shrink-0" /> Enviar
              </button>
            </div>

            {historico === null ? (
              <p className="flex items-center gap-2 text-slate-400 text-xs py-3">
                <LogoLoading tamanho="sm" /> Carregando o histórico…
              </p>
            ) : !historico.length ? (
              <p className="text-slate-400 text-xs py-3">Nada registrado ainda.</p>
            ) : (
              <ol className="border-l border-slate-200 pl-4 space-y-3">
                {historico.map(e => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[1.3125rem] top-1.5 w-1.5 h-1.5 rounded-full bg-slate-300" />
                    <p className="text-slate-700 text-xs">
                      <span className="font-semibold">{ROTULO_ACAO[e.acao] ?? e.acao}</span>
                      {e.acao === 'COMENTARIO' ? (
                        <span className="block text-slate-600 mt-0.5 whitespace-pre-wrap">{e.valorNovo}</span>
                      ) : (e.valorAnterior || e.valorNovo) ? (
                        <span className="text-slate-500">
                          {' — '}
                          {e.valorAnterior ? <s className="text-slate-400">{e.valorAnterior}</s> : 'vazio'}
                          {' → '}
                          {e.valorNovo ?? 'vazio'}
                        </span>
                      ) : null}
                    </p>
                    <p className="text-slate-400 text-2xs mt-0.5">
                      {e.autorNome ?? 'sistema'} · {new Date(e.criadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* ── Ações ─────────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100 mt-2 -mx-1 px-1 pt-4">
            <button onClick={onEditar} disabled={pendente} className="btn btn-secundario btn-sm">
              <Pencil className="w-3.5 h-3.5 shrink-0" /> Editar
            </button>
            <button
              onClick={() => setConfirmandoExclusao(true)}
              disabled={pendente}
              className="btn btn-secundario btn-sm text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" /> Excluir
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={confirmandoExclusao}
        onClose={() => setConfirmandoExclusao(false)}
        onConfirm={() => agir(() => excluirItemBacklog(item.id), () => { setConfirmandoExclusao(false); onFechar() })}
        isPending={pendente}
        titulo="Excluir do Backlog"
        mensagem={`Apagar "${item.titulo}" e todo o histórico dele? Isso não tem desfazer.`}
        zIndexClassName="z-[60]"
      />
    </div>
  )
}

function Linha({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: string | null }) {
  if (!valor) return null
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 text-slate-400 text-2xs font-semibold uppercase tracking-wide">
        {icone} {rotulo}
      </dt>
      <dd className="text-slate-700 text-sm mt-0.5 break-words">{valor}</dd>
    </div>
  )
}

function Bloco({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <h3 className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">{titulo}</h3>
      <p className="text-slate-700 text-sm mt-1 whitespace-pre-wrap">{texto}</p>
    </div>
  )
}
