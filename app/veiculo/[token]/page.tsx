import { notFound } from 'next/navigation'
import { CheckCircle2, Clock, Ban, XCircle, Car } from 'lucide-react'
import { veiculoPorQrToken } from '@/lib/veiculos-publico'
import { ROTULO_TIPO_CADASTRO, type StatusVeiculo } from '@/lib/veiculos-constantes'

const SELO: Record<StatusVeiculo, { icone: typeof CheckCircle2; cor: string; titulo: string; texto: string }> = {
  ativo: {
    icone: CheckCircle2, cor: 'bg-green-500/15 text-green-400',
    titulo: 'Pode entrar', texto: 'Este veículo está autorizado a entrar no evento.',
  },
  pendente: {
    icone: Clock, cor: 'bg-amber-500/15 text-amber-400',
    titulo: 'Cadastro recebido — aguardando aprovação',
    texto: 'A produção do evento ainda precisa aprovar este cadastro. Este mesmo QR passa a liberar a entrada assim que for aprovado — não precisa gerar outro.',
  },
  bloqueado: {
    icone: Ban, cor: 'bg-red-500/15 text-red-400',
    titulo: 'Acesso bloqueado', texto: 'Este veículo está bloqueado. Fale com a produção do evento.',
  },
  cancelado: {
    icone: XCircle, cor: 'bg-slate-500/15 text-slate-400',
    titulo: 'Cadastro cancelado', texto: 'Este cadastro foi cancelado e não autoriza mais a entrada.',
  },
}

/**
 * A página que o QR do veículo aponta — sem sessão, pra portaria escanear
 * com a câmera comum do celular (não precisa de scanner dentro do app).
 * Serve também de tela de sucesso logo após o autocadastro público.
 */
export default async function VeiculoPublicoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const veiculo = await veiculoPorQrToken(token)
  if (!veiculo) notFound()

  const selo = SELO[veiculo.status]
  const Icone = selo.icone

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className={`p-6 text-center ${selo.cor}`}>
            <Icone className="w-12 h-12 mx-auto mb-2" />
            <p className="font-bold text-lg">{selo.titulo}</p>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-slate-600 text-sm text-center">{selo.texto}</p>

            <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4">
              <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                <Car className="w-5 h-5 text-slate-500" />
              </div>
              <div className="min-w-0">
                <p className="font-mono font-bold text-slate-800 tracking-wide">{veiculo.placa}</p>
                <p className="text-slate-500 text-sm truncate">
                  {veiculo.modelo}{veiculo.ano ? ` · ${veiculo.ano}` : ''}{veiculo.cor ? ` · ${veiculo.cor}` : ''}
                </p>
              </div>
            </div>

            <div className="space-y-1.5 text-sm">
              <Linha rotulo="Condutor" valor={veiculo.condutorNome} />
              <Linha rotulo="Evento" valor={veiculo.eventoNome} />
              <Linha rotulo="Origem do cadastro" valor={ROTULO_TIPO_CADASTRO[veiculo.tipoCadastro as keyof typeof ROTULO_TIPO_CADASTRO] ?? veiculo.tipoCadastro} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-50 py-1.5">
      <span className="text-slate-400 text-xs">{rotulo}</span>
      <span className="text-slate-700 text-right">{valor}</span>
    </div>
  )
}
