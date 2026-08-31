import { redirect, notFound } from 'next/navigation'
import QRCode from 'qrcode'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { podeGerenciarEventos, veTodosEventos } from '@/lib/permissions'

export const revalidate = 0

/**
 * O cartaz da portaria, pronto para imprimir.
 *
 * Uma folha A4 só, sem menu, sem barra, sem nada que gaste tinta. É pendurado
 * numa parede e lido de longe por gente com o celular na mão — o QR ocupa a
 * maior parte da página de propósito, e o texto acima dele diz em três linhas
 * o que a pessoa tem que fazer.
 *
 * Só master e admin chegam aqui: é material do evento, não da operação.
 */
export default async function CartazPage({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarEventos(perfil.role)) redirect('/admin')

  const { id } = await params
  const { data: evento } = await supabase
    .from('eventos')
    .select('nome, local, organizacao_id, token_portaria, portaria_ativa')
    .eq('id', id)
    .single()

  if (!evento) notFound()
  if (!veTodosEventos(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) notFound()
  if (!evento.token_portaria) notFound()

  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://credenciei.vercel.app'
  const endereco = `${site}/portaria/${evento.token_portaria}`

  // Correção alta: o cartaz vive numa parede de evento, e vai ser lido com o
  // papel amassado, sujo ou parcialmente coberto. `H` recupera até 30% perdido.
  const qr = await QRCode.toDataURL(endereco, { width: 900, margin: 1, errorCorrectionLevel: 'H' })

  return (
    <div className="min-h-screen bg-white flex items-center justify-center p-8 print:p-0">
      <div className="w-full max-w-lg text-center">
        <p className="text-slate-500 text-sm uppercase tracking-[0.2em] font-semibold">
          Cadastro no evento
        </p>
        <h1 className="text-slate-900 font-bold text-4xl mt-2 leading-tight text-balance">
          {evento.nome}
        </h1>
        {evento.local && <p className="text-slate-500 text-lg mt-1">{evento.local}</p>}

        <div className="my-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR Code do cadastro" className="w-full max-w-sm mx-auto" />
        </div>

        <p className="text-slate-900 font-bold text-2xl">Não está cadastrado?</p>
        <ol className="text-slate-700 text-lg mt-4 space-y-2 text-left max-w-xs mx-auto">
          <li><strong>1.</strong> Aponte a câmera do celular para o código</li>
          <li><strong>2.</strong> Escolha o seu setor</li>
          <li><strong>3.</strong> Preencha e pronto</li>
        </ol>

        <p className="text-slate-400 text-sm mt-8">
          Leva menos de dois minutos. Não precisa instalar nada.
        </p>

        {!evento.portaria_ativa && (
          // Some na impressão: é um aviso para quem está na tela, não para a
          // parede. Imprimir um cartaz desligado sem saber seria pior.
          <p className="print:hidden mt-8 bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-sm">
            O cadastro pela portaria está <strong>fechado</strong>. Este cartaz só funciona
            depois que você abrir na tela do evento.
          </p>
        )}
      </div>
    </div>
  )
}
