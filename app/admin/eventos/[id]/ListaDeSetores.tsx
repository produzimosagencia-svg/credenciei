'use client'
import { useMemo, useState } from 'react'
import { Search, Users, X, User, MessageCircle, Phone } from 'lucide-react'
import FornecedorCard from './FornecedorCard'
import CopiarLinks, { type SetorParaCopiar } from './CopiarLinks'
import { formatCpf } from '@/lib/format'

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
  exige_meio?: boolean | null
  funcionarios: { count: number }[]
}

type Supervisor = {
  id: string; nome: string; email: string
  cpf: string | null; telefone: string | null; ativo: boolean
}

type FuncionarioDoSetor = { id: string; nome: string; cpf: string; telefone: string; cargo?: string | null; fornecedor_id?: string }
type DiaDoEvento = { data: string; tipo: string }

/*
 * A busca deixou de ter um teto de "a partir de quantos setores aparece".
 * Antes ela só filtrava setor/supervisor, e numa lista pequena o campo era
 * um elemento a mais numa tela que já tem muitos. Agora ela TAMBÉM acha
 * pessoa — e um evento com poucos setores ainda pode ter centenas de
 * funcionários dentro deles: "achar o Carlos pra ligar pra ele agora" vale
 * independente de quantos cartões de setor existem.
 */
/** A partir de quantos caracteres a busca por pessoa começa a filtrar. */
const MINIMO_PARA_BUSCAR_PESSOA = 2

export default function ListaDeSetores({
  fornecedores,
  eventoId,
  supervisoresPorFornecedor,
  funcionariosDoEvento,
  diasDoEvento,
  setoresComMeio,
  podeGerenciarSupervisores,
  podeExcluir,
}: {
  fornecedores: Fornecedor[]
  eventoId: string
  supervisoresPorFornecedor: Record<string, Supervisor[]>
  /* Todo mundo do EVENTO — o supervisor pode vir de qualquer setor. */
  funcionariosDoEvento: FuncionarioDoSetor[]
  diasDoEvento: DiaDoEvento[]
  /** Ids dos setores que pedem o meio — vem de consulta própria, ver page.tsx. */
  setoresComMeio: Set<string>
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

  /*
   * Achar a PESSOA, não só o setor.
   *
   * "Onde está o funcionário X" é uma pergunta operacional — conferir uma
   * informação com ele, ligar rápido — diferente de "abrir o setor Y". A
   * mesma caixa de busca responde as duas, mas os resultados são listas
   * distintas: um setor encontrado abre o cartão dele; uma pessoa encontrada
   * mostra onde ela está, sem precisar abrir setor por setor procurando.
   */
  const digitosBusca = busca.replace(/\D/g, '')
  const pessoasEncontradas = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (t.length < MINIMO_PARA_BUSCAR_PESSOA) return []
    return funcionariosDoEvento.filter(f =>
      f.nome.toLowerCase().includes(t) || (digitosBusca.length >= 3 && f.cpf?.includes(digitosBusca)),
    ).slice(0, 20)
  }, [funcionariosDoEvento, busca, digitosBusca])

  const nomeDoSetor = useMemo(
    () => Object.fromEntries(fornecedores.map(f => [f.id, f.nome])),
    [fornecedores],
  )

  const paraCopiar: SetorParaCopiar[] = fornecedores.map(f => ({
    id: f.id,
    nome: f.nome,
    token: f.token_formulario || null,
  }))

  const totalEquipe = fornecedores.reduce((s, f) => s + (f.funcionarios?.[0]?.count ?? 0), 0)
  const semNenhumResultado = !!busca.trim() && !visiveis.length && !pessoasEncontradas.length

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

      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar setor, supervisor ou funcionário…"
          aria-label="Buscar setor ou funcionário"
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

      {/*
        * "Onde está o Carlos" — nome, setor e um jeito rápido de contatar,
        * sem precisar abrir o cartão do setor pra achar o telefone dele.
        */}
      {!!pessoasEncontradas.length && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <p className="text-slate-500 text-2xs font-semibold uppercase tracking-wide px-4 pt-3 pb-2 bg-slate-50 border-b border-slate-100">
            {pessoasEncontradas.length} pessoa{pessoasEncontradas.length === 1 ? '' : 's'} encontrada{pessoasEncontradas.length === 1 ? '' : 's'}
          </p>
          <div className="divide-y divide-slate-100">
            {pessoasEncontradas.map(f => {
              const zap = f.telefone ? `55${f.telefone.replace(/\D/g, '')}` : null
              return (
                <div key={f.id} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-800 text-sm font-semibold truncate">{f.nome}</p>
                    <p className="text-slate-400 text-2xs truncate">
                      {f.fornecedor_id ? (nomeDoSetor[f.fornecedor_id] ?? '—') : '—'}
                      {f.cargo ? ` · ${f.cargo}` : ''}
                      {f.cpf ? ` · ${formatCpf(f.cpf)}` : ''}
                    </p>
                  </div>
                  {zap ? (
                    <a
                      href={`https://wa.me/${zap}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-secundario btn-sm shrink-0"
                    >
                      <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                      <span className="hidden sm:inline">Chamar</span>
                    </a>
                  ) : (
                    <span className="flex items-center gap-1 text-slate-300 text-2xs shrink-0">
                      <Phone className="w-3 h-3" /> sem telefone
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {semNenhumResultado ? (
        <div className="text-center py-8">
          <Users className="w-7 h-7 text-slate-300 mx-auto" />
          <p className="text-slate-500 text-sm mt-2">Nada encontrado com “{busca}”.</p>
          <button onClick={() => setBusca('')} className="text-brand-600 text-xs font-semibold hover:underline mt-1">
            Limpar busca
          </button>
        </div>
      ) : !visiveis.length ? null : (
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
              funcionariosDoEvento={funcionariosDoEvento}
              diasDoEvento={diasDoEvento}
              exigeMeio={setoresComMeio.has(f.id)}
              podeGerenciarSupervisores={podeGerenciarSupervisores}
              podeExcluir={podeExcluir}
            />
          ))}
        </div>
      )}
    </div>
  )
}
