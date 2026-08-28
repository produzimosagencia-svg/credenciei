import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import CheckinPresenca, { type MomentoInfo } from './CheckinPresenca'
import QrProtegido from './QrProtegido'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'
import { gerarCodigoQR } from '@/lib/credencial-qr'
import {
  diaBRT, periodoDoEvento, ehDiaPrincipal, janelaMeio,
  HORAS_ATE_MEIO, TETO_TURNO_H, type EventoJanelas,
} from '@/lib/janelas'
import { formatarBR } from '@/lib/tz'

export const revalidate = 0

/*
 * O tutorial fala em CREDENCIAMENTO, não em supervisor.
 *
 * Quem lê o QR na entrada e na saída é o posto de credenciamento — pode ser o
 * supervisor do setor, pode ser a portaria, pode ser outra pessoa da produção.
 * Mandar procurar "seu supervisor" fazia a pessoa ir atrás de quem, na maior
 * parte dos eventos, não é quem faz a leitura.
 */
const TUTORIAL: TutorialConfig = {
  tela: 'funcionario-credencial',
  versao: 2,
  passos: [
    { alvo: 'cred-identidade', titulo: 'Esta é a sua credencial', posicao: 'bottom',
      descricao: 'Guarde este link no celular — é ele que você vai usar durante todo o evento. Vale só para você e para este evento.' },
    { alvo: 'cred-qr', titulo: 'Seu QR Code', posicao: 'bottom',
      descricao: 'Mostre esta tela no credenciamento quando chegar e quando for embora. O código é lido na hora e a sua presença fica registrada. O código muda todo dia: o de hoje não vale amanhã, e o de ontem não vale hoje. Por isso mostre sempre a tela ao vivo, nunca um print.' },
    { alvo: 'cred-etapa-entrada', titulo: '1. Entrada', posicao: 'bottom',
      descricao: 'Na chegada, procure o posto de credenciamento e mostre o QR Code. O cartão fica verde quando o registro é feito.' },
    { alvo: 'cred-etapa-meio', titulo: '2. Meio — este é por sua conta', posicao: 'bottom',
      descricao: `Quatro horas depois da sua entrada, você mesmo confirma que está no posto: toque no cartão, tire uma selfie e pronto. Precisa estar com a localização do celular ligada.` },
    { alvo: 'cred-etapa-fim', titulo: '3. Saída', posicao: 'top',
      descricao: 'Na hora de ir embora, volte ao credenciamento e mostre o QR Code de novo. Isso fecha o seu ciclo no dia.' },
    { alvo: 'cred-etapas', titulo: 'Um ciclo por dia', posicao: 'top',
      descricao: 'Se você trabalha mais de um dia, cada dia tem o seu próprio ciclo: amanhã os três cartões voltam do zero. O horário do meio é contado a partir da hora em que você bateu a entrada naquele dia.' },
  ],
}

type Etapa = 'entrada' | 'meio' | 'fim'

const ROTULOS: { momento: Etapa; label: string; descricao: string }[] = [
  { momento: 'entrada', label: 'Entrada', descricao: 'QR code na chegada' },
  { momento: 'meio', label: 'Meio', descricao: 'Foto durante o turno' },
  { momento: 'fim', label: 'Saída', descricao: 'QR code na saída' },
]

/** Status a partir do relógio, quando a etapa tem horário. */
function statusPorRelogio(inicio: string, fim: string, agora: Date): MomentoInfo['status'] {
  if (agora < new Date(inicio)) return 'aguardando'
  if (agora > new Date(fim)) return 'encerrado'
  return 'disponivel'
}

