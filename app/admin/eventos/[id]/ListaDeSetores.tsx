'use client'
import { useMemo, useState } from 'react'
import { Search, Users, X } from 'lucide-react'
import FornecedorCard from './FornecedorCard'
import CopiarLinks, { type SetorParaCopiar } from './CopiarLinks'

/**
 * A lista de setores do evento, com busca e cópia em massa dos links.
 *
 * Virou componente de cliente por causa da busca: filtrar no servidor
 * recarregaria a página inteira a cada tecla. Os dados continuam vindo prontos
 * do servidor — aqui só se decide o que aparece.
 *
 * A busca só existe a partir de cinco setores. Antes disso ela seria um campo
 * a mais numa tela que já tem muitos, para filtrar uma lista que cabe na tela.
 */

type Fornecedor = {
  id: string
  nome: string
  token_formulario: string
  quantidade_estimada: number | null
  valor_combinado: number | null
  cpfs_autorizados: string | null
  funcionarios: { count: number }[]
}

type Supervisor = {
  id: string; nome: string; email: string
  cpf: string | null; telefone: string | null; ativo: boolean
}

/** A partir de quantos setores a busca aparece. */
const MINIMO_PARA_BUSCAR = 5

export default function ListaDeSetores({
  fornecedores,
  eventoId,
  supervisoresPorFornecedor,
  podeGerenciarSupervisores,
  podeExcluir,
}: {
  fornecedores: Fornecedor[]
  eventoId: string
  supervisoresPorFornecedor: Record<string, Supervisor[]>
  podeGerenciarSupervisores: boolean
  podeExcluir: boolean
}) {
  const [busca, setBusca] = useState('')

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (!t) return fornecedores
    /*
     * Busca também pelo nome do supervisor.
     *
     * "Onde o Carlos está?" é uma pergunta tão comum quanto "cadê o Bar" — e
     * quem organiza costuma lembrar da pessoa antes de lembrar do setor.
     */
    return fornecedores.filter(f =>
      f.nome.toLowerCase().includes(t) ||
      (supervisoresPorFornecedor[f.id] ?? []).some(s => s.nome.toLowerCase().includes(t)),
    )
  }, [fornecedores, supervisoresPorFornecedor, busca])

  const paraCopiar: SetorParaCopiar[] = fornecedores.map(f => ({
    id: f.id,
    nome: f.nome,
    token: f.token_formulario || null,
  }))

  const totalEquipe = fornecedores.reduce((s, f) => s + (f.funcionarios?.[0]?.count ?? 0), 0)

  return (
    <div className="space-y-3">
      {/* Barra de ferramentas: o resumo à esquerda diz o que a lista tem sem
          precisar contar cartão por cartão. */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <p className="text-slate-500 text-xs tabular-nums">
          <span className="font-semibold text-slate-700">{fornecedores.length}</span> setor{fornecedores.length === 1 ? '' : 'es'}
          {' · '}
          <span className="font-semibold text-slate-700">{totalEquipe}</span> na equipe
        </p>
        <CopiarLinks setores={paraCopiar} />
      </div>

      {fornecedores.length >= MINIMO_PARA_BUSCAR && (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar setor ou supervisor…"
            aria-label="Buscar setor"
            className="input pl-9 pr-9 text-sm"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {!visiveis.length ? (
        <div className="text-center py-8">
          <Users className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-slate-500 text-sm mt-2">Nenhum setor com “{busca}”.</p>
          <button onClick={() => setBusca('')} className="text-brand-600 text-xs font-semibold hover:underline mt-1">
            Limpar busca
          </button>
        </div>
      ) : (
        /*
         * Grade, não pilha.
         *
         * É o que a largura inteira destrava: com uma coluna só, sete setores
         * viravam uma rolagem longa em que nenhum cartão cabia junto do
         * seguinte. Duas colunas a partir do tablet, três no monitor.
         *
         * `items-start` para o cartão não esticar até a altura do vizinho — um
         * setor com três supervisores não pode inflar o que está do lado.
         */
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-3 items-start">
          {visiveis.map(f => (
            <FornecedorCard
              key={f.id}
              fornecedor={f}
              eventoId={eventoId}
              supervisores={supervisoresPorFornecedor[f.id] ?? []}
              podeGerenciarSupervisores={podeGerenciarSupervisores}
              podeExcluir={podeExcluir}
            />
          ))}
        </div>
      )}
    </div>
  )
}
