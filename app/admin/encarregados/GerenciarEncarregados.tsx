'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X, Search, Eye, ShieldCheck, Trash2, Check, AlertTriangle, Pencil, KeyRound, Copy } from 'lucide-react'
import { listarCandidatosEncarregado, salvarEncarregado, removerEncarregado, gerarLinkNovaSenhaEncarregado } from '@/lib/actions-encarregado'
import {
  nomeDoSetorComArea, type CandidatoEncarregado, type EncarregadoDoEvento, type SetorOpcao,
} from '@/lib/encarregado'
import { chaveBusca } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import ConfirmModal from '@/components/ConfirmModal'

/**
 * Criar / ajustar / remover Encarregados do evento aberto.
 *
 * UM cadastro por pessoa: escolhe-se alguém da equipe (passo 1), marcam-se os
 * setores em que ela será Encarregada e confere-se, com todas as letras, onde
 * ela terá acesso (passo 2). Só o passo 2 grava — e manda UMA mensagem. A lista
 * de candidatos vem do servidor e é só de gente da equipe; os setores
 * oferecidos são só os que o supervisor supervisiona.
 */
export default function GerenciarEncarregados({ eventoId, eventoNome, setores, encarregados }: {
  eventoId: string
  eventoNome: string
  setores: SetorOpcao[]
  encarregados: EncarregadoDoEvento[]
}) {
  const router = useRouter()
  const [criando, setCriando] = useState(false)
  const [editando, setEditando] = useState<EncarregadoDoEvento | null>(null)
  const [removendo, setRemovendo] = useState<EncarregadoDoEvento | null>(null)
  const [novaSenha, setNovaSenha] = useState<EncarregadoDoEvento | null>(null)
  const [erroRemover, setErroRemover] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'atencao'; texto: string } | null>(null)

  const remover = () => {
    if (!removendo) return
    setErroRemover(null)
    iniciar(async () => {
      const r = await removerEncarregado(removendo.funcionarioId, eventoId)
      if ('erro' in r) { setErroRemover(r.erro); return }
      setAviso({ tom: 'ok', texto: `${removendo.nome} não é mais Encarregado. Continua na equipe.` })
      setRemovendo(null)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {aviso && (
        <p
          role="status"
          className={`flex items-start gap-2 text-sm rounded-xl px-3.5 py-2.5 border ${
            aviso.tom === 'ok' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'
          }`}
        >
          {aviso.tom === 'ok' ? <Check className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
          {aviso.texto}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-slate-500 text-sm">
          {encarregados.length === 0 ? 'Nenhum Encarregado neste evento.' : `${encarregados.length} Encarregado${encarregados.length === 1 ? '' : 's'} neste evento`}
        </p>
        <button type="button" onClick={() => { setAviso(null); setCriando(true) }} className="btn btn-primario btn-sm">
          <UserPlus className="w-3.5 h-3.5" /> Criar Encarregado
        </button>
      </div>

      {encarregados.length > 0 && (
        <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {encarregados.map(e => (
            <li key={e.funcionarioId} className="px-4 py-3 flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <Eye className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-slate-800 text-sm font-semibold truncate">{e.nome}</p>
                <p className="text-slate-400 text-xs truncate">
                  {e.cargo ? `${e.cargo} · ` : ''}desde {formatarBR(e.concedidoEm, 'curto')}
                  {e.concedidoPorNome ? ` · por ${e.concedidoPorNome}` : ''}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {e.setores.map(s => (
                    <span key={s.id} className="text-2xs font-medium text-slate-600 bg-slate-100 rounded-full px-2 py-0.5">{nomeDoSetorComArea(s)}</span>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  type="button" onClick={() => { setAviso(null); setNovaSenha(e) }}
                  className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  title={`Gerar link de nova senha para ${e.nome}`} aria-label={`Gerar link de nova senha para ${e.nome}`}
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                <button
                  type="button" onClick={() => { setAviso(null); setEditando(e) }}
                  className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                  title={`Mudar os setores de ${e.nome}`} aria-label={`Mudar os setores de ${e.nome}`}
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button" onClick={() => { setErroRemover(null); setRemovendo(e) }}
                  className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-erro-600 hover:bg-erro-50"
                  title={`Remover o acesso de ${e.nome}`} aria-label={`Remover o acesso de ${e.nome}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={!!removendo}
        onClose={() => setRemovendo(null)}
        onConfirm={remover}
        isPending={pendente}
        titulo="Remover Encarregado"
        mensagem={removendo ? `Remover o acesso de Encarregado de ${removendo.nome} em todos os seus setores? A pessoa continua na equipe; só deixa de poder consultar.` : ''}
        labelConfirmar="Remover acesso"
        labelConfirmando="Removendo..."
      >
        {erroRemover && <p className="text-red-500 text-xs mt-2">{erroRemover}</p>}
      </ConfirmModal>

      {novaSenha && (
        <ModalNovaSenha eventoId={eventoId} encarregado={novaSenha} onFechar={() => setNovaSenha(null)} />
      )}

      {(criando || editando) && (
        <ModalEncarregado
          eventoId={eventoId} eventoNome={eventoNome} setores={setores}
          existente={editando}
          onFechar={() => { setCriando(false); setEditando(null) }}
          onConcluido={(texto, tom) => { setCriando(false); setEditando(null); setAviso({ tom, texto }); router.refresh() }}
        />
      )}
    </div>
  )
}

/** Criar (passo 1: pessoa; passo 2: setores) ou ajustar (direto no passo 2) um Encarregado. */
function ModalEncarregado({ eventoId, eventoNome, setores, existente, onFechar, onConcluido }: {
  eventoId: string
  eventoNome: string
  setores: SetorOpcao[]
  existente: EncarregadoDoEvento | null
  onFechar: () => void
  onConcluido: (texto: string, tom: 'ok' | 'atencao') => void
}) {
  const [candidatos, setCandidatos] = useState<CandidatoEncarregado[] | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  // Filtro por setor (só quando o supervisor tem mais de um no evento): '' = todos.
  const [filtroSetor, setFiltroSetor] = useState('')
  const [pessoa, setPessoa] = useState<{ funcionarioId: string; nome: string; setorId: string | null } | null>(
    existente ? { funcionarioId: existente.funcionarioId, nome: existente.nome, setorId: null } : null,
  )
  const [marcados, setMarcados] = useState<Set<string>>(new Set((existente?.setores ?? []).map(s => s.id)))
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  useEffect(() => {
    if (existente) return
    let vivo = true
    listarCandidatosEncarregado(eventoId).then(r => {
      if (!vivo) return
      if ('erro' in r) setErroCarga(r.erro)
      else setCandidatos(r.candidatos)
    })
    return () => { vivo = false }
  }, [eventoId, existente])

  const lista = useMemo(() => {
    const t = chaveBusca(busca)
    return (candidatos ?? []).filter(c =>
      (!filtroSetor || c.setorId === filtroSetor) &&
      (!t || chaveBusca(c.nome).includes(t) || chaveBusca(c.cargo).includes(t) || chaveBusca(c.setorNome).includes(t)))
  }, [candidatos, busca, filtroSetor])

  const escolherPessoa = (c: CandidatoEncarregado) => {
    setErro(null)
    setPessoa({ funcionarioId: c.funcionarioId, nome: c.nome, setorId: c.setorId })
    // O setor em que a pessoa já trabalha vem marcado — o supervisor só acrescenta os outros.
    setMarcados(new Set([c.setorId]))
  }

  const alternar = (id: string) => {
    setErro(null)
    setMarcados(atual => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id); else novo.add(id)
      return novo
    })
  }

  const confirmar = () => {
    if (!pessoa) return
    setErro(null)
    iniciar(async () => {
      const r = await salvarEncarregado(pessoa.funcionarioId, eventoId, [...marcados])
      if ('erro' in r) { setErro(r.erro); return }
      if (!r.primeiroAcesso) {
        onConcluido(`Os setores de ${r.nome} foram atualizados (${r.total} setor${r.total === 1 ? '' : 'es'}).`, 'ok')
      } else if (r.jaTinhaLink) {
        onConcluido(`${r.nome} agora é Encarregado de ${r.total} setor${r.total === 1 ? '' : 'es'}. Não reenviamos o link: já tinha recebido neste evento.`, 'ok')
      } else if (r.mensagemEnviada) {
        onConcluido(`${r.nome} agora é Encarregado de ${r.total} setor${r.total === 1 ? '' : 'es'} e recebeu o acesso pelo WhatsApp (uma mensagem só).`, 'ok')
      } else {
        onConcluido(`${r.nome} agora é Encarregado, mas o WhatsApp com o acesso não saiu. Peça para a pessoa tocar em "Esqueci a senha" na tela de login, com o CPF.`, 'atencao')
      }
    })
  }

  const selecionados = setores.filter(s => marcados.has(s.id))
  // Agrupa por área (subevento) pra a lista longa ficar legível — a mesma ordem do "Meus fornecedores".
  const porArea = useMemo(() => {
    const m = new Map<string, SetorOpcao[]>()
    for (const s of setores) m.set(s.area ?? '', [...(m.get(s.area ?? '') ?? []), s])
    return [...m.entries()]
  }, [setores])

  return (
    <div className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => !pendente && onFechar()}>
      <div className="modal-pop-in bg-white border border-slate-200 rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <h3 className="text-slate-800 font-bold text-base">
            {existente ? 'Setores do Encarregado' : pessoa ? 'Onde ele será Encarregado' : 'Criar Encarregado'}
          </h3>
          <button onClick={onFechar} disabled={pendente} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!pessoa ? (
          <div className="p-4 space-y-3 overflow-y-auto">
            <p className="text-slate-500 text-xs">
              Evento <strong>{eventoNome}</strong>. Escolha alguém que <strong>já está na sua equipe</strong>. No próximo passo você marca em quais setores ela vai consultar.
            </p>
            {/* Mais de um setor no evento: filtra a equipe pelo setor de onde a pessoa vem. */}
            {setores.length > 1 && (
              <label className="block">
                <span className="text-slate-400 text-2xs uppercase tracking-wide font-semibold">Setor</span>
                <select value={filtroSetor} onChange={e => setFiltroSetor(e.target.value)} className="input w-full mt-1">
                  <option value="">Todos os meus setores</option>
                  {porArea.map(([area, lista]) => (
                    <optgroup key={area || 'sem-area'} label={area || 'Sem subevento'}>
                      {lista.map(st => <option key={st.id} value={st.id}>{st.nome}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
            )}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="search" value={busca} onChange={e => setBusca(e.target.value)} autoFocus
                placeholder="Buscar na equipe" className="input w-full pl-10" autoComplete="off"
              />
            </div>
            {erroCarga ? (
              <p className="text-red-500 text-sm">{erroCarga}</p>
            ) : !candidatos ? (
              <p className="text-slate-400 text-sm py-4 text-center">Carregando a equipe…</p>
            ) : !lista.length ? (
              <p className="text-slate-400 text-sm py-4 text-center">
                {candidatos.length ? 'Ninguém encontrado.' : 'Não há ninguém da equipe disponível (aprovado e ativo).'}
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                {lista.map(c => (
                  <li key={c.funcionarioId}>
                    <button
                      type="button" disabled={!c.temTelefone || !!c.funcaoAtual} onClick={() => escolherPessoa(c)}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="block text-slate-800 text-sm font-semibold truncate">{c.nome}</span>
                      <span className="block text-slate-400 text-xs truncate">
                        {c.cargo ? `${c.cargo} · ` : ''}{c.setorNome}
                        {c.funcaoAtual ? ` · já tem a função de ${c.funcaoAtual}` : !c.temTelefone ? ' · sem WhatsApp cadastrado' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div>
              <p className="text-slate-400 text-2xs uppercase tracking-wide font-semibold">Quem</p>
              <p className="text-slate-800 text-sm font-bold">{pessoa.nome}</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-slate-400 text-2xs uppercase tracking-wide font-semibold">Em quais setores</p>
                {setores.length > 1 && (
                  <button
                    type="button" className="text-brand-600 text-xs font-semibold"
                    onClick={() => setMarcados(marcados.size === setores.length ? new Set() : new Set(setores.map(s => s.id)))}
                  >
                    {marcados.size === setores.length ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                )}
              </div>
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {porArea.map(([area, lista]) => (
                  <div key={area || 'sem-area'}>
                    {area && <p className="px-3 pt-2 pb-1 text-2xs font-semibold uppercase tracking-wide text-brand-600">{area}</p>}
                    {lista.map(s => (
                      <label key={s.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-slate-50">
                        <input
                          type="checkbox" checked={marcados.has(s.id)} onChange={() => alternar(s.id)}
                          className="w-4 h-4 rounded border-slate-300 accent-brand-500 shrink-0"
                        />
                        <span className="text-slate-700 text-sm truncate">{s.nome}</span>
                        {s.id === pessoa.setorId && <span className="ml-auto text-2xs text-slate-400 shrink-0">setor dela</span>}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-slate-400 text-2xs uppercase tracking-wide font-semibold">Onde terá acesso</p>
              {selecionados.length ? (
                <ul className="mt-1 space-y-0.5">
                  {selecionados.map(s => (
                    <li key={s.id} className="text-slate-800 text-sm font-semibold">{eventoNome} › {nomeDoSetorComArea(s)}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400 text-sm mt-1">Marque pelo menos um setor.</p>
              )}
            </div>

            <div className="space-y-2 text-xs text-slate-600">
              <p className="flex gap-2"><ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />Acesso de <strong>consulta</strong>: ver a equipe e a presença desses setores.</p>
              <p className="flex gap-2"><X className="w-4 h-4 text-red-500 shrink-0" />Sem nenhuma ação: não registra ponto, não aprova, não edita nem remove ninguém.</p>
              <p className="flex gap-2"><X className="w-4 h-4 text-red-500 shrink-0" />Não vê outros setores, subeventos ou equipes do evento.</p>
              <p className="text-slate-500">
                {existente
                  ? 'Mudar os setores não manda outra mensagem: a lista nova aparece sozinha no acesso dela.'
                  : 'O acesso é enviado agora por WhatsApp, em uma mensagem só. Dentro dele a pessoa escolhe qual setor quer olhar.'}
              </p>
            </div>
            {erro && <p role="alert" className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
            <div className="flex gap-2">
              <button onClick={confirmar} disabled={pendente || marcados.size === 0} className="btn btn-primario flex-1">
                {pendente ? 'Salvando…' : existente ? 'Salvar setores' : 'Confirmar e enviar acesso'}
              </button>
              {!existente && <button onClick={() => { setPessoa(null); setErro(null) }} disabled={pendente} className="btn btn-secundario">Voltar</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Link novo de criar senha — master, administrador e o supervisor dos setores
 * podem gerar. Mostra o link pra copiar; e, se o WhatsApp da pessoa estiver
 * certo, manda também por lá. O link vale 24h e é de uso único; a senha antiga
 * continua valendo até a pessoa criar a nova.
 */
function ModalNovaSenha({ eventoId, encarregado, onFechar }: {
  eventoId: string
  encarregado: EncarregadoDoEvento
  onFechar: () => void
}) {
  const [resultado, setResultado] = useState<{ link: string; cpf: string; enviado: boolean } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [pendente, iniciar] = useTransition()

  const gerar = (enviarWhatsApp: boolean) => {
    setErro(null)
    iniciar(async () => {
      const r = await gerarLinkNovaSenhaEncarregado(encarregado.funcionarioId, eventoId, enviarWhatsApp)
      if ('erro' in r) { setErro(r.erro); return }
      setResultado({ link: r.link, cpf: r.cpf, enviado: r.enviado })
      setCopiado(false)
    })
  }

  const copiar = async () => {
    if (!resultado) return
    try {
      await navigator.clipboard.writeText(resultado.link)
      setCopiado(true)
    } catch {
      setErro('Não consegui copiar sozinho — selecione o link e copie.')
    }
  }

  return (
    <div className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => !pendente && onFechar()}>
      <div className="modal-pop-in bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <h3 className="text-slate-800 font-bold text-base">Nova senha — {encarregado.nome}</h3>
          <button onClick={onFechar} disabled={pendente} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          {!resultado ? (
            <>
              <p className="text-slate-600 text-sm">
                Gera um link para {encarregado.nome} criar uma senha nova. O link vale <strong>24 horas</strong> e só funciona uma vez;
                a senha atual continua valendo até ela criar a nova.
              </p>
              {erro && <p role="alert" className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
              <button onClick={() => gerar(false)} disabled={pendente} className="btn btn-primario w-full">
                <KeyRound className="w-3.5 h-3.5" /> {pendente ? 'Gerando…' : 'Gerar link'}
              </button>
            </>
          ) : (
            <>
              <p className="text-slate-600 text-sm">
                {resultado.enviado ? 'Link enviado pelo WhatsApp e gerado aqui também.' : 'Link gerado. Envie para a pessoa — quem abrir define a senha.'}
                {' '}O login dela é o CPF <strong className="tabular-nums">{resultado.cpf}</strong>.
              </p>
              <input readOnly value={resultado.link} onFocus={e => e.currentTarget.select()} className="input w-full text-xs" aria-label="Link de nova senha" />
              {erro && <p role="alert" className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
              <div className="flex flex-wrap gap-2">
                <button onClick={copiar} className="btn btn-primario flex-1">
                  {copiado ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copiado ? 'Copiado' : 'Copiar link'}
                </button>
                {!resultado.enviado && (
                  <button onClick={() => gerar(true)} disabled={pendente} className="btn btn-secundario">
                    {pendente ? 'Enviando…' : 'Enviar por WhatsApp'}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
