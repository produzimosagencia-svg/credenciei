'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Minus, RotateCcw, AlertTriangle, Loader2 } from 'lucide-react'
import { salvarPermissao, type PermissaoSalva } from '@/lib/actions'
import { CAPACIDADES, PAPEIS_CONFIGURAVEIS, ROLE_LABELS, chaveDaPermissao, type Role } from '@/lib/permissions'

type Estado = 'padrao' | 'liberado' | 'bloqueado'

/**
 * A grade de permissões — cada célula tem TRÊS estados, não dois.
 *
 * "Padrão" não é o mesmo que "bloqueado": é "o que o sistema decide", e ele
 * pode mudar numa versão futura sem que ninguém tenha de reconfigurar nada.
 * Uma grade de duas posições obrigaria a congelar hoje a régua inteira em
 * banco, e no dia em que uma regra do código mudasse, toda organização
 * continuaria presa à cópia velha, sem saber.
 *
 * Cada clique salva na hora. Não existe "Salvar" no fim: com cinquenta
 * células, um botão só transformaria qualquer engano numa dúvida sobre o que
 * exatamente foi enviado.
 */
export default function GradePermissoes({
  organizacaoId, salvas,
}: {
  organizacaoId: string | null
  salvas: PermissaoSalva[]
}) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const mapa = new Map(salvas.map(p => [chaveDaPermissao(p.role, p.chave), p.permitido]))

  const estadoDe = (role: Role, chave: string): Estado => {
    const salvo = mapa.get(chaveDaPermissao(role, chave))
    if (salvo === undefined) return 'padrao'
    return salvo ? 'liberado' : 'bloqueado'
  }

  /*
   * O ciclo do clique é sempre o mesmo: o que o sistema faz hoje → o
   * contrário disso → de volta ao padrão. Assim um clique só já resolve o
   * caso comum ("quero o oposto do que está aí"), e o terceiro desfaz.
   */
  const proximo = (atual: Estado, padrao: boolean): boolean | null => {
    if (atual === 'padrao') return !padrao
    if (atual === (padrao ? 'bloqueado' : 'liberado')) return padrao
    return null
  }

  const clicar = (role: Role, chave: string, padrao: boolean) => {
    const id = chaveDaPermissao(role, chave)
    const alvo = proximo(estadoDe(role, chave), padrao)
    setErro(null)
    setSalvando(id)
    startTransition(async () => {
      const r = await salvarPermissao(organizacaoId, role, chave, alvo)
      setSalvando(null)
      if (r.error) { setErro(r.error); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      {erro && (
        <p className="flex items-start gap-1.5 text-red-600 text-xs px-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 text-2xs uppercase tracking-wide border-b border-slate-100">
              <th className="text-left font-semibold px-4 py-2.5">Funcionalidade</th>
              {PAPEIS_CONFIGURAVEIS.map(p => (
                <th key={p} className="font-semibold px-4 py-2.5 text-center whitespace-nowrap">
                  {ROLE_LABELS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPACIDADES.map(c => (
              <tr key={c.chave} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-3 align-top">
                  <p className="text-slate-800 font-medium">{c.nome}</p>
                  <p className="text-slate-400 text-xs mt-0.5">{c.descricao}</p>
                  {c.peso && (
                    <p className="text-amber-700 text-2xs mt-1 flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0 mt-px" /> {c.peso}
                    </p>
                  )}
                </td>
                {PAPEIS_CONFIGURAVEIS.map(role => {
                  const padrao = c.padrao(role)
                  const estado = estadoDe(role, c.chave)
                  const id = chaveDaPermissao(role, c.chave)
                  return (
                    <td key={role} className="px-4 py-3 text-center">
                      <Celula
                        estado={estado}
                        padrao={padrao}
                        salvando={salvando === id}
                        onClick={() => clicar(role, c.chave, padrao)}
                        rotulo={`${c.nome} para ${ROLE_LABELS[role]}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-slate-400 text-xs px-4 pb-1">
        Clique para alternar: <strong className="text-slate-500">padrão do sistema</strong> →{' '}
        o contrário → de volta ao padrão. Alterado aparece com a marca laranja.
      </p>
    </div>
  )
}

function Celula({
  estado, padrao, salvando, onClick, rotulo,
}: {
  estado: Estado
  padrao: boolean
  salvando: boolean
  onClick: () => void
  rotulo: string
}) {
  const vale = estado === 'padrao' ? padrao : estado === 'liberado'
  const alterado = estado !== 'padrao'

  return (
    <button
      onClick={onClick}
      disabled={salvando}
      aria-label={rotulo}
      title={alterado
        ? `${vale ? 'Liberado' : 'Bloqueado'} por configuração — clique para ${estado === (padrao ? 'bloqueado' : 'liberado') ? 'inverter' : 'voltar ao padrão'}`
        : `Padrão do sistema: ${vale ? 'pode' : 'não pode'}`}
      className={`btn-press w-9 h-9 inline-flex items-center justify-center rounded-lg border transition-colors ${
        alterado
          ? 'border-brand-300 bg-brand-50'
          : 'border-transparent hover:bg-slate-100'
      } ${salvando ? 'opacity-50' : ''}`}
    >
      {salvando
        ? <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />
        : vale
          ? <Check className={`w-4 h-4 ${alterado ? 'text-brand-600' : 'text-green-600'}`} />
          : alterado
            ? <RotateCcw className="w-3.5 h-3.5 text-brand-600" />
            : <Minus className="w-4 h-4 text-slate-300" />}
    </button>
  )
}
