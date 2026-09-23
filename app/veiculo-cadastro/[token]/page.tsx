import { Link2Off } from 'lucide-react'
import { linkVeiculoValido } from '@/lib/actions'
import { TITULO_LINK_VEICULO, tipoCadastroValido } from '@/lib/veiculos-constantes'
import VeiculoWizard from './VeiculoWizard'

/**
 * Cadastro público de veículo — sem sessão, sem exigir que o condutor esteja
 * credenciado no evento (pedido do Juan, 23/09/2026). O token vem de
 * `veiculo_links` (um link estável por evento+tipo, gerado em
 * /admin/veiculos); o cadastro nasce `pendente` e só um master/admin/suporte
 * aprovando ativa o QR de verdade — ver `cadastrarVeiculoPublico`.
 */
export default async function VeiculoCadastroPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const link = await linkVeiculoValido(token)

  if (!link.ok) {
    return (
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4 bg-amber-500/15 text-amber-500">
            <Link2Off className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Link indisponível</h1>
          <p className="text-slate-500 text-sm mt-4">
            Este link de cadastro de veículo não está mais ativo. Fale com quem te enviou pra conseguir um novo.
          </p>
        </div>
      </div>
    )
  }

  const tipo = tipoCadastroValido(link.tipo)

  return (
    <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">{TITULO_LINK_VEICULO[tipo]}</h1>
          <p className="text-slate-600 text-sm font-medium mt-1">{link.eventoNome}</p>
        </div>
        <VeiculoWizard token={token} />
      </div>
    </div>
  )
}
