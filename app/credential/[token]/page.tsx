import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import CheckinPresenca, { type MomentoInfo } from './CheckinPresenca'

export const revalidate = 0

const MOMENTOS: { momento: MomentoInfo['momento']; label: string; descricao: string }[] = [
  { momento: 'entrada', label: 'Entrada', descricao: 'QR code na chegada' },
  { momento: 'meio', label: 'Meio', descricao: 'Foto durante o evento' },
  { momento: 'fim', label: 'Saída', descricao: 'QR code na saída' },
]

function statusMomento(inicio: string | null, fim: string | null, feito: boolean): MomentoInfo['status'] {
  if (feito) return 'feito'
  if (!inicio || !fim) return 'indefinido'
  const agora = new Date()
  if (agora < new Date(inicio)) return 'aguardando'
  if (agora > new Date(fim)) return 'encerrado'
  return 'disponivel'
}

export default async function CredentialPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const { data: funcionario } = await supabase
    .from('funcionarios')
    .select('id, nome, empresa, cargo, fornecedores(nome, eventos(id, nome, local, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim))')
    .eq('qr_token', token)
    .single()

  if (!funcionario) notFound()

  const fornecedor = funcionario.fornecedores as any
  const evento = fornecedor?.eventos

  // Registros já feitos por este funcionário neste evento
  const { data: registros } = await supabase
    .from('registros')
    .select('tipo, created_at')
    .eq('funcionario_id', funcionario.id)
    .eq('evento_id', evento?.id)

  const feitoMap: Record<string, string> = {}
  for (const r of registros ?? []) feitoMap[r.tipo] = r.created_at

  const momentos: MomentoInfo[] = MOMENTOS.map(m => {
    const inicio = evento?.[`janela_${m.momento}_inicio`] ?? null
    const fim = evento?.[`janela_${m.momento}_fim`] ?? null
    const feitoEm = feitoMap[m.momento] ?? null
    return {
      ...m,
      inicio,
      fim,
      feitoEm,
      status: statusMomento(inicio, fim, !!feitoEm),
    }
  })

  // QR da credencial (conteúdo = token). Escaneado pelo organizador na entrada e na saída.
  const qrDataUrl = await QRCode.toDataURL(token, { width: 260, margin: 1 })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="bg-gradient-to-r from-brand-500 to-brand-600 px-6 py-6 text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-white/20 rounded-xl mb-3">
              <QrCode className="w-5 h-5 text-white" />
            </div>
            <p className="text-brand-100 text-xs uppercase tracking-widest font-semibold">Credencial oficial</p>
            <h1 className="text-white font-bold text-xl mt-1">{evento?.nome ?? 'Evento'}</h1>
            {evento?.local && <p className="text-brand-100 text-sm mt-0.5">{evento.local}</p>}
          </div>

          <div className="px-6 py-6 space-y-5">
            {/* Funcionário */}
            <div className="text-center pb-4 border-b border-slate-100">
              <p className="text-slate-800 font-bold text-lg leading-tight">{funcionario.nome}</p>
              <p className="text-brand-500 text-sm font-semibold mt-0.5">{funcionario.cargo}</p>
              <p className="text-slate-400 text-xs mt-0.5">{fornecedor?.nome}{funcionario.empresa ? ` • ${funcionario.empresa}` : ''}</p>
            </div>

            {/* QR code (entrada e saída) */}
            <div className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="QR code da credencial" className="mx-auto rounded-xl border border-slate-100" width={200} height={200} />
              <p className="text-slate-400 text-xs mt-2">Apresente este QR code na <strong>entrada</strong> e na <strong>saída</strong> do evento</p>
            </div>

            <CheckinPresenca token={token} momentos={momentos} />
          </div>
        </div>

        <p className="text-center text-slate-500 text-xs mt-4">
          Salve esta página nos favoritos — você vai usá-la durante todo o evento
        </p>
      </div>
    </div>
  )
}
