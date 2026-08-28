'use client'
import { useMemo, useState, useTransition } from 'react'
import { Send, Eye, AlertCircle, Check, Users } from 'lucide-react'
import { previaDisparo, dispararEmMassa } from '@/lib/actions-whatsapp'

type Evento = { id: string; nome: string; ativo: boolean }
type Setor = { id: string; nome: string; eventoId: string }
type Template = { nome: string; variaveis: number; corpo: string }

/**
 * O formulário do disparo.
 *
 * O botão de enviar só acende depois da prévia. Não é capricho: mil mensagens
 * saem em minutos e não voltam, e a diferença entre acertar o setor e acertar
 * o evento inteiro é um clique. Obrigar a ver a contagem e alguns nomes antes
 * é a única trava que funciona contra isso.
 */
export default function FormDisparo({ eventos, setores, templates }: {
  eventos: Evento[]; setores: Setor[]; templates: Template[]
}) {
  const [eventoId, setEventoId] = useState(eventos[0]?.id ?? '')
  const [setorId, setSetorId] = useState('')
  const [somenteAtivos, setSomenteAtivos] = useState(true)
  const [templateNome, setTemplateNome] = useState('')
  const [valores, setValores] = useState<string[]>([])
  const [previa, setPrevia] = useState<Awaited<ReturnType<typeof previaDisparo>> | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const template = templates.find(t => t.nome === templateNome)
  const setoresDoEvento = useMemo(() => setores.filter(s => s.eventoId === eventoId), [setores, eventoId])

  // Qualquer mudança no alvo invalida a prévia: ela deixou de descrever quem
  // vai receber, e deixar o botão aceso seria mentir sobre o que foi conferido.
  const mudou = () => { setPrevia(null); setFeito(null); setErro(null) }

  const conferir = () => {
    setErro(null)
    startTransition(async () => {
      try { setPrevia(await previaDisparo({ eventoId, fornecedorId: setorId || undefined, somenteAtivos })) }
      catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Não foi possível conferir.') }
    })
  }

  const disparar = () => {
    if (!previa || !template) return
    setErro(null)
    startTransition(async () => {
      try {
        const r = await dispararEmMassa(
          { eventoId, fornecedorId: setorId || undefined, somenteAtivos },
          template.nome,
          Array.from({ length: template.variaveis }, (_, i) => valores[i] ?? ''),
        )
        setFeito(`${r.enfileiradas} mensagem(ns) na fila.` + (r.semTelefone ? ` ${r.semTelefone} sem telefone válido ficaram de fora.` : ''))
        setPrevia(null)
      } catch (e: unknown) { setErro(e instanceof Error ? e.message : 'Não foi possível disparar.') }
    })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className="text-slate-500 text-xs">Evento</span>
          <select value={eventoId} onChange={e => { setEventoId(e.target.value); setSetorId(''); mudou() }} className="input mt-1">
            {eventos.map(e => <option key={e.id} value={e.id}>{e.nome}{e.ativo ? '' : ' · encerrado'}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-slate-500 text-xs">Setor</span>
          <select value={setorId} onChange={e => { setSetorId(e.target.value); mudou() }} className="input mt-1">
            <option value="">Todos os setores do evento</option>
            {setoresDoEvento.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </label>
      </div>

      <label className="flex items-start gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3 cursor-pointer">
        <input type="checkbox" checked={somenteAtivos}
          onChange={e => { setSomenteAtivos(e.target.checked); mudou() }}
          className="mt-0.5 w-4 h-4 shrink-0 accent-brand-500" />
        <span className="text-slate-600 text-xs">
          Só quem está <strong>ativado</strong> para trabalhar. Desmarcando, entram também os cadastros
          acima do teto do setor — gente que não vai trabalhar.
        </span>
      </label>

      <label className="block">
        <span className="text-slate-500 text-xs">Template aprovado</span>
        <select value={templateNome} onChange={e => { setTemplateNome(e.target.value); setValores([]); mudou() }} className="input mt-1">
          <option value="">Escolher…</option>
          {templates.map(t => <option key={t.nome} value={t.nome}>{t.nome} ({t.variaveis} variáveis)</option>)}
        </select>
      </label>

      {template && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
          <p className="text-slate-500 text-2xs uppercase tracking-wide font-semibold">Texto aprovado</p>
          <pre className="text-slate-600 text-xs whitespace-pre-wrap font-sans">{template.corpo}</pre>
          {template.variaveis > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-slate-500 text-2xs uppercase tracking-wide font-semibold">
                Preencha as variáveis — o mesmo valor vai para todo mundo
              </p>
              {Array.from({ length: template.variaveis }, (_, i) => (
                <label key={i} className="flex items-center gap-2">
                  <span className="text-slate-500 text-xs font-mono shrink-0 w-10">{`{{${i + 1}}}`}</span>
                  <input value={valores[i] ?? ''} onChange={e => {
                    const v = [...valores]; v[i] = e.target.value; setValores(v); setFeito(null)
                  }} className="input" placeholder={`Valor de {{${i + 1}}}`} />
                </label>
              ))}
              <p className="text-slate-400 text-2xs">
                Disparo em massa manda o mesmo texto para todos. Para mensagem personalizada por
                pessoa (nome, credencial), quem faz isso são os avisos automáticos.
              </p>
            </div>
          )}
        </div>
      )}

      {erro && <p className="flex items-start gap-1.5 text-erro-600 text-xs"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}</p>}
      {feito && <p className="flex items-start gap-1.5 text-green-700 text-xs"><Check className="w-3.5 h-3.5 shrink-0 mt-px" /> {feito}</p>}

      {previa && (
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-3 space-y-1.5">
          <p className="flex items-center gap-1.5 text-brand-700 text-sm font-semibold">
            <Users className="w-4 h-4" /> {previa.total} pessoa(s) vão receber
          </p>
          {!!previa.semTelefone && (
            <p className="text-amber-700 text-xs">{previa.semTelefone} sem telefone válido ficam de fora.</p>
          )}
          <p className="text-slate-600 text-xs">
            {previa.amostra.map(a => a.nome).join(' · ')}{previa.total > previa.amostra.length ? ' …' : ''}
          </p>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={conferir} disabled={pendente || !eventoId} className="btn btn-secundario">
          <Eye className="w-4 h-4 shrink-0" /> {pendente ? 'Conferindo…' : 'Ver quem vai receber'}
        </button>
        <button onClick={disparar}
          disabled={pendente || !previa || !template || !previa.total}
          title={!previa ? 'Confira quem vai receber antes de disparar' : undefined}
          className="btn btn-primario">
          <Send className="w-4 h-4 shrink-0" />
          {pendente ? 'Enfileirando…' : previa ? `Disparar para ${previa.total}` : 'Disparar'}
        </button>
      </div>
    </div>
  )
}
