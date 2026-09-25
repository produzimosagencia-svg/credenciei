'use client'
import { useMemo, useState } from 'react'
import { ClipboardCheck, Search, X } from 'lucide-react'
import { formatCpf, formatTelefone } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Secao, EmptyState, Badge } from '@/components/ui/Superficie'
import SeletorLista from '@/components/SeletorLista'
import {
  ROTULO_STATUS_CREDENCIAMENTO, TOM_STATUS_CREDENCIAMENTO, STATUS_CREDENCIAMENTO,
  type StatusCredenciamento,
} from '@/lib/credenciamento-constantes'
import AcoesCredenciamento from './AcoesCredenciamento'

export type CredenciamentoLinha = {
  id: string
  nome: string
  cpf: string
  telefone: string
  empresa: string | null
  cargo: string | null
  setorId: string
  setorNome: string
  /** 'formulario' | 'portaria' | 'planilha' — texto livre, vindo de `funcionarios.origem`. */
  origem: string
  status: StatusCredenciamento
  motivoNegacao: string | null
  criadoEm: string
  /** Quando e por quem foi aprovado/negado — nulo enquanto pendente. */
  decididoEm: string | null
  decididoPor: string | null
}

const ROTULO_ORIGEM: Record<string, string> = {
  formulario: 'Link (formulário)',
  portaria: 'Portaria (cartaz)',
  planilha: 'Planilha',
}

/**
 * Credenciamentos pendentes/aprovados/negados de um evento inteiro — mesmo
 * padrão de busca local e filtro de app/admin/veiculos/PainelVeiculos.tsx.
 * Supervisor só recebe (do Server Component) as linhas dos próprios setores;
 * aqui não há isolamento a mais para aplicar.
 */
