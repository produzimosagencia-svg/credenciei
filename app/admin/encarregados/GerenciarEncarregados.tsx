'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserPlus, X, Search, Eye, ShieldCheck, Trash2, Check, AlertTriangle } from 'lucide-react'
import {
  listarCandidatosEncarregado, concederEncarregado, removerEncarregado,
} from '@/lib/actions-encarregado'
import { caminhoDoSetor, type CandidatoEncarregado, type EncarregadoDoSetor, type ContextoDoSetor } from '@/lib/encarregado'
import { chaveBusca } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import ConfirmModal from '@/components/ConfirmModal'

/**
 * Criar / listar / remover Encarregados de UM setor.
 *
 * O fluxo de criar tem dois passos de propósito: escolher a pessoa e DEPOIS
 * ver, com todas as letras, onde ela vai ter acesso e o que isso significa.
 * Só o segundo passo grava. A lista de candidatos vem do servidor e é só de
 * gente da equipe — quem está fora dela não aparece nem dá pra digitar.
 */
export default function GerenciarEncarregados({ setor, encarregados }: {
  setor: ContextoDoSetor
  encarregados: EncarregadoDoSetor[]
}) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [removendo, setRemovendo] = useState<EncarregadoDoSetor | null>(null)
  const [erroRemover, setErroRemover] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const [aviso, setAviso] = useState<{ tom: 'ok' | 'atencao'; texto: string } | null>(null)

  const remover = () => {
    if (!removendo) return
    setErroRemover(null)
    iniciar(async () => {
      const r = await removerEncarregado(removendo.id)
      if ('erro' in r) { setErroRemover(r.erro); return }
      setRemovendo(null)
      setAviso({ tom: 'ok', texto: `${removendo.nome} não é mais Encarregado. Continua na equipe.` })
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
          {encarregados.length === 0 ? 'Nenhum Encarregado neste setor.' : `${encarregados.length} Encarregado${encarregados.length === 1 ? '' : 's'} neste setor`}
        </p>
        <button type="button" onClick={() => { setAviso(null); setAberto(true) }} className="btn btn-primario btn-sm">
          <UserPlus className="w-3.5 h-3.5" /> Criar Encarregado
        </button>
      </div>

      {encarregados.length > 0 && (
        <ul className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
          {encarregados.map(e => (
            <li key={e.id} className="px-4 py-3 flex items-center gap-3">
              <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
                <Eye className="w-4 h-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-slate-800 text-sm font-semibold truncate">{e.nome}</p>
                <p className="text-slate-400 text-xs truncate">
                  {e.cargo ? `${e.cargo} · ` : ''}desde {formatarBR(e.concedidoEm, 'curto')}
                  {e.concedidoPorNome ? ` · por ${e.concedidoPorNome}` : ''}
                </p>
              </div>
              <button
                type="button" onClick={() => { setErroRemover(null); setRemovendo(e) }}
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-erro-600 hover:bg-erro-50 shrink-0"
                title={`Remover o acesso de ${e.nome}`} aria-label={`Remover o acesso de ${e.nome}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
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
        mensagem={removendo ? `Remover o acesso de Encarregado de ${removendo.nome}? A pessoa continua na equipe; só deixa de poder consultar o setor.` : ''}
        labelConfirmar="Remover acesso"
        labelConfirmando="Removendo..."
      >
        {erroRemover && <p className="text-red-500 text-xs mt-2">{erroRemover}</p>}
      </ConfirmModal>

      {aberto && (
        <ModalCriar
          setor={setor}
          onFechar={() => setAberto(false)}
          onConcluido={(texto, tom) => { setAberto(false); setAviso({ tom, texto }); router.refresh() }}
        />
      )}
    </div>
  )
}

function ModalCriar({ setor, onFechar, onConcluido }: {
  setor: ContextoDoSetor
  onFechar: () => void
  onConcluido: (texto: string, tom: 'ok' | 'atencao') => void
}) {
  const [candidatos, setCandidatos] = useState<CandidatoEncarregado[] | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [escolhido, setEscolhido] = useState<CandidatoEncarregado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  useEffect(() => {
    let vivo = true
    listarCandidatosEncarregado(setor.fornecedorId).then(r => {
      if (!vivo) return
      if ('erro' in r) setErroCarga(r.erro)
      else setCandidatos(r.candidatos)
    })
    return () => { vivo = false }
  }, [setor.fornecedorId])

  const lista = useMemo(() => {
    const t = chaveBusca(busca)
    return (candidatos ?? []).filter(c => !t || chaveBusca(c.nome).includes(t) || chaveBusca(c.cargo).includes(t))
  }, [candidatos, busca])

  const confirmar = () => {
    if (!escolhido) return
    setErro(null)
    iniciar(async () => {
      const r = await concederEncarregado(escolhido.funcionarioId, setor.fornecedorId)
      if ('erro' in r) { setErro(r.erro); return }
      onConcluido(
        r.avisado
          ? `${r.nome} agora é Encarregado e recebeu o acesso pelo WhatsApp.`
          : `${r.nome} agora é Encarregado, mas o WhatsApp com o acesso não saiu. Peça a ela para tocar em "Esqueci a senha" na tela de login, com o CPF.`,
        r.avisado ? 'ok' : 'atencao',
      )
    })
  }

  return (
    <div className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => !pendente && onFechar()}>
      <div className="modal-pop-in bg-white border border-slate-200 rounded-2xl w-full max-w-md max-h-[88vh] flex flex-col shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <h3 className="text-slate-800 font-bold text-base">{escolhido ? 'Confirmar Encarregado' : 'Criar Encarregado'}</h3>
          <button onClick={onFechar} disabled={pendente} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!escolhido ? (
          <div className="p-4 space-y-3 overflow-y-auto">
            <p className="text-slate-500 text-xs">
              Escolha alguém que <strong>já está na equipe</strong> deste setor. A pessoa passa a poder
              consultar a equipe — sem nenhuma ação.
            </p>
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
                      type="button" disabled={!c.temTelefone}
                      onClick={() => { setErro(null); setEscolhido(c) }}
                      className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="block text-slate-800 text-sm font-semibold truncate">{c.nome}</span>
                      <span className="block text-slate-400 text-xs truncate">
                        {c.cargo ?? 'Sem função definida'}{!c.temTelefone ? ' · sem WhatsApp cadastrado' : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-4 overflow-y-auto">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
              <p className="text-slate-400 text-2xs uppercase tracking-wide font-semibold">Quem</p>
              <p className="text-slate-800 text-sm font-bold">{escolhido.nome}</p>
              <p className="text-slate-400 text-2xs uppercase tracking-wide font-semibold mt-3">Onde terá acesso</p>
              <p className="text-slate-800 text-sm font-semibold">{caminhoDoSetor(setor)}</p>
            </div>
            <div className="space-y-2 text-xs text-slate-600">
              <p className="flex gap-2"><ShieldCheck className="w-4 h-4 text-green-600 shrink-0" />Acesso de <strong>consulta</strong>: ver a equipe e a presença deste setor.</p>
              <p className="flex gap-2"><X className="w-4 h-4 text-red-500 shrink-0" />Sem nenhuma ação: não registra ponto, não aprova, não edita nem remove ninguém.</p>
              <p className="flex gap-2"><X className="w-4 h-4 text-red-500 shrink-0" />Não vê outros setores, subeventos ou equipes do evento.</p>
              <p className="text-slate-500">O acesso é enviado agora por WhatsApp. Você pode removê-lo quando quiser, sem tirar a pessoa da equipe.</p>
            </div>
            {erro && <p role="alert" className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2">{erro}</p>}
            <div className="flex gap-2">
              <button onClick={confirmar} disabled={pendente} className="btn btn-primario flex-1">
                {pendente ? 'Enviando acesso…' : 'Confirmar e enviar acesso'}
              </button>
              <button onClick={() => { setEscolhido(null); setErro(null) }} disabled={pendente} className="btn btn-secundario">Voltar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
