'use client'
import { useMemo, useState } from 'react'
import { Search, Users, X, ChevronRight } from 'lucide-react'
import { formatCpf } from '@/lib/format'
import { Secao, EmptyState } from '@/components/ui/Superficie'
import FuncionarioDetalheModal from '../eventos/[id]/fornecedor/[fid]/FuncionarioDetalheModal'
import type { Presenca } from '../eventos/[id]/fornecedor/[fid]/FuncionarioTable'

export type ColaboradorDoEvento = {
  id: string
  nome: string
  cpf: string
  telefone: string
  empresa: string
  cargo: string
  valorReceber: number
  chavePix: string | null
  pago: boolean
  pagoEm: string | null
  fotoUrl: string | null
  ativo: boolean
  fornecedorId: string
  setorNome: string
  valorCombinado: number | null
  entrada: Presenca
  meio: Presenca
  fim: Presenca
}

/** A partir de quantas letras a busca começa a filtrar. */
const MINIMO = 2

/**
 * Achar uma pessoa do evento e abrir a ficha dela — sem ter que saber em qual
 * setor ela está.
 *
 * A ficha é o MESMO `FuncionarioDetalheModal` da tela do setor, com as mesmas
 * ações (mover de setor, corrigir CPF, valor, tornar supervisor) e as mesmas
 * permissões. Nada é reimplementado aqui: o que muda é só como se chega até
 * ela — antes era preciso saber o setor e navegar até ele, o que na operação
 * significava abrir setor por setor procurando alguém.
 *
 * O filtro é client-side sobre a lista já carregada, mesmo padrão de
 * `ListaDeSetores.tsx`: um evento tem centenas de pessoas, não milhares, e
 * ir ao servidor a cada tecla deixaria a busca pior no celular.
 */
export default function BuscarColaborador({
  colaboradores, eventoId, eventoNome, outrosSetores, podeMoverDeSetor, podeCriarSupervisor, podeEditarCpf,
  podeAtivarDesativar, role,
}: {
  colaboradores: ColaboradorDoEvento[]
  eventoId: string
  eventoNome: string
  outrosSetores: { id: string; nome: string }[]
  podeMoverDeSetor: boolean
  podeCriarSupervisor: boolean
  podeEditarCpf: boolean
  podeAtivarDesativar: boolean
  /** Ver o mesmo prop em FuncionarioDetalheModal — decide se motivo é obrigatório. */
  role?: string
}) {
  const [busca, setBusca] = useState('')

  /*
   * `''.includes('')` é sempre true — sem a guarda de `digitos`, buscar por
   * nome (sem número nenhum) faria TODO CPF "bater" e a lista nunca filtrava.
   */
  const digitos = busca.replace(/\D/g, '')
  const encontrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    if (t.length < MINIMO) return []
    return colaboradores
      .filter(c =>
        c.nome.toLowerCase().includes(t) ||
        (digitos.length >= 3 && c.cpf.includes(digitos)) ||
        c.setorNome.toLowerCase().includes(t),
      )
      .slice(0, 50)
  }, [colaboradores, busca, digitos])

  return (
    <Secao
      tom="acento"
      icone={<Users className="w-3.5 h-3.5" />}
      titulo="Encontre a pessoa"
      descricao={`${colaboradores.length.toLocaleString('pt-BR')} pessoas neste evento — busque por nome, CPF ou setor`}
      corpoClassName={encontrados.length ? '' : 'p-4'}
    >
      <div className="relative px-4 pt-4 pb-2">
        <Search className="w-4 h-4 text-slate-400 absolute left-7 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Nome, CPF ou setor…"
          aria-label="Buscar colaborador"
          autoFocus
          className="input pl-9 pr-9"
        />
        {busca && (
          <button
            onClick={() => setBusca('')}
            aria-label="Limpar busca"
            className="absolute right-6 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {busca.trim().length < MINIMO ? (
        <EmptyState
          icone={<Search className="w-7 h-7" />}
          titulo="Digite para procurar"
          descricao="Pelo menos duas letras do nome, ou o começo do CPF."
        />
      ) : !encontrados.length ? (
        <EmptyState icone={<Users className="w-7 h-7" />} titulo={`Ninguém com "${busca}"`} />
      ) : (
        <div className="divide-y divide-slate-50">
          {encontrados.map(c => (
            <FuncionarioDetalheModal
              key={c.id}
              funcionario={c}
              fornecedorId={c.fornecedorId}
              eventoId={eventoId}
              eventoNome={eventoNome}
              setorNome={c.setorNome}
              valorCombinado={c.valorCombinado}
              /* O setor atual da pessoa nunca é destino: mover pra onde ela já
                 está não é uma opção, é uma pegadinha. */
              outrosSetores={outrosSetores.filter(s => s.id !== c.fornecedorId)}
              podeMoverDeSetor={podeMoverDeSetor}
              podeCriarSupervisor={podeCriarSupervisor}
              podeEditarCpf={podeEditarCpf}
              podeAtivarDesativar={podeAtivarDesativar}
              podeEditarPonto={podeAtivarDesativar}
              role={role}
              trigger={
                <div className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                  <div className="min-w-0">
                    <p className={`text-sm font-medium truncate ${c.ativo ? 'text-slate-800' : 'text-slate-400'}`}>
                      {c.nome}
                      {!c.ativo && (
                        <span className="ml-2 text-2xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                          NÃO ATIVADO
                        </span>
                      )}
                    </p>
                    <p className="text-slate-400 text-xs truncate">
                      {c.setorNome}
                      {c.cargo ? ` · ${c.cargo}` : ''}
                      {' · '}
                      <span className="font-mono tabular-nums">{formatCpf(c.cpf)}</span>
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </div>
              }
            />
          ))}
        </div>
      )}
    </Secao>
  )
}