export default function PainelAprovacoes({
  eventoId, linhas,
}: {
  eventoId: string
  linhas: CredenciamentoLinha[]
}) {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<'' | StatusCredenciamento>('pendente')

  const contagens = useMemo(() => {
    const c: Record<StatusCredenciamento, number> = { pendente: 0, aprovado: 0, negado: 0 }
    for (const l of linhas) c[l.status]++
    return c
  }, [linhas])

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const cru = termo.replace(/[^a-z0-9]/g, '')
    return linhas.filter(l => {
      if (filtroStatus && l.status !== filtroStatus) return false
      if (!termo) return true
      const campos = [l.nome, l.cpf, l.telefone, l.empresa, l.cargo, l.setorNome].filter(Boolean).join(' ').toLowerCase()
      return campos.includes(termo) || (!!cru && campos.replace(/[^a-z0-9]/g, '').includes(cru))
    })
  }, [busca, filtroStatus, linhas])

  return (
    <div className="space-y-4">
      {/* Contadores — pendentes em destaque, é o que importa no dia do evento. */}
      <div className="grid grid-cols-3 gap-3">
        <button onClick={() => setFiltroStatus('pendente')} className={`text-left bg-white border rounded-2xl p-4 transition-colors ${filtroStatus === 'pendente' ? 'border-amber-300 ring-2 ring-amber-100' : 'border-slate-200 hover:border-amber-200'}`}>
          <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">Pendentes</p>
          <p className="text-2xl font-extrabold mt-1 tabular-nums text-amber-600">{contagens.pendente}</p>
        </button>
        <button onClick={() => setFiltroStatus('aprovado')} className={`text-left bg-white border rounded-2xl p-4 transition-colors ${filtroStatus === 'aprovado' ? 'border-green-300 ring-2 ring-green-100' : 'border-slate-200 hover:border-green-200'}`}>
          <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">Aprovados</p>
          <p className="text-2xl font-extrabold mt-1 tabular-nums text-green-600">{contagens.aprovado}</p>
        </button>
        <button onClick={() => setFiltroStatus('negado')} className={`text-left bg-white border rounded-2xl p-4 transition-colors ${filtroStatus === 'negado' ? 'border-red-300 ring-2 ring-red-100' : 'border-slate-200 hover:border-red-200'}`}>
          <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">Negados</p>
          <p className="text-2xl font-extrabold mt-1 tabular-nums text-red-600">{contagens.negado}</p>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Consultar nome, CPF, telefone, empresa ou setor"
            className="input pl-9 pr-9"
            autoComplete="off"
          />
          {busca && (
            <button
              onClick={() => setBusca('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              aria-label="Limpar busca"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <SeletorLista
          className="w-full sm:w-48" valor={filtroStatus} onChange={v => setFiltroStatus(v as '' | StatusCredenciamento)}
          placeholder="Status" titulo="Status"
          opcoes={[{ valor: '', rotulo: 'Todos os status' }, ...STATUS_CREDENCIAMENTO.map(s => ({ valor: s, rotulo: ROTULO_STATUS_CREDENCIAMENTO[s] }))]}
        />
      </div>

      <Secao
        tom="acento"
        icone={<ClipboardCheck className="w-3.5 h-3.5" />}
        titulo={busca || filtroStatus
          ? `${filtrados.length} de ${linhas.length} credenciamento${linhas.length === 1 ? '' : 's'}`
          : `${linhas.length} credenciamento${linhas.length === 1 ? '' : 's'} neste evento`}
        corpoClassName={filtrados.length ? '' : 'p-4'}
      >
        {!linhas.length ? (
          <EmptyState
            icone={<ClipboardCheck className="w-7 h-7" />}
            titulo="Nenhum credenciamento ainda"
            descricao="Assim que alguém se cadastrar pelo link ou pela portaria, aparece aqui."
          />
        ) : !filtrados.length ? (
          <EmptyState
            icone={<Search className="w-7 h-7" />}
            titulo="Nada encontrado"
            descricao="Confira o nome, CPF ou tente outro filtro de status."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Empresa/Cargo</th>
                  <th>Setor</th>
                  <th>Origem</th>
                  <th>Recebido em</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(l => (
                  <tr key={l.id}>
                    <td className="text-slate-700 font-medium">{l.nome}</td>
                    <td>
                      <p className="text-slate-700 text-2xs tabular-nums">{formatCpf(l.cpf)}</p>
                      <p className="text-slate-400 text-2xs tabular-nums">{formatTelefone(l.telefone)}</p>
                    </td>
                    <td className="text-slate-500 text-2xs">
                      {[l.empresa, l.cargo].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="text-slate-500 text-2xs">{l.setorNome}</td>
                    <td className="text-slate-500 text-2xs">{ROTULO_ORIGEM[l.origem] ?? l.origem}</td>
                    <td className="text-slate-500 text-2xs whitespace-nowrap">{formatarBR(l.criadoEm, 'curto')}</td>
                    <td>
                      <Badge tom={TOM_STATUS_CREDENCIAMENTO[l.status]}>{ROTULO_STATUS_CREDENCIAMENTO[l.status]}</Badge>
                      {l.status === 'negado' && l.motivoNegacao && (
                        <p className="text-slate-400 text-2xs mt-0.5 max-w-[16rem]">{l.motivoNegacao}</p>
                      )}
                    </td>
                    <td className="text-right">
                      {l.status === 'pendente' ? (
                        <AcoesCredenciamento funcionarioId={l.id} fornecedorId={l.setorId} eventoId={eventoId} nome={l.nome} />
                      ) : (
                        <div className="text-2xs whitespace-nowrap">
                          <p className="text-slate-600">
                            {l.status === 'negado' ? 'Negado' : 'Aprovado'} por{' '}
                            <strong className="text-slate-800">{l.decididoPor ?? '—'}</strong>
                          </p>
                          {l.decididoEm && <p className="text-slate-400">{formatarBR(l.decididoEm, 'curto')}</p>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </div>
  )
}
