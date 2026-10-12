'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Clock, Check, AlertCircle, Save } from 'lucide-react'
import { salvarConfiguracaoEntradaLivre, type ConfiguracaoEntradaLivre } from '@/lib/actions'

/**
 * "Entrada em qualquer horário" do evento inteiro (pedido do Juan, 12/10/2026: "lá no editar, vale pôr uma aba de
 * entrada em qualquer horário também, igual tem a do meio"). Mesma ideia da seção do meio: a lista dos fornecedores,
 * com "Marcar todos". Grava o MESMO campo da caixinha dentro do fornecedor — marcar aqui vale pros marcados; marcar só
 * dentro do fornecedor vale só pra ele. Com TODOS marcados, o fornecedor novo já nasce marcado.
 */
export default function ConfiguracaoEntradaQualquerHorario({ eventoId, config }: { eventoId: string; config: ConfiguracaoEntradaLivre }) {
  const [setores, setSetores] = useState<Set<string>>(() => new Set(config.setores.filter(s => s.ligado).map(s => s.id)))
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const router = useRouter()

  const todos = setores.size === config.setores.length && config.setores.length > 0
  const alternar = (id: string) => {
    setFeito(null)
    setSetores(a => { const p = new Set(a); if (p.has(id)) p.delete(id); else p.add(id); return p })
  }

  const salvar = () => {
    setErro(null); setFeito(null)
    iniciar(async () => {
      const r = await salvarConfiguracaoEntradaLivre(eventoId, [...setores])
      if ('erro' in r) { setErro(r.erro); return }
      setFeito(r.setores === 0
        ? 'Nenhum fornecedor com entrada em qualquer horário — todos seguem o horário de entrada do evento.'
        : r.setores === r.total
          ? `Todos os ${r.total} fornecedores entram em qualquer horário. Fornecedor novo já nasce marcado.`
          : `${r.setores} de ${r.total} fornecedores entram em qualquer horário.`)
      router.refresh()
    })
  }

  return (
    <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700">Entrada em qualquer horário</p>
          <p className="text-slate-600 text-xs mt-0.5">
            Os fornecedores marcados <strong>não seguem o horário de entrada</strong> configurado no evento — pra quem foge
            da escala combinada (banda, postura, atrações e afins).
          </p>
          <p className="text-slate-500 text-2xs mt-1">
            É a mesma caixinha de dentro do fornecedor: marcar aqui vale para todos os marcados; marcar só dentro de um
            fornecedor vale só para ele. Com todos marcados, o fornecedor novo já nasce marcado.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-amber-100 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-slate-700">Fornecedores com entrada em qualquer horário</p>
          {config.setores.length > 0 && (
            <button
              type="button"
              onClick={() => { setFeito(null); setSetores(todos ? new Set() : new Set(config.setores.map(s => s.id))) }}
              className="text-brand-600 text-2xs font-semibold hover:underline shrink-0"
            >
              {todos ? 'Desmarcar todos' : 'Marcar todos'}
            </button>
          )}
        </div>
        {!config.setores.length ? (
          <p className="text-slate-400 text-xs">Este evento ainda não tem fornecedores cadastrados.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 max-h-52 overflow-y-auto">
            {config.setores.map(s => {
              const marcado = setores.has(s.id)
              return (
                <label
                  key={s.id}
                  className={`flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1.5 text-xs transition-colors ${
                    marcado ? 'bg-brand-50 text-brand-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <input type="checkbox" checked={marcado} onChange={() => alternar(s.id)} className="h-3.5 w-3.5 accent-brand-500 shrink-0" />
                  <span className="truncate">{s.nome}</span>
                </label>
              )
            })}
          </div>
        )}
        {!config.disponivel && (
          <p className="text-amber-700 text-2xs">O banco ainda não tem o campo de entrada em qualquer horário — rode a migração pendente antes de salvar.</p>
        )}
      </div>

      {erro && <p className="flex items-start gap-1.5 text-erro-600 text-xs"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}</p>}
      {feito && <p className="flex items-start gap-1.5 text-green-700 text-xs"><Check className="w-3.5 h-3.5 shrink-0 mt-px" /> {feito}</p>}
      <button type="button" onClick={salvar} disabled={pendente || !config.setores.length} className="btn btn-primario btn-sm">
        <Save className="w-3.5 h-3.5" /> {pendente ? 'Salvando…' : 'Salvar entrada em qualquer horário'}
      </button>
    </div>
  )
}
