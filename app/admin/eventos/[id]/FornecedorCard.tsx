'use client'
import Link from 'next/link'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, Trash2, Users, ArrowRight, Shield, Wallet } from 'lucide-react'
import { deletarFornecedor } from '@/lib/actions'
import FornecedorModal from './FornecedorModal'
import ImportarFuncionarios from './ImportarFuncionarios'
import ExportarEquipe from './ExportarEquipe'
import SupervisorModal from './SupervisorModal'
import ConfirmModal from '@/components/ConfirmModal'

type Fornecedor = {
  id: string
  nome: string
  token_formulario: string
  quantidade_estimada: number | null
  valor_combinado: number | null
  cpfs_autorizados: string | null
  funcionarios: { count: number }[]
}

type Supervisor = { id: string; nome: string; email: string; cpf: string | null; telefone: string | null; ativo: boolean }
type FuncionarioDoSetor = { id: string; nome: string; cpf: string; telefone: string }
type DiaDoEvento = { data: string; tipo: string }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function FornecedorCard({
  fornecedor: f,
  eventoId,
  supervisores = [],
  funcionariosDoEvento = [],
  diasDoEvento = [],
  exigeMeio = false,
  podeGerenciarSupervisores = false,
  podeExcluir = false,
}: {
  fornecedor: Fornecedor
  eventoId: string
  supervisores?: Supervisor[]
  /**
   * Todo mundo credenciado no EVENTO — o "Criar Supervisor" busca aqui.
   *
   * Não só deste setor: setor recém-criado nasce vazio (foi o caso do
   * "Bar - Caixa"), e a lista viria em branco justamente quando mais se
   * precisa dela. Quem vira supervisor costuma já estar em outro setor.
   */
  funcionariosDoEvento?: FuncionarioDoSetor[]
  /** Os dias do evento — para o "Exportar planilha" oferecer o fluxo de um dia. */
  diasDoEvento?: DiaDoEvento[]
  /** Este setor pede o meio? Vem de consulta própria — ver page.tsx. */
  exigeMeio?: boolean
  podeGerenciarSupervisores?: boolean
  /** Só o master exclui. O admin encerra o evento, que resolve sem destruir. */
  podeExcluir?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const count = f.funcionarios?.[0]?.count ?? 0
  const estimado = f.quantidade_estimada ?? 0
  const pct = estimado > 0 ? Math.min(100, Math.round((count / estimado) * 100)) : null
  const valor = f.valor_combinado ?? null

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/form/${f.token_formulario}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const confirmarExclusao = () => {
    startTransition(async () => {
      try {
        await deletarFornecedor(f.id, eventoId)
        router.refresh()
        setConfirmOpen(false)
      } catch (e: unknown) {
        // A action recusa excluir setor com supervisor vinculado, e a mensagem
        // dela explica o porquê — repassar "Erro ao excluir" perderia isso.
        setConfirmOpen(false)
        alert(e instanceof Error ? e.message : 'Erro ao excluir setor')
      }
    })
  }

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl overflow-hidden transition-colors hover:border-slate-300 ${isPending ? 'opacity-50' : ''}`}>
      {/*
        * Nome e números na MESMA linha.
        *
        * Antes o nome ocupava uma faixa sozinho e os dois números vinham numa
        * grade abaixo, cada um com rótulo e ícone. Eram três faixas verticais
        * por setor: com sete setores, a lista virava uma rolagem longa em que
        * nenhum cartão cabia inteiro na tela junto do seguinte.
        *
        * Os números viraram texto ao lado do nome porque é assim que eles são
        * lidos — "Bar, 12 pessoas" é uma frase, não uma tabela de duas colunas.
        */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-2.5">
        <Link
          href={`/admin/eventos/${eventoId}/fornecedor/${f.id}`}
          className="min-w-0 group flex-1"
        >
          <h3 className="text-slate-800 font-semibold text-base truncate group-hover:text-brand-500 transition-colors">
            {f.nome}
          </h3>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-500 text-xs mt-0.5">
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Users className="w-3 h-3 shrink-0" />
              {count} {count === 1 ? 'pessoa' : 'pessoas'}
              {estimado > 0 && <span className="text-slate-400"> de {estimado}</span>}
            </span>
            {valor !== null && (
              <>
                <span className="text-slate-300" aria-hidden>·</span>
                <span className="inline-flex items-center gap-1 tabular-nums">
                  <Wallet className="w-3 h-3 shrink-0" />
                  {brl(valor)} por pessoa
                  {count > 0 && <span className="text-slate-400"> · total {brl(valor * count)}</span>}
                </span>
              </>
            )}
          </p>
        </Link>
        <div className="flex items-center gap-0.5 shrink-0 -mr-1.5 -mt-1">
          <FornecedorModal
            mode="editar"
            eventoId={eventoId}
            fornecedorId={f.id}
            nome={f.nome}
            valor_combinado={f.valor_combinado}
            exige_meio={exigeMeio}
          />
          {podeExcluir && (
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={isPending}
              aria-label={`Excluir setor ${f.nome}`}
              className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-erro-600 hover:bg-erro-50 disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* A barra de progresso sobrevive porque diz algo que o número não diz:
          o quanto falta. Só aparece quando existe um teto para comparar. */}
      {pct !== null && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: pct >= 100 ? 'var(--color-sucesso-600)' : 'var(--color-acento-500)',
              }}
            />
          </div>
          <span className={`text-2xs font-semibold tabular-nums shrink-0 ${pct >= 100 ? 'text-sucesso-700' : 'text-slate-500'}`}>
            {pct}%
          </span>
        </div>
      )}

      {/* Ações, todas no mesmo estilo. Antes eram quatro botões com três
          aparências diferentes (cinza cheio, azul vazado, cinza vazado), o
          que fazia parecer que tinham importâncias diferentes — e não têm. */}
      <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/eventos/${eventoId}/fornecedor/${f.id}`}
            className="btn btn-secundario btn-sm"
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            Ver equipe
            <ArrowRight className="w-3 h-3 shrink-0 opacity-50" />
          </Link>
          <button onClick={copyLink} className="btn btn-secundario btn-sm">
            {copied
              ? <Check className="w-3.5 h-3.5 shrink-0 text-sucesso-600" />
              : <Copy className="w-3.5 h-3.5 shrink-0" />}
            {copied ? 'Link copiado' : 'Link do formulário'}
          </button>
        </div>
        <ImportarFuncionarios fornecedorId={f.id} />
        <ExportarEquipe fornecedorId={f.id} eventoId={eventoId} dias={diasDoEvento} />
      </div>

      {podeGerenciarSupervisores && (
        <div className="px-4 py-2.5 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2 mb-1">
            <p className="flex items-center gap-1.5 text-slate-500 text-2xs font-semibold uppercase tracking-wide">
              <Shield className="w-3 h-3" /> Supervisores
            </p>
            <SupervisorModal mode="criar" eventoId={eventoId} fornecedorId={f.id} setorNome={f.nome} funcionariosDoEvento={funcionariosDoEvento} />
          </div>
          {!supervisores.length ? (
            <p className="text-slate-400 text-xs">Nenhum supervisor vinculado a este setor</p>
          ) : (
            <div className="-mx-1">
              {supervisores.map(s => (
                <SupervisorModal key={s.id} mode="editar" eventoId={eventoId} supervisor={s} podeExcluir={podeExcluir} />
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmarExclusao}
        isPending={isPending}
        mensagem={`Excluir "${f.nome}" e todos os funcionários cadastrados?`}
      />
    </div>
  )
}
