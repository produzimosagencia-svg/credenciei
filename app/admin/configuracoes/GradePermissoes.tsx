'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw, AlertTriangle } from 'lucide-react'
import { LogoLoading } from '@/components/LogoLoading'
import { salvarPermissao, type PermissaoSalva } from '@/lib/actions'
import { CAPACIDADES, PAPEIS_CONFIGURAVEIS, ROLE_LABELS, chaveDaPermissao, type Role } from '@/lib/permissions'

/**
 * A grade de permissões — um interruptor por papel, por capacidade.
 *
 * ─── POR QUE O INTERRUPTOR É BINÁRIO, SE O DADO TEM TRÊS ESTADOS ────────────
 *
 * No banco existem três situações: liberado, bloqueado e "sem linha" (segue o
 * padrão do código). A primeira versão desta tela expunha as três num clique
 * que ciclava entre elas — e ficou ilegível: ninguém olha uma grade de
 * cinquenta células para descobrir em que ponto do ciclo cada uma está.
 *
 * O interruptor mostra o que VALE agora, que é a única pergunta que se faz
 * olhando pra cá. O terceiro estado continua existindo no banco, mas deixou
 * de precisar de clique próprio: ao ligar/desligar, se o valor escolhido for
 * igual ao padrão do sistema, a exceção é APAGADA em vez de gravada. Voltar
 * ao padrão passou a ser consequência, não mais um passo a decorar.
 *
 * A marca laranja diz "isto aqui foi decidido por alguém, não é o padrão" —
 * e é ela que dá o botão de desfazer, para o caso de a regra do código mudar
 * um dia e a organização querer voltar a acompanhá-la.
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

  const gravar = (role: Role, chave: string, valor: boolean | null) => {
    const id = chaveDaPermissao(role, chave)
    setErro(null)
    setSalvando(id)
    startTransition(async () => {
      const r = await salvarPermissao(organizacaoId, role, chave, valor)
      setSalvando(null)
      if (r.error) { setErro(r.error); return }
      router.refresh()
    })
  }

  return (
    <div>
      {erro && (
        <p className="flex items-start gap-1.5 text-red-600 text-xs px-4 pt-3">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-4 py-3 text-2xs uppercase tracking-wide text-slate-400 font-semibold">
                Funcionalidade
              </th>
              {PAPEIS_CONFIGURAVEIS.map(p => (
                <th key={p} className="px-4 py-3 text-2xs uppercase tracking-wide text-slate-400 font-semibold text-center whitespace-nowrap">
                  {ROLE_LABELS[p]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPACIDADES.map(c => (
              <tr key={c.chave} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/40">
                <td className="px-4 py-3.5 align-middle max-w-md">
                  <p className="text-slate-800 font-medium">{c.nome}</p>
                  <p className="text-slate-400 text-xs mt-0.5">
                    {c.descricao}
                    {/* O peso entra na MESMA linha da descrição, em cinza. Em
                        âmbar e em linha própria, metade da tabela virava
                        aviso e a grade ficava impossível de ler. */}
                    {c.peso && (
                      <span className="text-amber-600"> · {c.peso}</span>
                    )}
                  </p>
                </td>
                {PAPEIS_CONFIGURAVEIS.map(role => {
                  const padrao = c.padrao(role)
                  const id = chaveDaPermissao(role, c.chave)
                  const salvo = mapa.get(id)
                  const alterado = salvo !== undefined
                  const vale = alterado ? salvo : padrao
                  return (
                    <td key={role} className="px-4 py-3.5 text-center">
                      <div className="inline-flex items-center gap-1.5">
                        <Interruptor
                          ligado={vale}
                          alterado={alterado}
                          salvando={salvando === id}
                          rotulo={`${c.nome} para ${ROLE_LABELS[role]}`}
                          /*
                           * Se o valor novo é o próprio padrão do sistema, a
                           * exceção deixa de existir em vez de virar uma linha
                           * dizendo o mesmo que o código já diz.
                           */
                          onClick={() => gravar(role, c.chave, !vale === padrao ? null : !vale)}
                        />
                        {alterado && (
                          <button
                            onClick={() => gravar(role, c.chave, null)}
                            disabled={salvando === id}
                            title={`Voltar ao padrão do sistema (${padrao ? 'ligado' : 'desligado'})`}
                            aria-label={`Voltar ${c.nome} de ${ROLE_LABELS[role]} ao padrão do sistema`}
                            className="btn-press text-brand-500 hover:text-brand-600 disabled:opacity-40"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-slate-400 text-xs px-4 py-3 border-t border-slate-100">
        O interruptor mostra o que vale agora: <span className="text-brand-600 font-medium">laranja</span> pode,
        cinza não pode. O que tiver <span className="text-brand-600 font-medium">anel e a seta de desfazer</span>{' '}
        foi mudado aqui e não segue mais o padrão do sistema — a seta devolve.
      </p>
    </div>
  )
}

/**
 * O interruptor.
 *
 * `button` com `role="switch"`, e não `input[type=checkbox]`: o estado vem do
 * servidor e volta pelo `router.refresh()`, então quem manda na posição é a
 * prop, nunca o navegador. Um checkbox se moveria sozinho no clique e depois
 * pularia de volta se a gravação falhasse.
 */
function Interruptor({
  ligado, alterado, salvando, onClick, rotulo,
}: {
  ligado: boolean
  alterado: boolean
  salvando: boolean
  onClick: () => void
  rotulo: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={onClick}
      disabled={salvando}
      title={`${ligado ? 'Pode' : 'Não pode'}${alterado ? ' — alterado nesta organização' : ' — padrão do sistema'}`}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors disabled:opacity-50 ${
        ligado
          ? 'bg-brand-500 border-brand-500'
          : 'bg-slate-200 border-slate-200'
      } ${alterado ? 'ring-2 ring-brand-200 ring-offset-1' : ''}`}
    >
      <span
        className={`inline-flex items-center justify-center h-4 w-4 rounded-full bg-white shadow transition-transform ${
          ligado ? 'translate-x-[1.125rem]' : 'translate-x-0.5'
        }`}
      >
        {salvando && <LogoLoading tamanho={13} />}
      </span>
    </button>
  )
}
