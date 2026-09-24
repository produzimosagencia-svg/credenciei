'use client'
import { X, Car, User, Phone, Clock } from 'lucide-react'
import { formatCpf, formatTelefone } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Badge } from '@/components/ui/Superficie'
import { ROTULO_STATUS_VEICULO, TOM_STATUS_VEICULO, ROTULO_TIPO_CADASTRO } from '@/lib/veiculos-constantes'
import type { VeiculoLinha } from './PainelVeiculos'

/**
 * Tudo sobre um veículo, numa tela só — o clique na linha da lista abre isto
 * em vez de espalhar a informação em vários botões pequenos.
 */
export default function DetalhesVeiculoModal({
  veiculo, onClose,
}: {
  veiculo: VeiculoLinha
  onClose: () => void
}) {
  return (
    <div
      className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="modal-pop-in bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 pb-3 sticky top-0 bg-white border-b border-slate-100">
          <div>
            <p className="font-mono font-bold text-slate-800 text-lg tracking-wide">{veiculo.placa}</p>
            <p className="text-slate-400 text-xs">{veiculo.modelo}{veiculo.ano ? ` (${veiculo.ano})` : ''}</p>
          </div>
          <button
            onClick={onClose}
            className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 pt-3 space-y-4">
          <Badge tom={TOM_STATUS_VEICULO[veiculo.status]}>{ROTULO_STATUS_VEICULO[veiculo.status]}</Badge>

          <Bloco icone={<Car className="w-3.5 h-3.5" />} titulo="Veículo">
            <Linha rotulo="Modelo" valor={veiculo.modelo} />
            {veiculo.cor && <Linha rotulo="Cor" valor={veiculo.cor} />}
            {veiculo.ano && <Linha rotulo="Ano" valor={String(veiculo.ano)} />}
            {veiculo.tipo && <Linha rotulo="Tipo" valor={veiculo.tipo} />}
            {(veiculo.empresa || veiculo.setor) && (
              <Linha rotulo="Empresa/Setor" valor={[veiculo.empresa, veiculo.setor].filter(Boolean).join(' · ')} />
            )}
            <Linha rotulo="Origem" valor={ROTULO_TIPO_CADASTRO[veiculo.tipoCadastro]} />
            <Linha rotulo="Dias autorizados" valor={
              veiculo.dias.length
                ? veiculo.dias.map(d => formatarBR(`${d}T12:00:00-03:00`, 'data')).join(', ')
                : 'Todos'
            } />
            {veiculo.observacoes && (
              <p className="text-amber-700 text-xs bg-amber-50 border border-amber-100 rounded-lg p-2 mt-1">{veiculo.observacoes}</p>
            )}
          </Bloco>

          <Bloco icone={<User className="w-3.5 h-3.5" />} titulo="Condutor">
            <Linha rotulo="Nome" valor={veiculo.condutorNome ?? '—'} />
            {veiculo.condutorCpf && <Linha rotulo="CPF" valor={formatCpf(veiculo.condutorCpf)} />}
            {veiculo.condutorTelefone && (
              <Linha rotulo="Telefone" valor={formatTelefone(veiculo.condutorTelefone)} icone={<Phone className="w-3 h-3" />} />
            )}
          </Bloco>

          <Bloco icone={<Clock className="w-3.5 h-3.5" />} titulo="Entradas liberadas pelo scanner">
            {!veiculo.entradas.length ? (
              <p className="text-slate-400 text-xs">Ainda não foi liberado na portaria.</p>
            ) : (
              <ul className="space-y-1">
                {veiculo.entradas.map(e => (
                  <li key={e} className="text-slate-700 text-xs tabular-nums">{formatarBR(e, 'curto')}</li>
                ))}
              </ul>
            )}
          </Bloco>
        </div>
      </div>
    </div>
  )
}

function Bloco({ icone, titulo, children }: { icone: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-slate-400 text-2xs font-semibold uppercase tracking-wide mb-1.5">
        {icone} {titulo}
      </p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function Linha({ rotulo, valor, icone }: { rotulo: string; valor: string; icone?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-slate-400 text-xs">{rotulo}</span>
      <span className="text-slate-700 text-right flex items-center gap-1">{icone}{valor}</span>
    </div>
  )
}
