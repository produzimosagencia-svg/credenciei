'use client'
import Link from 'next/link'
import { useTransition, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Copy, Check, Trash2, Users, ArrowRight, Shield, Wallet } from 'lucide-react'
import { deletarFornecedor } from '@/lib/actions'
import FornecedorModal from './FornecedorModal'
import ImportarFuncionarios from './ImportarFuncionarios'
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

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function FornecedorCard({
  fornecedor: f,
  eventoId,
  supervisores = [],
  podeGerenciarSupervisores = false,
  podeExcluir = false,
}: {
  fornecedor: Fornecedor
  eventoId: string
  supervisores?: Supervisor[]
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
      {/* Cabeçalho: o nome do setor é o título do cartão, então tem tamanho de
          título — antes competia de igual pra igual com o texto de apoio. */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
        <Link
          href={`/admin/eventos/${eventoId}/fornecedor/${f.id}`}
          className="min-w-0 group"
        >
          <h3 className="text-slate-800 font-semibold text-base truncate group-hover:text-brand-500 transition-colors">
            {f.nome}
          </h3>
        </Link>
        <div className="flex items-center gap-0.5 shrink-0 -mr-1.5 -mt-1">
          <FornecedorModal
            mode="editar"
            eventoId={eventoId}
            fornecedorId={f.id}
            nome={f.nome}
            quantidade_estimada={f.quantidade_estimada}
            valor_combinado={f.valor_combinado}
            cpfs_autorizados={f.cpfs_autorizados}
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

      {/* Dois números lado a lado, cada um com rótulo: equipe e dinheiro são
          leituras diferentes e estavam empilhadas na mesma linha corrida. */}
      <div className="px-4 pb-3.5 grid grid-cols-2 gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-slate-500 text-2xs font-medium">
            <Users className="w-3 h-3 shrink-0" /> Equipe
          </p>
          <p className="text-slate-800 text-sm font-semibold tabular-nums mt-1">
            {count}
            {estimado > 0 && <span className="text-slate-400 font-normal"> / {estimado}</span>}
          </p>
          {pct !== null && (
            <div className="mt-1.5 flex items-center gap-2">
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
        </div>

        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-slate-500 text-2xs font-medium">
            <Wallet className="w-3 h-3 shrink-0" /> Valor por pessoa
          </p>
          {valor === null ? (
            <p className="text-slate-400 text-sm mt-1">não definido</p>
          ) : (
            <>
              <p className="text-slate-800 text-sm font-semibold tabular-nums mt-1">{brl(valor)}</p>
              {count > 0 && (
                <p className="text-slate-500 text-2xs mt-1.5">total {brl(valor * count)}</p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Ações, todas no mesmo estilo. Antes eram quatro botões com três
          aparências diferentes (cinza cheio, azul vazado, cinza vazado), o
          que fazia parecer que tinham importâncias diferentes — e não têm. */}
      <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/60 space-y-2">
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
      </div>

      {podeGerenciarSupervisores && (
        <div className="px-4 py-3 border-t border-slate-100">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="flex items-center gap-1.5 text-slate-500 text-2xs font-semibold uppercase tracking-wide">
              <Shield className="w-3 h-3" /> Supervisores
            </p>
            <SupervisorModal mode="criar" eventoId={eventoId} fornecedorId={f.id} setorNome={f.nome} />
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
