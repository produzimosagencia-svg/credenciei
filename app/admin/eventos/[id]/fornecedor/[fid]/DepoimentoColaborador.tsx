'use client'
import { useEffect, useState, useTransition } from 'react'
import { AlertCircle, ShieldCheck } from 'lucide-react'
import { adicionarDepoimento, avaliarColaborador, listarDepoimentos } from '@/lib/actions'
import { TIPOS_ESCOLHIVEIS, TAMANHO_MAXIMO_DEPOIMENTO, type Depoimento, type ResumoAvaliacoes } from '@/lib/depoimentos'
import { EstrelasEditaveis } from '@/components/EstrelasNota'
import ListaDepoimentos, { ResumoDeNotas } from '@/components/ListaDepoimentos'
import { LoadingConteudo } from '@/components/LogoLoading'

type Dados = {
  depoimentos: Depoimento[]
  veTudo: boolean
  avaliacoes: ResumoAvaliacoes
  minhaNota: number | null
  podeAvaliar: boolean
  motivoSemAvaliar: string | null
}

/**
 * Aba "Depoimento do colaborador" (pedido do Juan, 06/10/2026): observações e
 * nota em estrelas sobre a PESSOA, guardadas pelo CPF — valem para os próximos
 * eventos e sobrevivem a bloqueio de CPF. O master vê o histórico completo, de
 * todas as organizações; os demais, o que foi escrito na organização deste evento.
 */
export default function DepoimentoColaborador({
  funcionarioId, fornecedorId, eventoId, nome,
}: {
  funcionarioId: string
  fornecedorId: string
  eventoId: string
  nome: string
}) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<'positivo' | 'neutro' | 'atencao'>('neutro')
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [salvando, startSalvar] = useTransition()
  const [avaliando, startAvaliar] = useTransition()

  const carregar = async () => {
    const r = await listarDepoimentos(funcionarioId, fornecedorId, eventoId)
    if ('erro' in r) { setErroCarga(r.erro); return }
    setErroCarga(null)
    setDados(r)
  }
  useEffect(() => {
    let vivo = true
    listarDepoimentos(funcionarioId, fornecedorId, eventoId)
      .then(r => { if (!vivo) return; if ('erro' in r) setErroCarga(r.erro); else setDados(r) })
      .catch(() => { if (vivo) setErroCarga('Não consegui carregar — confira a internet e tente de novo.') })
    return () => { vivo = false }
  }, [funcionarioId, fornecedorId, eventoId])

  const salvar = () => {
    setErro(null)
    setSalvo(false)
    startSalvar(async () => {
      try {
        const r = await adicionarDepoimento(funcionarioId, fornecedorId, eventoId, { texto, tipo })
        if ('erro' in r) { setErro(r.erro); return }
        setTexto('')
        setSalvo(true)
        await carregar()
      } catch {
        setErro('Não consegui salvar — confira a internet e tente de novo.')
      }
    })
  }

  const avaliar = (nota: number) => {
    setErro(null)
    startAvaliar(async () => {
      try {
        const r = await avaliarColaborador(funcionarioId, fornecedorId, eventoId, nota)
        if ('erro' in r) { setErro(r.erro); return }
        await carregar()
      } catch {
        setErro('Não consegui salvar a nota — confira a internet e tente de novo.')
      }
    })
  }

  if (erroCarga) return <div className="p-6 text-erro-600 text-sm">{erroCarga}</div>
  if (!dados) return <div className="p-6"><LoadingConteudo /></div>

  return (
    <div className="p-6 space-y-5">
      <p className="flex items-start gap-1.5 text-slate-500 text-xs">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px text-slate-400" />
        {dados.veTudo
          ? 'Você é master: vê o histórico completo desta pessoa, de todas as organizações.'
          : 'Você vê o que foi escrito sobre esta pessoa na sua organização.'}
        {' '}Fica guardado para os próximos eventos, mesmo se o CPF for bloqueado.
      </p>

      {/* Nota em estrelas — depois do evento. */}
      <section className="space-y-2">
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Nota neste evento</p>
        {dados.podeAvaliar ? (
          <div className="flex items-center gap-3">
            <EstrelasEditaveis nota={dados.minhaNota} onEscolher={avaliar} desabilitado={avaliando} />
            <span className="text-slate-500 text-xs">{dados.minhaNota ? `${dados.minhaNota} de 5` : 'Toque numa estrela'}</span>
          </div>
        ) : (
          <p className="text-slate-500 text-xs">
            {dados.motivoSemAvaliar ?? 'Avaliação indisponível.'}
            {dados.minhaNota ? ` Nota dada: ${dados.minhaNota} de 5.` : ''}
          </p>
        )}
        <ResumoDeNotas resumo={dados.avaliacoes} mostrarOrganizacao={dados.veTudo} />
      </section>

      {/* Novo depoimento */}
      <section className="space-y-2.5 border-t border-slate-100 pt-4">
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">Novo depoimento sobre {nome.split(' ')[0]}</p>
        <div className="flex gap-1.5">
          {TIPOS_ESCOLHIVEIS.map(t => (
            <button
              key={t.valor} type="button" onClick={() => setTipo(t.valor)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                tipo === t.valor ? 'bg-brand-500 border-brand-500 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
              }`}
            >
              {t.rotulo}
            </button>
          ))}
        </div>
        <textarea
          value={texto} onChange={e => { setTexto(e.target.value); setSalvo(false) }}
          rows={4} maxLength={TAMANHO_MAXIMO_DEPOIMENTO}
          placeholder="Ex.: chegou no horário, ótimo atendimento no bar; ou: faltou sem avisar e atrasou a montagem."
          className="input w-full resize-none text-sm"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400 text-2xs tabular-nums">{texto.length}/{TAMANHO_MAXIMO_DEPOIMENTO}</span>
          {salvo && <span className="text-green-600 text-xs font-semibold">Salvo no histórico</span>}
        </div>
        {erro && (
          <p className="flex items-start gap-1.5 text-erro-600 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
          </p>
        )}
        <button type="button" onClick={salvar} disabled={salvando || texto.trim().length < 3} className="btn btn-primario w-full disabled:opacity-50">
          {salvando ? 'Salvando…' : 'Salvar depoimento'}
        </button>
      </section>

      {/* Histórico */}
      <section className="space-y-2.5 border-t border-slate-100 pt-4">
        <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">
          Histórico de comportamento ({dados.depoimentos.length})
        </p>
        <ListaDepoimentos depoimentos={dados.depoimentos} mostrarOrganizacao={dados.veTudo} />
      </section>
    </div>
  )
}
