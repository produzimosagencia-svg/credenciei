import 'server-only'

import QRCode from 'qrcode'
import { supabaseAdmin } from './supabase-server'
import { statusVeiculoValido, tipoCadastroValido, podeEntrarComStatus, type StatusVeiculo } from './veiculos-constantes'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'

/**
 * Leitura pública do veículo pelo `qr_token` — o que o QR aponta.
 *
 * Mesmo espírito de `lib/cadastro-individual.ts`: fora de `lib/actions.ts`
 * porque não precisa de `getPerfil()`/sessão, é chamado direto pela página
 * `app/veiculo/[token]/page.tsx` (Server Component, sem login).
 */

export type VeiculoPublico = {
  placa: string
  modelo: string
  cor: string | null
  ano: number | null
  condutorNome: string
  status: StatusVeiculo
  podeEntrar: boolean
  tipoCadastro: string
  eventoNome: string
  /**
   * O QR de verdade, pra mostrar no credenciamento — só quando `podeEntrar`.
   * Antes de aprovar não faz sentido exibir (pediria pra escanear um QR que
   * ainda vai ser recusado, e essa mesma página já explica que está pendente).
   */
  qrDataUrl: string | null
}

export async function veiculoPorQrToken(qrToken: string): Promise<VeiculoPublico | null> {
  if (!qrToken) return null

  const { data } = await supabaseAdmin
    .from('veiculos')
    .select('placa, modelo, cor, ano, condutor_nome, status, tipo_cadastro, funcionarios(nome), eventos(nome)')
    .eq('qr_token', qrToken)
    .maybeSingle()
  if (!data) return null

  const funcionario = data.funcionarios as unknown as { nome: string } | { nome: string }[] | null
  const evento = data.eventos as unknown as { nome: string } | { nome: string }[] | null
  const condutorNome =
    (data.condutor_nome as string | null)
    ?? (Array.isArray(funcionario) ? funcionario[0]?.nome : funcionario?.nome)
    ?? 'Não informado'

  const status = statusVeiculoValido(data.status as string)
  const podeEntrar = podeEntrarComStatus(status)

  // Mesmo link que o QR original encode — reaproveita esta própria página
  // como o que o credenciamento vê ao escanear (ver montarQrVeiculo em lib/actions.ts).
  const qrDataUrl = podeEntrar
    ? await QRCode.toDataURL(`${SITE_URL}/veiculo/${qrToken}`, { width: 260, margin: 1 })
    : null

  return {
    placa: data.placa as string,
    modelo: data.modelo as string,
    cor: (data.cor as string | null) ?? null,
    ano: (data.ano as number | null) ?? null,
    condutorNome,
    status,
    podeEntrar,
    tipoCadastro: tipoCadastroValido(data.tipo_cadastro as string),
    eventoNome: (Array.isArray(evento) ? evento[0]?.nome : evento?.nome) ?? '',
    qrDataUrl,
  }
}
