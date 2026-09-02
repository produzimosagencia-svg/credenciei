'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, AlertCircle, Save } from 'lucide-react'
import { salvarConfiguracaoDoMeio, type ConfiguracaoDoMeio as Config } from '@/lib/actions'
import { mensagemAmigavel } from '@/lib/erros'

/**
 * Quem pede a batida do meio, e quando.
 *
 * O meio não tem horário para configurar — ele é a entrada real de cada
 * pessoa + 4h, e continua assim. O que se configura aqui é OUTRA coisa:
 * QUAIS SETORES pedem, e EM QUAIS DIAS.
 *
 * Isso é uma decisão de custo, não de estética: são duas mensagens de
 * WhatsApp cobradas por pessoa por dia (lembrete + reforço). Num evento de
 * 630 pessoas e onze dias, deixar o meio ligado em tudo passa de dez mil
 * mensagens — quase todas para equipe cujo pagamento não depende do meio.
 *
 * As duas listas se combinam com E: o meio acontece quando o setor está
 * ligado E o dia está marcado (ver `lib/meio.ts`). É por isso que o resumo
 * no rodapé multiplica os dois números — é o que a pessoa vai pagar.
 */
export default function ConfiguracaoDoMeio({ eventoId, config }: { eventoId: string; config: Config }) {
  const [setores, setSetores] = useState<Set<string>>(
    () => new Set(config.setores.filter(s => s.exigeMeio).map(s => s.id)),
  )
  const [dias, setDias] = useState<Set<string>>(
    () => new Set(config.dias.filter(d => d.exigeMeio).map(d => d.data)),
  )
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const alternar = <T,>(set: Set<T>, valor: T) => {
    const proximo = new Set(set)
    if (proximo.has(valor)) proximo.delete(valor)
    else proximo.add(valor)
    return proximo
  }

  const todosSetores = setores.size === config.setores.length && config.setores.length > 0
  const todosDias = dias.size === config.dias.length && config.dias.length > 0

  const salvar = () => {
    setErro(null)
    setFeito(null)
    startTransition(async () => {
      try {
        const r = await salvarConfiguracaoDoMeio(eventoId, [...setores], [...dias])
        setFeito(
          r.setores === 0 || r.dias === 0
            ? 'O meio está desligado neste evento — ninguém vai receber lembrete nem aparecer como pendente.'
            : `Meio ligado em ${r.setores} setor(es), em ${r.dias} dia(s).`,
        )
        router.refresh()
      } catch (e: unknown) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  const rotuloDia = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }
  const ligado = setores.size > 0 && dias.size > 0

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
          <Camera className="w-3.5 h-3.5 text-blue-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700">Batida do meio</p>
          <p className="text-slate-600 text-xs mt-0.5">
            O sistema pede a batida por foto <strong>4 horas depois da entrada</strong> de cada
            pessoa. Quem entrar às 08:00 registra às 12:00; quem entrar às 10:30 registra às 14:30.
          </p>
          <p className="text-slate-500 text-2xs mt-1">
            Não tem horário pra configurar — a equipe não entra junta, e um horário fixo cobraria de
            quem acabou de chegar. O que se escolhe aqui é <strong>quais setores</strong> pedem e{' '}
            <strong>em quais dias</strong>.
          </p>
        </div>
      </div>

      {/* ── Setores ─────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-blue-100 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">Setores que pedem o meio</p>
          {config.setores.length > 0 && (
            <button
              type="button"
              onClick={() => setSetores(todosSetores ? new Set() : new Set(config.setores.map(s => s.id)))}
              className="text-brand-600 text-2xs font-semibold hover:underline shrink-0"
            >
              {todosSetores ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          )}
        </div>
        {!config.setores.length ? (
          <p className="text-slate-400 text-xs">Este evento ainda não tem setores cadastrados.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto">
            {config.setores.map(s => {
              const marcado = setores.has(s.id)
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-2 cursor-pointer rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                    marcado ? 'border-brand-300 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="checkbox" checked={marcado}
                    onChange={() => { setFeito(null); setSetores(a => alternar(a, s.id)) }}
                    className="h-3.5 w-3.5 accent-brand-500 shrink-0"
                  />
                  <span className="truncate">{s.nome}</span>
                </label>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Dias ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-blue-100 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">Dias com batida do meio</p>
          {config.dias.length > 0 && (
            <button
              type="button"
              onClick={() => setDias(todosDias ? new Set() : new Set(config.dias.map(d => d.data)))}
              className="text-brand-600 text-2xs font-semibold hover:underline shrink-0"
            >
              {todosDias ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          )}
        </div>
        {!config.dias.length ? (
          <p className="text-slate-400 text-xs">
            Marque os dias de trabalho logo abaixo e salve — eles aparecem aqui em seguida.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {config.dias.map(d => {
              const marcado = dias.has(d.data)
              return (
                <button
                  key={d.data}
                  type="button"
                  onClick={() => { setFeito(null); setDias(a => alternar(a, d.data)) }}
                  className={`w-[62px] py-1.5 rounded-lg border text-center transition-colors ${
                    marcado ? 'bg-brand-50 border-brand-300 text-brand-700' : 'bg-white border-slate-200 text-slate-500 hover:border-brand-300'
                  }`}
                >
                  <span className="block text-2xs uppercase tracking-wide opacity-70">
                    {d.tipo === 'principal' ? 'evento' : 'prep.'}
                  </span>
                  <span className="block text-xs font-semibold tabular-nums">{rotuloDia(d.data)}</span>
                  <span className="block h-3">{marcado ? <Check className="w-3 h-3 mx-auto" /> : null}</span>
                </button>
              )
            })}
          </div>
        )}
        {!config.diasDisponiveis && (
          <p className="text-amber-700 text-2xs">
            A escolha por dia só passa a valer depois que a migração{' '}
            <code>supabase/upgrade-meio-por-dia.sql</code> for aplicada no banco. Até lá, todo dia
            pede o meio nos setores marcados acima.
          </p>
        )}
      </div>

      <p className="text-slate-500 text-2xs">
        {ligado
          ? <>O meio vai ser pedido a quem estiver nos <strong>{setores.size} setor(es)</strong> marcados, nos <strong>{dias.size} dia(s)</strong> marcados — e só neles.</>
          : <>Nenhuma combinação marcada: o meio fica <strong>desligado</strong> neste evento. O cartão some da credencial, ninguém recebe lembrete e ninguém aparece como pendente do meio.</>}
        {' '}Batida já registrada continua no histórico de qualquer forma — desligar não apaga nada.
      </p>

      {erro && (
        <p className="flex items-start gap-1.5 text-erro-600 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}
      {feito && (
        <p className="flex items-start gap-1.5 text-green-700 text-xs">
          <Check className="w-3.5 h-3.5 shrink-0 mt-px" /> {feito}
        </p>
      )}

      {/* Botão próprio, e não o "Salvar" do formulário do evento: este bloco
          grava em outras tabelas (fornecedores e jornada_dias) e reagenda as
          mensagens — não deve depender de o produtor mexer em mais nada. */}
      <button type="button" onClick={salvar} disabled={pendente} className="btn btn-secundario">
        <Save className="w-3.5 h-3.5 shrink-0" />
        {pendente ? 'Salvando…' : 'Salvar configuração do meio'}
      </button>
    </div>
  )
}