export default async function CredentialPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  const { data: funcionario } = await supabase
    .from('funcionarios')
    .select('id, nome, empresa, cargo, fornecedores(nome, eventos(id, nome, local, data_inicio, data_fim, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim))')
    .eq('qr_token', token)
    .single()

  if (!funcionario) notFound()

  const fornecedor = funcionario.fornecedores as any
  const evento = fornecedor?.eventos as (EventoJanelas & { id: string; nome: string; local: string | null }) | null

  const agora = new Date()
  const hoje = diaBRT(agora)

  /*
   * O DIA desta credencial.
   *
   * Não é sempre "hoje": quem entrou às 22:00 e está vendo a tela às 02:00
   * continua no ciclo de ontem, e mostrar os três cartões zerados faria a
   * pessoa achar que precisa bater a entrada de novo no meio do próprio turno.
   */
  const { data: entradaRecente } = await supabase
    .from('registros')
    .select('data_ref, created_at')
    .eq('funcionario_id', funcionario.id)
    .eq('evento_id', evento?.id ?? '')
    .eq('tipo', 'entrada')
    .gte('created_at', new Date(agora.getTime() - TETO_TURNO_H * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)

  const entrada = entradaRecente?.[0]
    ? {
        em: entradaRecente[0].created_at as string,
        dataRef: (entradaRecente[0].data_ref as string | null) ?? diaBRT(entradaRecente[0].created_at as string),
      }
    : null

  const dataRef = entrada?.dataRef ?? hoje

  // Só os registros DESTE dia. Olhar o evento inteiro faria os cartões
  // aparecerem verdes já no segundo dia de uma operação de vários dias.
  const { data: registros } = await supabase
    .from('registros')
    .select('tipo, created_at')
    .eq('funcionario_id', funcionario.id)
    .eq('evento_id', evento?.id ?? '')
    .eq('data_ref', dataRef)

  const feitoMap: Record<string, string> = {}
  for (const r of registros ?? []) feitoMap[r.tipo] = r.created_at

  const periodo = evento ? periodoDoEvento(evento) : null
  const dentroDoPeriodo = !!periodo && dataRef >= periodo.primeiro && dataRef <= periodo.ultimo
  const diaPrincipal = !!evento && ehDiaPrincipal(evento, dataRef)

  const momentos: MomentoInfo[] = ROTULOS.map(({ momento, label, descricao }) => {
    const feitoEm = feitoMap[momento] ?? null
    const base = { momento, label, descricao, feitoEm }

    if (feitoEm) return { ...base, inicio: null, fim: null, status: 'feito' as const, janelaTexto: '' }

    if (!evento || !dentroDoPeriodo) {
      return { ...base, inicio: null, fim: null, status: 'indefinido' as const, janelaTexto: 'Fora do período do evento' }
    }

    // ── Meio: a única etapa com horário próprio, e ele é individual ──────────
    if (momento === 'meio') {
      if (!entrada) {
        return {
          ...base, inicio: null, fim: null, status: 'aguardando' as const,
          janelaTexto: `Abre ${HORAS_ATE_MEIO}h depois da sua entrada`,
        }
      }
      const j = janelaMeio(entrada.em)
      return {
        ...base, inicio: j.inicio, fim: j.fim,
        status: statusPorRelogio(j.inicio, j.fim, agora),
        janelaTexto: `${formatarBR(j.inicio, 'hora')} às ${formatarBR(j.fim, 'hora')}`,
      }
    }

    // ── Entrada e saída: livres, menos no dia principal ─────────────────────
    const inicio = evento[`janela_${momento}_inicio`] ?? null
    const fim = evento[`janela_${momento}_fim`] ?? null

    if (!diaPrincipal || !inicio || !fim) {
      return { ...base, inicio: null, fim: null, status: 'disponivel' as const, janelaTexto: 'Livre hoje, a qualquer hora' }
    }
    return {
      ...base, inicio, fim,
      status: statusPorRelogio(inicio, fim, agora),
      janelaTexto: `${formatarBR(inicio, 'hora')} às ${formatarBR(fim, 'hora')}`,
    }
  })

  /*
   * O QR é um código ASSINADO e amarrado ao DIA DE HOJE.
   *
   * O link da credencial é sempre o mesmo — a pessoa não recebe mensagem nova
   * —, mas a imagem muda a cada dia. Um print de ontem não passa hoje, que é o
   * que impede o crachá de circular no grupo. Ver lib/credencial-qr.ts.
   *
   * Note que é `hoje`, não `dataRef`: num turno que vira a madrugada o registro
   * pertence a ontem, mas o crachá na mão da pessoa tem que ser o de hoje, que
   * é o que o scanner confere.
   */
  const { codigo } = gerarCodigoQR(token, hoje)
  const qrDataUrl = await QRCode.toDataURL(codigo, { width: 260, margin: 1 })

  return (
    <TutorialProvider tutorial={TUTORIAL} usuarioId={token}>
      <div className="min-h-screen bg-[#f4f5f8] flex items-center justify-center p-4">
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
              <div className="text-center pb-4 border-b border-slate-100" data-tutorial="cred-identidade">
                <p className="text-slate-800 font-bold text-lg leading-tight">{funcionario.nome}</p>
                <p className="text-brand-500 text-sm font-semibold mt-0.5">{funcionario.cargo}</p>
                <p className="text-slate-400 text-xs mt-0.5">{fornecedor?.nome}{funcionario.empresa ? ` • ${funcionario.empresa}` : ''}</p>
              </div>

              <QrProtegido dataUrl={qrDataUrl} dia={hoje} />

              <div data-tutorial="cred-etapas">
                <CheckinPresenca token={token} momentos={momentos} />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center gap-3 mt-4">
            <TutorialButton />
            <p className="text-center text-slate-500 text-xs">
              Salve esta página nos favoritos — você vai usá-la durante todo o evento
            </p>
          </div>
        </div>
      </div>
    </TutorialProvider>
  )
}
