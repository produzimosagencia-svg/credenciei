import { supabaseAdmin as supabase } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { QrCode } from 'lucide-react'
import QRCode from 'qrcode'
import CheckinPresenca, { type MomentoInfo } from './CheckinPresenca'
import QrProtegido from './QrProtegido'
import ManterAtualizado from './ManterAtualizado'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'
import { gerarCodigoQR, NOME_DA_FASE } from '@/lib/credencial-qr'
import {
  diaBRT, periodoDoEvento, ehDiaPrincipal, janelaMeio, faseDoDia,
  TETO_TURNO_H, type EventoJanelas,
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
      descricao: 'Mostre esta tela no credenciamento quando chegar e quando for embora. O código é lido na hora e a sua presença fica registrada. O crachá da montagem é diferente do crachá do dia do evento — a tela troca sozinha quando chega o dia. Mostre sempre a tela ao vivo, nunca um print.' },
    { alvo: 'cred-etapa-entrada', titulo: '1. Entrada', posicao: 'bottom',
      descricao: 'Na chegada: se o cartão tiver um botão "Registrar entrada", é só tocar nele, com a localização ligada. Sem o botão, procure o posto de credenciamento e mostre o QR Code. O cartão fica verde quando o registro é feito.' },
    { alvo: 'cred-etapa-meio', titulo: '2. Meio — este é por sua conta', posicao: 'bottom',
      descricao: 'Durante o turno, você mesmo confirma que está no posto: toque no cartão, tire uma selfie e pronto. Precisa estar com a localização do celular ligada. Avisamos no WhatsApp quando chegar a hora — não precisa ficar olhando.' },
    { alvo: 'cred-etapa-fim', titulo: '3. Saída', posicao: 'top',
      descricao: 'Na hora de ir embora: mesma lógica da entrada — toque em "Registrar saída" se o cartão oferecer, ou volte ao credenciamento e mostre o QR Code de novo. Isso fecha o seu ciclo no dia.' },
    { alvo: 'cred-etapas', titulo: 'Um ciclo por dia', posicao: 'top',
      descricao: 'Se você trabalha mais de um dia, cada dia tem o seu próprio ciclo: amanhã os três cartões voltam do zero.' },
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
    .select('id, nome, empresa, cargo, fornecedor_id, fornecedores(nome, eventos(id, nome, local, data_inicio, data_fim, checkin_autonomo, token_portaria, portaria_ativa, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim))')
    .eq('qr_token', token)
    .single()

  if (!funcionario) notFound()

  const fornecedor = funcionario.fornecedores as any
  const evento = fornecedor?.eventos as (EventoJanelas & {
    id: string; nome: string; local: string | null
    checkin_autonomo: boolean | null
    token_portaria: string | null
  }) | null

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
  const dentroDoPeriodoBase = !!periodo && dataRef >= periodo.primeiro && dataRef <= periodo.ultimo
  const diaPrincipal = !!evento && ehDiaPrincipal(evento, dataRef)

  /*
   * "Dentro do período" NÃO PODE olhar só `data_inicio`/`data_fim`.
   *
   * `periodoDoEvento` conhece só as datas do EVENTO em si (o dia do show).
   * Ele nunca soube de `jornada_dias` — os dias de montagem e desmontagem,
   * que existem exatamente para a equipe trabalhar ANTES e DEPOIS dessas
   * datas. Resultado real: durante toda a montagem, entrada, meio e saída
   * apareciam "Fora do período do evento" nesta página — mesmo a pessoa
   * podendo bater normalmente pelo QR do portão, que usa outra checagem
   * (`avaliarEntradaSaida`, que sempre soube de `jornada_dias`).
   *
   * O auto-atendimento do meio é o mais afetado: ele só existe AQUI, na
   * credencial — não tem QR físico equivalente. Um setor com o meio ligado
   * durante a montagem nunca conseguiu deixar ninguém bater sozinho.
   */
  let dentroDoPeriodo = dentroDoPeriodoBase
  if (!dentroDoPeriodo && evento) {
    const { data: diaDaJornada } = await supabase
      .from('jornada_dias')
      .select('id')
      .eq('evento_id', evento.id)
      .eq('data', dataRef)
      .eq('cancelado', false)
      .limit(1)
      .maybeSingle()
    dentroDoPeriodo = !!diaDaJornada
  }

  /*
   * Setor de pacote fechado não pede o meio — o cartão some da credencial.
   *
   * O que JÁ foi registrado continua aparecendo: desligar a cobrança não pode
   * apagar da vista uma batida que a pessoa fez. Por isso o filtro deixa
   * passar quando existe `feitoMap.meio`.
   */
  /*
   * Consulta separada da coluna nova — ver `setoresComMeio` em lib/pendencias.
   * Dentro do join acima, uma coluna ainda não migrada derrubaria a busca
   * inteira e a credencial abriria como "não encontrada".
   */
  let exigeMeio = false
  if (funcionario.fornecedor_id) {
    const { data: cfg } = await supabase
      .from('fornecedores').select('exige_meio').eq('id', funcionario.fornecedor_id).maybeSingle()
    exigeMeio = cfg?.exige_meio === true
  }

  const momentos: MomentoInfo[] = ROTULOS
    .filter(({ momento }) => momento !== 'meio' || exigeMeio || feitoMap.meio)
    .map(({ momento, label, descricao }) => {
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
          /*
           * NÃO dizer quando abre.
           *
           * A hora do meio é derivada da entrada, e contar a fórmula ensina a
           * burlar: bastaria bater a entrada, ir embora e voltar no minuto
           * certo. O sistema avisa por WhatsApp quando chegar a hora — a
           * pessoa não precisa saber a conta para cumprir a etapa.
           */
          janelaTexto: 'Você será avisado no WhatsApp quando chegar a hora',
        }
      }
      const j = janelaMeio(entrada.em)
      const aberto = agora >= new Date(j.inicio)
      const atrasado = aberto && agora > new Date(j.fim)
      return {
        ...base, inicio: j.inicio, fim: j.fim,
        /*
         * O meio ABRE e não FECHA — igual ao servidor, que é quem manda.
         *
         * Aqui o cartão sumia depois do fim da janela, e isso tirava de quem
         * se atrasasse a chance de registrar de vez — com equipe grande, isso
         * vira gente sem meio gravado e sem jeito de corrigir sozinha.
         *
         * Chegar tarde não fica escondido: o horário real é gravado, e a tela
         * de pendências e o histórico comparam com o previsto.
         */
        status: aberto ? ('disponivel' as const) : ('aguardando' as const),
        janelaTexto: atrasado
          ? `O prazo era até ${formatarBR(j.fim, 'hora')} — registre mesmo assim`
          : `${formatarBR(j.inicio, 'hora')} às ${formatarBR(j.fim, 'hora')}`,
        /*
         * Quem passou do prazo precisa saber DUAS coisas ao mesmo tempo: que
         * ainda dá para registrar, e que isso não passa em branco.
         *
         * Só a primeira faria o atraso parecer sem consequência. Só a segunda
         * faria a pessoa desistir e procurar o supervisor — que é justamente a
         * fila que se quer evitar no portão.
         */
        avisoAtraso: atrasado
          ? 'O tempo limite já passou, mas você ainda pode registrar — e deve. O horário fica gravado como atrasado, e o credenciamento vai pedir a justificativa da sua ausência no posto.'
          : null,
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
   * O QR é um código ASSINADO e amarrado à ETAPA do evento.
   *
   * O link da credencial é sempre o mesmo — a pessoa nunca recebe mensagem
   * nova —, e dentro de uma etapa o código também é o mesmo todos os dias. O
   * que troca o código é virar de etapa: montagem, dia do evento e desmontagem
   * têm crachás diferentes, e o da montagem não entra no dia do evento.
   * Ver lib/credencial-qr.ts.
   *
   * A etapa vem de `hoje`, não de `dataRef`: num turno que vira a madrugada o
   * registro pertence a ontem, mas o crachá na mão da pessoa é o de hoje, que
   * é o que o scanner confere.
   */
  const faseHoje = faseDoDia(hoje, evento?.data_inicio ? diaBRT(evento.data_inicio) : '')
  const { codigo } = gerarCodigoQR(token, faseHoje)
  const qrDataUrl = await QRCode.toDataURL(codigo, { width: 260, margin: 1 })

  return (
    <TutorialProvider tutorial={TUTORIAL} usuarioId={token}>
      {/* A tela se atualiza sozinha — ninguém aqui vai recarregar a página. */}
      <ManterAtualizado />
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

              <QrProtegido dataUrl={qrDataUrl} dia={hoje} faseLabel={NOME_DA_FASE[faseHoje]} />

              <div data-tutorial="cred-etapas">
                {/*
                  * Fora do dia principal, o auto-atendimento é sempre
                  * permitido. No dia principal, só se o admin ligou
                  * `checkin_autonomo` (ver editar evento) — os dois fluxos
                  * coexistem por escolha dele, nenhum some.
                  */}
                <CheckinPresenca
                  token={token} momentos={momentos}
                  podeAutoRegistrar={!diaPrincipal || evento?.checkin_autonomo === true}
                  /* Só oferece a câmera se existe um cartaz impresso para ler. */
                  temCartazNoLocal={!!evento?.token_portaria}
                />
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
