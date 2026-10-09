import { supabaseAdmin as supabase, diaDoTurno } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { QrCode, Clock, Ban, XCircle, ScanFace } from 'lucide-react'
import QRCode from 'qrcode'
import { statusCredenciamentoValido, minutosParaNovoPedido } from '@/lib/credenciamento-constantes'
import CheckinPresenca, { type MomentoInfo } from './CheckinPresenca'
import QrProtegido from './QrProtegido'
import { linkDoSuporte } from '@/lib/whatsapp-suporte'
import { tutorialHabilitadoNoEvento } from '@/lib/internos-servidor'
import { autoatendimentoLiberadoAgora } from '@/lib/autoatendimento'
import CadastrarBiometriaCard from './CadastrarBiometriaCard'
import ManterAtualizado from '@/components/ManterAtualizado'
import TutorialProvider from '@/components/tutorial/TutorialProvider'
import TutorialButton from '@/components/tutorial/TutorialButton'
import type { TutorialConfig } from '@/components/tutorial/types'
import { gerarCodigoQR, NOME_DA_FASE } from '@/lib/credencial-qr'
import {
  diaBRT, periodoDoEvento, ehDiaPrincipal, janelaMeio, faseAtualDoQR,
  TETO_TURNO_H, type EventoJanelas,
} from '@/lib/janelas'
import { formatarBR } from '@/lib/tz'
import { eventoUsaEscalaPorDia, escalaDoFuncionario, diasDaEscalaDoEvento } from '@/lib/escala'
import type { DiaDaEscala } from '@/lib/escala-regras'
import DiasLiberados from './DiasLiberados'
import { avisosPendentesFuncionario } from '@/lib/avisos'
import { setorExigeMeio, diaExigeMeio } from '@/lib/meio'
import AvisoExibicaoModal from '@/components/AvisoExibicaoModal'

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
    .select('id, nome, cpf, empresa, cargo, ativo, status_credenciamento, motivo_negacao, decidido_em, fornecedor_id, fornecedores(nome, token_formulario, eventos(id, nome, local, data_inicio, data_fim, checkin_autonomo, token_portaria, portaria_ativa, janela_entrada_inicio, janela_entrada_fim, janela_meio_inicio, janela_meio_fim, janela_fim_inicio, janela_fim_fim))')
    .eq('qr_token', token)
    .single()

  if (!funcionario) notFound()

  /*
   * Cadastro ≠ autorização (decisão do Juan, 24/09/2026): quem se cadastra
   * pelo link público nasce `pendente` e só vê o QR depois que um responsável
   * aprova. A checagem é aqui, no servidor, antes de qualquer cálculo de QR
   * — nunca no cliente, e nunca é ignorável atualizando a página (a leitura é
   * sempre fresca, `revalidate = 0` já garante isso).
   */
  const fornecedor = funcionario.fornecedores as any
  const statusCred = statusCredenciamentoValido(funcionario.status_credenciamento as string)
  if (statusCred !== 'aprovado' || funcionario.ativo === false) {
    const selo = statusCred === 'pendente'
      ? {
          Icone: Clock, cor: 'bg-amber-500/15 text-amber-400',
          titulo: 'Credenciamento recebido!',
          texto: 'Seus dados foram enviados com sucesso e estão aguardando a confirmação do responsável pelo evento. Avise seu supervisor que você já se cadastrou e peça para ele liberar — assim que for aprovado, seu QR Code aparece automaticamente nesta mesma página, sem precisar fazer nada nem gerar outro cadastro.',
        }
      : statusCred === 'negado'
        ? {
            Icone: Ban, cor: 'bg-red-500/15 text-red-400',
            titulo: 'Credenciamento não aprovado',
            texto: (funcionario.motivo_negacao as string | null)
              ? `Seu pedido não foi autorizado pelo responsável pelo evento. Motivo: ${funcionario.motivo_negacao}`
              : 'Seu pedido de credenciamento não foi autorizado pelo responsável pelo evento. Caso acredite que houve engano, entre em contato com a organização.',
          }
        : {
            Icone: XCircle, cor: 'bg-slate-500/15 text-slate-400',
            titulo: 'Sem acesso no momento',
            texto: 'Fale com o responsável do seu fornecedor.',
          }
    const { Icone } = selo
    return (
      <>
        <ManterAtualizado />
        <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4">
          <div className="w-full max-w-sm">
            <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">
              <div className={`p-6 text-center ${selo.cor}`}>
                <Icone className="w-12 h-12 mx-auto mb-2" />
                <p className="font-bold text-lg">{selo.titulo}</p>
              </div>
              <div className="p-6 space-y-3">
                <p className="text-slate-600 text-sm text-center">{selo.texto}</p>
                {/* Pedido negado: pode tentar de novo pelo formulário depois da espera (lib/credenciamento-constantes.ts). */}
                {statusCred === 'negado' && fornecedor?.token_formulario && (() => {
                  const faltam = minutosParaNovoPedido(funcionario.decidido_em as string | null)
                  return faltam > 0 ? (
                    <p className="text-slate-500 text-xs text-center">
                      Você poderá fazer um novo pedido em <strong>{faltam} minuto{faltam === 1 ? '' : 's'}</strong>. Esta tela se atualiza sozinha.
                    </p>
                  ) : (
                    <a
                      href={`/form/${fornecedor.token_formulario}`}
                      className="block w-full text-center rounded-xl bg-slate-900 text-white text-sm font-bold px-4 py-3"
                    >
                      Fazer um novo pedido
                    </a>
                  )
                })()}
                <div className="text-center pt-2 border-t border-slate-100">
                  <p className="text-slate-800 font-semibold">{funcionario.nome}</p>
                  <p className="text-slate-400 text-xs">{fornecedor?.nome}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

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

  /*
   * O turno de ontem só manda nesta tela enquanto estiver ABERTO.
   *
   * A janela de TETO_TURNO_H acima existe pro turno que vira a madrugada,
   * mas 18h atrás, de manhã, também alcança a TARDE DE ONTEM. Sem esta
   * conferência, quem entrou 17h e saiu 20h ontem abria a credencial hoje
   * de manhã e via "Entrada registrada / Saída registrada" com os horários
   * de ONTEM — parecia que já tinha batido tudo, quando hoje não tinha
   * batido nada. É o mesmo erro que estava no scanner
   * (`inferirMomentoQR`), corrigido junto em 03/09/2026.
   *
   * Turno com saída = turno fechado = dia encerrado. A credencial volta
   * pra hoje, zerada, que é o que a pessoa precisa ver.
   */
  /*
   * A saída só fecha ESTA entrada se veio depois dela (`.gt`).
   *
   * Quem dobra o turno tem duas jornadas no mesmo dia: sai 08:46 da
   * manhã, volta 18:21 da noite e vai embora só no dia seguinte. Sem o
   * `.gt`, a saída DA MANHÃ faria o turno da noite parecer fechado.
   */
  const { data: fimDoTurno } = entrada
    ? await supabase
        .from('registros')
        .select('created_at')
        .eq('funcionario_id', funcionario.id)
        .eq('evento_id', evento?.id ?? '')
        .eq('tipo', 'fim')
        .eq('data_ref', entrada.dataRef)
        .gt('created_at', entrada.em)
        .limit(1)
    : { data: null }

  const turnoAberto = !!entrada && !fimDoTurno?.length
  /*
   * Sem turno aberto, o dia do TURNO (`diaDoTurno`), não o do calendário: às
   * 05:30 do dia 26, quem já bateu a saída da noite de 25 vê a noite de 25
   * fechada — e não os cartões zerados de 26, que faziam a pessoa voltar ao
   * portão pra "entrar de novo".
   */
  const dataRef = turnoAberto ? entrada.dataRef : await diaDoTurno(evento?.id ?? '', agora)

  // Só os registros DESTE dia. Olhar o evento inteiro faria os cartões
  // aparecerem verdes já no segundo dia de uma operação de vários dias.
  const { data: registros } = await supabase
    .from('registros')
    .select('tipo, created_at')
    .eq('funcionario_id', funcionario.id)
    .eq('evento_id', evento?.id ?? '')
    .eq('data_ref', dataRef)

  /*
   * Com o turno aberto, meio e saída de ANTES da entrada são de outra
   * jornada do mesmo dia — a de quem dobrou o turno. Mostrá-los aqui
   * faria a pessoa que está no meio do turno da noite ver "Saída
   * registrada às 08:46" e achar que já fechou o dia. A entrada em si
   * nunca é filtrada: ela é a âncora.
   */
  const feitoMap: Record<string, string> = {}
  for (const r of registros ?? []) {
    if (turnoAberto && r.tipo !== 'entrada' && r.created_at < entrada!.em) continue
    feitoMap[r.tipo] = r.created_at
  }

  /*
   * Saiu e voltou no mesmo dia (pausas_turno, 26/09/2026): cada ida e volta
   * aparece como um par já feito (entrada ✓, saída ✓), e o cartão de entrada
   * de agora mostra a hora da VOLTA — com a saída pendente embaixo. Tolerante
   * à tabela ainda não existir: sem ela, fica como antes.
   */
  const { data: pausasDoDia } = feitoMap.entrada
    ? await supabase
        .from('pausas_turno')
        .select('saiu_em, voltou_em')
        .eq('funcionario_id', funcionario.id)
        .eq('evento_id', evento?.id ?? '')
        .eq('data_ref', dataRef)
        .order('saiu_em')
        .then(r => (r.error ? { data: [] as { saiu_em: string; voltou_em: string }[] } : r))
    : { data: [] as { saiu_em: string; voltou_em: string }[] }
  const turnosAnteriores: { entrada: string; saida: string }[] = []
  let entradaAtualEm: string | null = feitoMap.entrada ?? null
  for (const p of pausasDoDia ?? []) {
    if (!entradaAtualEm) break
    turnosAnteriores.push({ entrada: entradaAtualEm, saida: p.saiu_em as string })
    entradaAtualEm = p.voltou_em as string
  }

  const periodo = evento ? periodoDoEvento(evento) : null
  const dentroDoPeriodoBase = !!periodo && dataRef >= periodo.primeiro && dataRef <= periodo.ultimo

  /*
   * Uma consulta só a `jornada_dias`, cobrindo as DUAS datas que importam
   * nesta página — `dataRef` (o dia ao qual a batida em aberto pertence,
   * pode ser ontem) e `hoje` (o dia real, agora — o QR assina pra ele). São
   * perguntas diferentes: janela de entrada/saída usa `dataRef`; a fase que
   * assina o QR usa `hoje`. Num evento de uma noite só as duas quase sempre
   * coincidem; num festival de mais de uma noite, podem não coincidir.
   *
   * Também substitui a antiga consulta de só-existência: `tipo` já responde
   * "isto é dia de trabalho?" (linha existe) E "é dia principal?" (tipo).
   */
  const datasRelevantes = [...new Set([dataRef, hoje])]
  const { data: diasJornada } = evento
    ? await supabase
        .from('jornada_dias')
        .select('data, tipo, cancelado, entrada_inicio, entrada_fim, saida_inicio, saida_fim')
        .eq('evento_id', evento.id)
        .in('data', datasRelevantes)
    : { data: null }
  const porData = new Map((diasJornada ?? []).map(d => [d.data as string, d]))
  const diaDaRef = porData.get(dataRef) ?? null
  const diaDeHoje = porData.get(hoje) ?? null

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
  const dentroDoPeriodo = dentroDoPeriodoBase || (!!diaDaRef && diaDaRef.cancelado !== true)

  /*
   * Dia principal EFETIVO: a linha de `jornada_dias` manda quando existir
   * (é o que permite uma segunda noite de festival, marcada `tipo:
   * 'principal'`, contar como tal mesmo não sendo a data de início do
   * evento); sem linha (evento sem jornada materializada), cai pra
   * `ehDiaPrincipal` — a data de início continua sendo a única resposta
   * possível.
   */
  const diaPrincipal = diaDaRef ? diaDaRef.tipo === 'principal' : (!!evento && ehDiaPrincipal(evento, dataRef))

  /*
   * Setor de pacote fechado não pede o meio — o cartão some da credencial.
   *
   * O que JÁ foi registrado continua aparecendo: desligar a cobrança não pode
   * apagar da vista uma batida que a pessoa fez. Por isso o filtro deixa
   * passar quando existe `feitoMap.meio`.
   */
  /*
   * Duas chaves: o setor E o dia de hoje — a regra inteira em `lib/meio.ts`,
   * onde cada leitura é isolada e tolerante a migração pendente. Dentro do
   * join acima, uma coluna ainda não migrada derrubaria a busca inteira e a
   * credencial abriria como "não encontrada".
   */
  const exigeMeio = evento
    ? (await diaExigeMeio(evento.id, hoje)) && (await setorExigeMeio(funcionario.fornecedor_id))
    : false

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
    // O dia pode ter horário PRÓPRIO (segunda noite de um festival); sem um,
    // cai pro campo único do evento — mesmo padrão de `avaliarEntradaSaida`.
    const campoDia = momento === 'entrada' ? 'entrada' : 'saida'
    const inicio = diaDaRef?.[`${campoDia}_inicio`] ?? evento[`janela_${momento}_inicio`] ?? null
    const fim = diaDaRef?.[`${campoDia}_fim`] ?? evento[`janela_${momento}_fim`] ?? null

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
   * A etapa vem do instante atual, não de `dataRef`: num turno que vira a
   * madrugada o registro pertence a ontem e o QR do evento continua válido
   * até o término configurado, que é o mesmo critério usado pelo scanner.
   */
  const ehPrincipalHoje = diaDeHoje ? diaDeHoje.tipo === 'principal' : (!!evento && ehDiaPrincipal(evento, hoje))
  const faseHoje = faseAtualDoQR(agora, evento?.data_inicio, evento?.data_fim, ehPrincipalHoje)
  const { codigo } = gerarCodigoQR(token, faseHoje)
  /*
   * Mais fácil de a câmera do portão achar (26/09/2026, reclamação de demora
   * na saída): margem branca de 3 módulos (era 1 — os leitores precisam desse
   * respiro em volta pra localizar o QR) e imagem grande o bastante pra ficar
   * nítida quando a tela mostra o QR maior. O conteúdo é o mesmo.
   */
  const qrDataUrl = await QRCode.toDataURL(codigo, { width: 480, margin: 3, errorCorrectionLevel: 'M' })

  const avisos = evento
    ? await avisosPendentesFuncionario({
        eventoId: evento.id, funcionarioId: funcionario.id, fornecedorId: funcionario.fornecedor_id, cpf: funcionario.cpf,
      })
    : []

  /*
   * Aviso de uniforme/identificação (Vital, item 4, 30/09/2026) — texto FIXO
   * do evento, diferente do sistema de `avisos` acima (que é pontual e some
   * quando a pessoa vê uma vez). Consulta À PARTE e tolerante: coluna nova,
   * e esta é a tela mais visitada do sistema — uma migração pendente não
   * pode derrubar a credencial inteira por causa de um campo extra.
   */
  let avisoUniformeTexto: string | null = null
  if (evento?.id) {
    try {
      const { data } = await supabase.from('eventos').select('aviso_uniforme_texto').eq('id', evento.id).maybeSingle()
      avisoUniformeTexto = (data as { aviso_uniforme_texto?: string | null } | null)?.aviso_uniforme_texto?.trim() || null
    } catch { /* migração pendente */ }
  }

  /*
   * Subgrupo/subevento (Vital, 02/10/2026) — mesmo padrão tolerante de
   * `avisoUniformeTexto` acima: consulta À PARTE, coluna nova. Só mostra
   * quando o evento de fato usa subeventos — pra não exibir "SUBGRUPO: —"
   * nos ~99% dos eventos que nunca ligaram essa funcionalidade. Vem sempre
   * do vínculo ATUAL (`funcionarios.subevento_id`), então uma pessoa
   * movida de subgrupo já aparece com o novo na próxima vez que abrir a
   * credencial — não precisa de nada especial além de ler de novo.
   */
  let subeventoNome: string | null = null
  if (evento?.id) {
    try {
      const { data: eventoUsaSubeventos } = await supabase.from('eventos').select('tem_subeventos').eq('id', evento.id).maybeSingle()
      if ((eventoUsaSubeventos as { tem_subeventos?: boolean } | null)?.tem_subeventos === true) {
        const { data } = await supabase.from('funcionarios').select('subeventos(nome)').eq('id', funcionario.id).maybeSingle()
        subeventoNome = (data as unknown as { subeventos?: { nome?: string } | null } | null)?.subeventos?.nome ?? null
      }
    } catch { /* migração pendente */ }
  }

  /*
   * Supervisor em mais de um setor do evento: o QR é UM só (a credencial é por pessoa e por evento) e o
   * topo mostra o evento e TODOS os setores a que ele está ligado — em vez de só o do crachá (pedido do
   * Juan, 08/10/2026). Consulta à parte e tolerante, como as outras daqui: falhou, a credencial abre igual.
   */
  let setoresDoSupervisor: string[] = []
  if (evento?.id && funcionario.cpf) {
    try {
      const { data: perfilDoCpf } = await supabase.from('perfis').select('id').eq('cpf', funcionario.cpf).maybeSingle()
      if (perfilDoCpf?.id) {
        const { data: vinculos } = await supabase
          .from('supervisor_setores').select('fornecedores!inner(nome, evento_id, subeventos(nome))')
          .eq('perfil_id', perfilDoCpf.id).eq('fornecedores.evento_id', evento.id)
        setoresDoSupervisor = (vinculos ?? [])
          .map(v => v.fornecedores as unknown as { nome?: string; subeventos?: { nome?: string } | null } | null)
          .filter((f): f is { nome: string; subeventos?: { nome?: string } | null } => !!f?.nome)
          .map(f => (f.subeventos?.nome ? `${f.nome.trim()} (${f.subeventos.nome})` : f.nome.trim()))
          .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      }
    } catch { /* migração dos vínculos pendente */ }
  }
  const variosSetores = setoresDoSupervisor.length > 1

  /*
   * Escala por dia (eventos de subeventos) — os dias em que ESTE QR vale.
   * Mostrado sempre que a pessoa está no fluxo, para a regra nunca ser
   * surpresa no portão: ela vê os dias confirmados, vê quando hoje não está
   * entre eles, e sabe que mudar é com o supervisor. A recusa de verdade é no
   * servidor (`conferirEscalaNoDia`); isto aqui é só o aviso.
   */
  let escala: { pendente: boolean; aprovados: string[]; diasDoEvento: DiaDaEscala[] } | null = null
  if (evento?.id && await eventoUsaEscalaPorDia(evento.id)) {
    const [e, diasDoEvento] = await Promise.all([escalaDoFuncionario(funcionario.id), diasDaEscalaDoEvento(evento.id)])
    if (e?.status) {
      escala = {
        pendente: e.status === 'pendente',
        aprovados: e.dias.filter(d => d.aprovado).map(d => d.data),
        diasDoEvento,
      }
    }
  }

  /*
   * Biometria autoatendimento — consulta À PARTE e tolerante (mesmo padrão
   * de `metodoIdentificacaoDoEvento`): esta página já é grande e crítica
   * (é a credencial de todo mundo), e pedir uma coluna que ainda não existe
   * no select principal derrubaria a página inteira por causa de um recurso
   * que a maioria dos eventos nem liga.
   */
  let biometriaAutoatendimento = false
  let metodoAcesso: 'qr' | 'biometria' | 'biometria_qr' = 'qr'
  // Falta cadastrar o rosto NESTE evento — pulou no formulário, câmera
  // falhou, ou o formulário nem oferecia biometria quando ela se cadastrou.
  // Ver CadastrarBiometriaCard.tsx (a rede de segurança) e `completarBiometriaPublica`.
  let faltaBiometria = false
  if (evento) {
    try {
      const { data } = await supabase
        .from('eventos').select('metodo_identificacao, biometria_autoatendimento').eq('id', evento.id).maybeSingle()
      if (data?.metodo_identificacao === 'biometria' || data?.metodo_identificacao === 'biometria_qr') {
        metodoAcesso = data.metodo_identificacao
      }
      biometriaAutoatendimento = metodoAcesso !== 'qr' && data?.biometria_autoatendimento === true

      if (metodoAcesso !== 'qr') {
        const { data: template } = await supabase
          .from('biometria_templates').select('id').eq('funcionario_id', funcionario.id).eq('evento_id', evento.id).maybeSingle()
        faltaBiometria = !template
      }
    } catch { /* biometria ainda não migrada */ }
  }

  const tutorialDoEvento = await tutorialHabilitadoNoEvento(evento?.id ?? null)
  /*
   * Autoatendimento fora do horário da portaria (pedido do Juan, 08/10/2026): só liberado quando o operador
   * apertou "Estou indo embora" E ainda está dentro da janela configurada em Editar evento — fora dela, a
   * credencial continua só mostrando o QR. A biometria autoatendimento (acima) é um recurso diferente e não muda.
   *
   * NUNCA no dia principal (correção do Juan, mesmo dia): "dia do evento não funciona a batida sozinha do
   * funcionário, somente com os operadores e gestores de credenciamento do portão da portaria" — o servidor já
   * recusa (`registrarPresencaLivre`), isto só evita mostrar um botão que erraria na hora.
   */
  const podeAutoRegistrar = !ehPrincipalHoje && await autoatendimentoLiberadoAgora(evento?.id ?? null, dataRef)

  return (
    <TutorialProvider tutorial={TUTORIAL} usuarioId={token} ativo={tutorialDoEvento}>
      {avisos.length > 0 && <AvisoExibicaoModal avisos={avisos} contexto="funcionario" token={token} />}
      {/* A tela se atualiza sozinha — ninguém aqui vai recarregar a página. */}
      <ManterAtualizado />
      <div className="min-h-screen bg-[#0e0e0e] flex items-center justify-center p-4">
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
              {/* Supervisor: o evento e o(s) setor(es) a que ele está ligado. */}
              {setoresDoSupervisor.length > 0 && (
                <p className="text-white/90 text-xs font-semibold mt-2 leading-snug" data-testid="setores-do-supervisor">
                  Supervisor de {setoresDoSupervisor.join(' • ')}
                </p>
              )}
            </div>

            <div className="px-6 py-6 space-y-5">
              {/* Funcionário */}
              <div className="text-center pb-4 border-b border-slate-100" data-tutorial="cred-identidade">
                <p className="text-slate-800 font-bold text-lg leading-tight">{funcionario.nome}</p>
                {funcionario.cargo && <p className="text-brand-500 text-sm font-semibold mt-0.5">{funcionario.cargo}</p>}
                {/* Com vários setores, o do crachá sozinho confundiria: a lista inteira já está no topo. */}
                <p className="text-slate-400 text-xs mt-0.5">{variosSetores ? '' : fornecedor?.nome}{variosSetores ? (funcionario.empresa ?? '') : (funcionario.empresa ? ` • ${funcionario.empresa}` : '')}</p>
                {subeventoNome && (
                  <p className="text-slate-500 text-xs font-semibold mt-1 uppercase tracking-wide">
                    Subgrupo: {subeventoNome}
                  </p>
                )}
              </div>

              {/*
                * Aviso de uniforme/identificação — banner FIXO, sempre
                * visível (nunca dispensável como os `avisos` comuns acima),
                * porque regra de uniforme precisa ser lembrada toda vez que
                * a pessoa abre a credencial, não só a primeira.
                */}
              {avisoUniformeTexto && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-amber-800 text-sm font-semibold">Uniforme e identificação</p>
                  <p className="text-amber-900/80 text-sm mt-1 leading-relaxed whitespace-pre-line">{avisoUniformeTexto}</p>
                </div>
              )}

              {/*
                * Guia de acesso — só quando o evento roda biometria. O QR
                * continua existindo (bloco abaixo), só deixa de ser
                * apresentado como o método principal: pedido do Juan
                * (27/09/2026), pra pessoa não ficar em dúvida se precisa
                * mostrar o QR Code ou não.
                */}
              {metodoAcesso !== 'qr' && (
                <div className="rounded-2xl border border-brand-100 bg-brand-50 p-4 space-y-2">
                  <p className="flex items-center gap-2 text-brand-700 font-bold text-base">
                    <ScanFace className="w-5 h-5 shrink-0" /> Reconhecimento facial
                  </p>
                  <p className="text-brand-900/80 text-sm leading-relaxed">
                    Seu acesso será feito por reconhecimento facial. No dia do evento, dirija-se a{' '}
                    <strong>{evento?.local?.trim() || 'o local do credenciamento'}</strong> e procure a equipe.
                    Posicione-se em frente ao tablet quando for chamado e aguarde a confirmação.
                    {metodoAcesso === 'biometria_qr' && ' Se não for possível te reconhecer, a equipe pode usar o QR Code abaixo como alternativa.'}
                  </p>
                </div>
              )}

              {faltaBiometria && <CadastrarBiometriaCard token={token} />}

              <QrProtegido
                dataUrl={qrDataUrl} dia={hoje} faseLabel={NOME_DA_FASE[faseHoje]} metodoAcesso={metodoAcesso}
                // Só pra quem já foi aprovado (quem não foi nem chega aqui: sai antes, na tela de pendente/negado).
                linkSuporte={statusCred === 'aprovado' ? linkDoSuporte({ nome: funcionario.nome, evento: evento?.nome, setor: fornecedor?.nome }) : null}
              />

              {escala && (
                <DiasLiberados pendente={escala.pendente} aprovados={escala.aprovados} diasDoEvento={escala.diasDoEvento} hoje={hoje} />
              )}

              <div data-tutorial="cred-etapas">
                {/*
                  * Fora do dia principal, o auto-atendimento é sempre
                  * permitido. No dia principal, só se o admin ligou
                  * `checkin_autonomo` (ver editar evento) — os dois fluxos
                  * coexistem por escolha dele, nenhum some.
                  */}
                <CheckinPresenca
                  token={token}
                  // Com pausas, o cartão de entrada mostra a hora da VOLTA.
                  momentos={turnosAnteriores.length
                    ? momentos.map(m => (m.momento === 'entrada' && m.status === 'feito' ? { ...m, feitoEm: entradaAtualEm } : m))
                    : momentos}
                  turnosAnteriores={turnosAnteriores}
                  // Entrada e saída só pelo operador de portão (08/10/2026) — exceto na janela de autoatendimento.
                  podeAutoRegistrar={podeAutoRegistrar}
                  /* Só oferece a câmera se existe um cartaz impresso para ler. */
                  temCartazNoLocal={!!evento?.token_portaria}
                  biometriaAutoatendimento={false}
                  metodoAcesso={metodoAcesso}
                  // Mesma regra do servidor (`conferirEscalaNoDia`): escala pendente, ou hoje fora dos dias aprovados.
                  bloqueadoHoje={!!escala && (escala.pendente || !escala.aprovados.includes(hoje))}
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
