'use client'
import { useMemo, useState } from 'react'
import { Truck, Search, Plus, X } from 'lucide-react'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Secao, EmptyState } from '@/components/ui/Superficie'
import FormVeiculo from './FormVeiculo'
import AcoesVeiculo from './AcoesVeiculo'
import FotoVeiculo from './FotoVeiculo'

export type VeiculoLinha = {
  id: string
  placa: string
  modelo: string
  cor: string | null
  tipo: string | null
  empresa: string | null
  observacoes: string | null
  condutorNome: string | null
  condutorCpf: string | null
  dias: string[]
  temFoto: boolean
}

/**
 * A lista de veículos autorizados, com busca e o cadastro num modal.
 *
 * O cadastro saiu de cima da lista: ele é um formulário de dois passos que
 * ocupava a tela inteira, e quem abre esta página na portaria quase sempre
 * quer o contrário — CONFERIR uma placa que acabou de chegar, não cadastrar.
 * Agora o topo é a busca, o cadastro é um botão, e a lista aparece inteira.
 *
 * A busca é local, sobre as linhas já carregadas: são dezenas de veículos,
 * não milhares, e no portão a resposta precisa sair enquanto a pessoa digita
 * — ida ao servidor a cada tecla seria mais lenta e ainda dependeria do sinal
 * do celular.
 */
export default function PainelVeiculos({
  eventoId, dias, veiculos,
}: {
  eventoId: string
  dias: { data: string; tipo: string }[]
  veiculos: VeiculoLinha[]
}) {
  const [busca, setBusca] = useState('')
  const [cadastrando, setCadastrando] = useState(false)

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return veiculos
    /*
     * Só dígitos e letras: a pessoa digita "RFM-3G11" ou "154.321.447-94" do
     * jeito que está escrito no documento, e a comparação crua não acharia
     * nada. Casar os dois lados sem pontuação faz a placa e o CPF baterem
     * com ou sem máscara.
     */
    const cru = termo.replace(/[^a-z0-9]/g, '')
    return veiculos.filter(v => {
      const campos = [v.placa, v.modelo, v.tipo, v.cor, v.empresa, v.condutorNome, v.condutorCpf]
        .filter(Boolean).join(' ').toLowerCase()
      return campos.includes(termo) || (!!cru && campos.replace(/[^a-z0-9]/g, '').includes(cru))
    })
  }, [busca, veiculos])

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Consultar placa, modelo, condutor, CPF ou empresa"
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
        <button onClick={() => setCadastrando(true)} className="btn btn-primario btn-lg shrink-0">
          <Plus className="w-4 h-4 shrink-0" /> Cadastrar veículo
        </button>
      </div>

      <Secao
        tom="acento"
        icone={<Truck className="w-3.5 h-3.5" />}
        titulo={busca
          ? `${filtrados.length} de ${veiculos.length} veículo${veiculos.length === 1 ? '' : 's'}`
          : `${veiculos.length} veículo${veiculos.length === 1 ? '' : 's'} cadastrado${veiculos.length === 1 ? '' : 's'}`}
        descricao="A portaria confere a placa nesta lista"
        corpoClassName={filtrados.length ? '' : 'p-4'}
      >
        {!veiculos.length ? (
          <EmptyState
            icone={<Truck className="w-7 h-7" />}
            titulo="Nenhum veículo ainda"
            descricao="Cadastre no botão acima, começando pelo CPF de quem vai dirigir."
          />
        ) : !filtrados.length ? (
          <EmptyState
            icone={<Search className="w-7 h-7" />}
            titulo={`Nada encontrado para "${busca}"`}
            descricao="Confira a placa ou tente pelo nome do condutor."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Veículo</th>
                  <th>Condutor</th>
                  <th>Empresa</th>
                  <th>Dias</th>
                  <th>Foto</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(v => (
                  <tr key={v.id}>
                    <td className="font-mono font-bold tabular-nums whitespace-nowrap">{v.placa}</td>
                    <td>
                      <p className="text-slate-700">{v.modelo}</p>
                      <p className="text-slate-400 text-2xs">
                        {[v.tipo, v.cor].filter(Boolean).join(' · ') || '—'}
                      </p>
                      {v.observacoes ? (
                        <p className="text-amber-700 text-2xs mt-0.5">{v.observacoes}</p>
                      ) : null}
                    </td>
                    <td>
                      <p className="text-slate-700">{v.condutorNome ?? '—'}</p>
                      {v.condutorCpf && (
                        <p className="text-slate-400 text-2xs tabular-nums">{formatCpf(v.condutorCpf)}</p>
                      )}
                    </td>
                    <td className="text-slate-500">{v.empresa || '—'}</td>
                    <td className="text-slate-500 text-2xs">
                      {/* Sem dia marcado = autorizado em todos — é o padrão
                          do cadastro, e dizer "Todos" evita a leitura de
                          que ficou faltando preencher. */}
                      {v.dias.length
                        ? v.dias.map(d => formatarBR(`${d}T12:00:00-03:00`, 'data').slice(0, 5)).join(', ')
                        : 'Todos'}
                    </td>
                    <td>
                      <FotoVeiculo
                        veiculoId={v.id}
                        eventoId={eventoId}
                        placa={v.placa}
                        temFoto={v.temFoto}
                      />
                    </td>
                    <td className="text-right">
                      <AcoesVeiculo veiculoId={v.id} eventoId={eventoId} placa={v.placa} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Secao>

      {cadastrando && (
        <div
          className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-start justify-center z-50 p-4 overflow-y-auto"
          onClick={() => setCadastrando(false)}
        >
          <div
            className="modal-pop-in w-full max-w-lg my-8 space-y-3"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-white font-bold text-base">Cadastrar veículo</h3>
              <button
                onClick={() => setCadastrando(false)}
                className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-white/70 hover:text-white hover:bg-white/10"
                aria-label="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/*
              * O formulário é o mesmo de sempre, inteiro: dois passos, o
              * condutor primeiro. Só mudou onde ele mora. Fica aberto depois
              * de salvar de propósito — na montagem chegam vários seguidos.
              */}
            <FormVeiculo eventoId={eventoId} dias={dias} />
          </div>
        </div>
      )}
    </div>
  )
}
