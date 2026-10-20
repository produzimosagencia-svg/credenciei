'use client'
import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import { registrarPresencaQR, registrarSaidaComEntradaInformada, conferirVeiculoPorQR, cancelarLeituraQR } from '@/lib/actions'
import { useLocalizacaoOperador, BloqueioSemLocalizacao } from '@/components/LocalizacaoOperador'
import ConferenciaCpf from './ConferenciaCpf'
import { emNavegadorEmbutido, copiarTexto } from '@/lib/navegador'
import { formatarBR } from '@/lib/tz'
import { ScanLine, CameraOff, Copy, CheckCheck, Loader2, CloudOff } from 'lucide-react'
import AvisoFilaSemInternet, { useFilaSemInternet } from '@/components/FilaSemInternet'
import ModoSemInternet from '@/components/ModoSemInternet'
import CampoHoraDeEntrada from '@/components/CampoHoraDeEntrada'
import { percebeuSemRede } from '@/lib/rede-do-portao'
import {
  guardarNaFila, guardarNaFilaJuntos, pessoaPeloQR, tokenDoQR, motivoDaSituacao, agoraCerto, idNovo, entradaInformadaParaSaida, situacaoDeEntrada, anotarBatidaPeloQR,
  horaDeEntradaValida, type SituacaoDeEntrada,
} from '@/lib/fila-offline'

type Evento = { id: string; nome: string }
type ScanResult = {
  success: boolean
  message: string
  funcionario?: { nome: string; cargo: string | null; setor?: string | null }
  /** QR de veículo, não de funcionário — mesmo scanner, os dois tipos (24/09/2026). */
  veiculo?: { placa: string; modelo: string; condutorNome: string; entradaLiberadaEm?: string }
  faseErrada?: { doQR: string; deHoje: string }
  momento?: 'entrada' | 'meio' | 'fim'
  /** Leitura repetida: já estava registrado, nada foi gravado agora. */
  jaRegistrado?: boolean
  qrInvalido?: boolean
  /** O aparelho de quem leu estava fora do raio do local do evento (Vital, 08/10/2026) — a batida NÃO foi gravada. */
  foraDoLocal?: boolean
  localImpreciso?: boolean
  semLocalizacao?: boolean
  distanciaForaDoLocal?: number
  /** Credencial válida, mas de uma área que este portão não está lendo (Vital, 01/10/2026). */
  areaErrada?: boolean
  /** Evento de subeventos: hoje não está entre os dias aprovados na escala da pessoa. */
  diaNaoAutorizado?: boolean
  /** O setor da pessoa já bateu o limite de entradas do dia — NÃO liberar. */
  setorLotado?: boolean
  /** Só da tela: a resposta não chegou no tempo — ver `TEMPO_SEM_RESPOSTA_MS`. */
  semResposta?: boolean
  /** Prévia: conferido, nada gravado — espera SALVAR / CANCELAR. */
  previa?: boolean
  volta?: boolean
  encerra?: boolean
  /** Entrada atrasada, fornecedor exige meio (Vital, 30/09/2026) — pede o motivo antes de salvar. */
  precisaJustificativaAtraso?: boolean
  /** Registrada com aviso (fora da escala, acima do limite do dia) — o portão não barra mais (18/10/2026). */
  aviso?: string
  /** Só da tela: o pedido não chegou ao servidor (sem internet). */
  semRede?: boolean
  /** Só da tela: prévia SEM INTERNET — SALVAR guarda no aparelho (lib/fila-offline.ts). */
  offline?: boolean
  /** Só da tela: a batida foi guardada no aparelho e sobe quando a internet voltar. */
  guardado?: boolean
  /** Só da tela (prévia sem internet): quem é na lista guardada — habilita "informar a hora da entrada" na saída. */
  pessoaId?: string
  /** Só da tela (prévia sem internet): se a pessoa já tem entrada, como o aparelho enxerga (lista guardada + fila). */
  situacaoEntrada?: SituacaoDeEntrada
  /** Do servidor: a SAÍDA foi recusada só por falta de entrada — a tela oferece informar a hora (ver `registrarSaidaComEntradaInformada`). */
  semEntrada?: boolean
  funcionarioId?: string
}

/** O QR do veículo é um link (`/veiculo/{token}`), não o crachá assinado do funcionário. */
const ehQrDeVeiculo = (texto: string) => /\/veiculo\/[A-Za-z0-9_-]{10,}/.test(texto)

/*
 * ─── O QUE ACONTECIA NO PORTÃO (Pontal Weekend, 25-26/09/2026) ─────────────
 *
 * 1. Entre ler o QR e a resposta chegar passavam segundos (a validação ia e
 *    voltava ~20 vezes entre a função e o banco) e a tela não mostrava NADA
 *    nesse meio-tempo. O operador achava que não tinha lido.
 * 2. Quando o resultado sumia (2,5 s), o scanner voltava a ler — e o mesmo QR
 *    continuava na frente da câmera. Segunda validação, 6 a 12 s depois da
 *    primeira, com outro resultado ("acabou de registrar", ou pior: uma
 *    entrada nova logo depois da saída). Está nos registros daquela noite.
 * 3. A câmera seguia decodificando quadros enquanto esperava o servidor e
 *    enquanto o resultado estava na tela — a noite toda.
 *
 * Agora: a leitura PAUSA a câmera e mostra "Validando acesso..." na hora; a
 * resposta vira uma tela clara (liberado / já validado / negado / inválido);
 * sem resposta em `TEMPO_SEM_RESPOSTA_MS`, a tela DIZ isso; e o mesmo QR lido
 * de novo logo em seguida não vai mais ao servidor — só um aviso discreto.
 */

/** Sem resposta até aqui, a tela avisa — em vez de ficar parada. */
const TEMPO_SEM_RESPOSTA_MS = 10_000

/**
 * O mesmo QR, dentro deste tempo depois do resultado, não é validado de novo:
 * é o QR que continuou na frente da câmera. O servidor já recusa a saída nos
 * 5 min seguintes à entrada (`CARENCIA_SAIDA_MIN`), então 15 s aqui não tira
 * nenhuma leitura legítima.
 */
const REPETIDO_MS = 15_000

/*
 * ENTRADA / SAÍDA escolhidos pelo operador — de volta a pedido do Juan
 * (26/09/2026): quem sai e volta no mesmo dia precisa de entrada, saída,
 * entrada, saída, e quem decide é quem está no portão. O modo fica guardado
 * no aparelho (recarregar a tela não volta pro outro). Escolher o botão
 * errado não grava nada errado: o servidor avisa ("Entrada já registrada",
 * "não tem entrada — use ENTRADA") — ver `inferirMomentoQR`.
 */
type Modo = 'entrada' | 'fim'
const CHAVE_MODO = 'credenciei:scanner-modo'
const semAssinatura = () => () => {}
const lerModoSalvo = (): string | null => {
  try { return localStorage.getItem(CHAVE_MODO) } catch { return null }
}

/*
 * ÁREA DE ATUAÇÃO (Vital, 01/10/2026) — "várias portarias trabalhando ao
 * mesmo tempo no mesmo evento, cada uma lendo só determinadas áreas"
 * (Arquibancada, Camarote...). Ao contrário do MODO (entrada/saída), que é
 * da pessoa que está ali agora, a área é do APARELHO/PORTÃO — fica salva
 * neste navegador, por evento, pra não perguntar de novo a cada turno.
 * Guardado como JSON cru (string) de propósito: `useSyncExternalStore`
 * precisa que a mesma leitura devolva o mesmo valor (Object.is) quando nada
 * mudou — um array novo a cada leitura quebraria isso; uma string não.
 */
const CHAVE_AREAS = 'credenciei:scanner-areas'
const lerAreasSalvasRaw = (): string => {
  try { return localStorage.getItem(CHAVE_AREAS) ?? '{}' } catch { return '{}' }
}
const areasDoEvento = (raw: string, eventoId: string): string[] => {
  try {
    const todas = JSON.parse(raw) as Record<string, string[]>
    return Array.isArray(todas[eventoId]) ? todas[eventoId] : []
  } catch { return [] }
}
const salvarAreasDoEvento = (eventoId: string, ids: string[]) => {
  try {
    const todas = JSON.parse(lerAreasSalvasRaw()) as Record<string, string[]>
    todas[eventoId] = ids
    localStorage.setItem(CHAVE_AREAS, JSON.stringify(todas))
  } catch { /* aba anônima */ }
}

// O html5-qrcode rejeita às vezes com Error, às vezes com string
// ("Error getting userMedia, error = NotReadableError: ...") — lê os dois.
const textoDoErro = (e: unknown): string => {
  const x = e as { name?: string; message?: string } | null
  return `${x?.name ?? ''} ${x?.message ?? ''} ${typeof e === 'string' ? e : ''}`.trim()
}
const ehPermissaoNegada = (e: unknown) => /NotAllowed|Permission ?denied|PermissionDenied|SecurityError/i.test(textoDoErro(e))
const ehTraseira = (rotulo: string) => /back|rear|traseira|environment|trás/i.test(rotulo ?? '')
const codigoDoErro = (e: unknown): string =>
  textoDoErro(e).match(/(NotAllowed|NotReadable|NotFound|Overconstrained|Abort|Security|TrackStart)\w*/)?.[0]
  ?? (textoDoErro(e).slice(0, 60) || 'desconhecido')

/** O que fazer, pela CAUSA do erro — antes era sempre "permita a câmera". */
function mensagemDoErroDeCamera(e: unknown): string {
  const t = textoDoErro(e)
  if (ehPermissaoNegada(e)) {
    return 'A câmera está bloqueada. Toque no cadeado ao lado do endereço e permita a câmera. Se já estiver permitida, confira no Android: Configurações → Apps → Chrome → Permissões → Câmera → Permitir. Depois recarregue a página.'
  }
  if (/NotReadable|Could not start|TrackStart|Abort|in use|Concurrent/i.test(t)) {
    return 'A câmera está sendo usada por outro aplicativo ou outra aba. Feche as outras abas do navegador (principalmente outras do Credenciei) e apps de câmera, vídeo ou chamada, e toque em "Tentar de novo".'
  }
  if (/NotFound|DevicesNotFound|Overconstrained|no camera/i.test(t)) {
    return 'Não encontramos uma câmera disponível neste aparelho. Feche outros apps que usem a câmera e toque em "Tentar de novo" — ou use outro celular.'
  }
  return 'Não conseguimos abrir a câmera. Feche as outras abas e apps que usem câmera, confira se a câmera está permitida para este site e toque em "Tentar de novo".'
}

type Categoria = 'liberado' | 'saida' | 'jaValidado' | 'semEntrada' | 'localImpreciso' | 'semLocalizacao' | 'foraDoLocal' | 'areaErrada' | 'diaNaoAutorizado' | 'setorLotado' | 'negado' | 'invalido' | 'semResposta' | 'guardado'

function categoriaDo(r: ScanResult): Categoria {
  if (r.guardado) return 'guardado'
  if (r.semResposta) return 'semResposta'
  if (r.jaRegistrado) return 'jaValidado'
  if (r.success) return r.veiculo || r.momento !== 'fim' ? 'liberado' : 'saida'
  if (r.semEntrada && r.funcionarioId) return 'semEntrada'
  if (r.localImpreciso) return 'localImpreciso'
  if (r.semLocalizacao) return 'semLocalizacao'
  if (r.foraDoLocal) return 'foraDoLocal'
  if (r.areaErrada) return 'areaErrada'
  if (r.diaNaoAutorizado) return 'diaNaoAutorizado'
  if (r.setorLotado) return 'setorLotado'
  return r.qrInvalido ? 'invalido' : 'negado'
}

const VISUAL: Record<Categoria, { fundo: string; icone: string; titulo: string }> = {
  liberado:    { fundo: 'bg-green-600', icone: '✓', titulo: 'ACESSO LIBERADO' },
  // Entrada verde, saída AZUL — cores bem diferentes pro operador não
  // confundir o que acabou de fazer (pedido do Juan, 26/09/2026).
  saida:       { fundo: 'bg-blue-600', icone: '↩', titulo: 'SAÍDA REGISTRADA' },
  jaValidado:  { fundo: 'bg-amber-600', icone: '⚠', titulo: 'JÁ VALIDADO' },
  // Não é recusa de acesso: falta a ENTRADA dela no sistema — o operador informa a hora e a saída sai junto (19/10/2026).
  semEntrada:  { fundo: 'bg-orange-600', icone: '⏱', titulo: 'SEM ENTRADA REGISTRADA' },
  // Laranja, nem vermelho nem âmbar: a credencial é válida, só não é desta
  // portaria — bem diferente de "já validado" e de "negado" (Vital, 01/10/2026).
  // Vermelho de verdade: a batida NÃO é gravada (pedido do Juan, 08/10/2026 — antes só marcava; testou o
  // próprio QR fora do estádio e passou direto, sem aviso nenhum).
  localImpreciso: { fundo: 'bg-amber-600', icone: '📡', titulo: 'LOCALIZAÇÃO IMPRECISA' },
  semLocalizacao: { fundo: 'bg-amber-600', icone: '📡', titulo: 'SEM LOCALIZAÇÃO' },
  foraDoLocal: { fundo: 'bg-red-700', icone: '📍', titulo: 'FORA DO LOCAL DO EVENTO' },
  areaErrada:  { fundo: 'bg-orange-600', icone: '⊘', titulo: 'ÁREA DIFERENTE' },
  // Vermelho, é recusa de verdade — mas com título próprio: a credencial é
  // válida, o problema é a ESCALA de hoje, e quem resolve é o supervisor.
  diaNaoAutorizado: { fundo: 'bg-red-600', icone: '📅', titulo: 'DIA NÃO AUTORIZADO' },
  // Vermelho e título direto: a pessoa é válida, mas o setor encheu — o
  // operador precisa entender de relance que NÃO é pra deixar entrar.
  setorLotado: { fundo: 'bg-red-600', icone: '⛔', titulo: 'SETOR LOTADO — NÃO LIBERAR' },
  negado:      { fundo: 'bg-red-600',   icone: '✕', titulo: 'ACESSO NEGADO' },
  invalido:    { fundo: 'bg-red-600',   icone: '✕', titulo: 'QR CODE INVÁLIDO' },
  semResposta: { fundo: 'bg-amber-600', icone: '⏳', titulo: 'SEM RESPOSTA AINDA' },
  // Sem internet: guardada no aparelho — cor própria, nem verde (não foi conferida ainda) nem vermelho.
  guardado:    { fundo: 'bg-teal-700', icone: '📦', titulo: 'GUARDADA SEM INTERNET' },
}

/*
 * Retorno que o operador SENTE, não só vê: vibração e um bipe curto. Quem está
 * no portão olha para a pessoa, não para a tela. O navegador só libera som e
 * vibração depois do primeiro toque na página — até lá, fica só o visual.
 */
let audio: AudioContext | null = null
function prepararSom() {
  if (typeof window === 'undefined' || audio) return
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (Ctx) audio = new Ctx()
  } catch { /* sem áudio neste aparelho */ }
}
function bipe(frequencias: number[], duracaoS = 0.12) {
  try {
    if (!audio) return
    if (audio.state === 'suspended') void audio.resume()
    frequencias.forEach((f, i) => {
      const osc = audio!.createOscillator()
      const vol = audio!.createGain()
      osc.frequency.value = f
      vol.gain.value = 0.15
      osc.connect(vol).connect(audio!.destination)
      const t = audio!.currentTime + i * (duracaoS + 0.04)
      osc.start(t)
      osc.stop(t + duracaoS)
    })
  } catch { /* som é bônus */ }
}
function vibrar(padrao: number | number[]) {
  try { navigator.vibrate?.(padrao) } catch { /* nem todo aparelho vibra */ }
}
function sinalizar(c: Categoria) {
  if (c === 'liberado' || c === 'saida' || c === 'guardado') { vibrar(80); bipe([880]) }
  else if (c === 'jaValidado' || c === 'semResposta' || c === 'semEntrada') { vibrar([60, 60, 60]); bipe([660, 660]) }
  else { vibrar([200, 80, 200]); bipe([220], 0.35) }
}

export default function ScannerView({
  eventos,
  initialEventoId,
  noPainel = false,
  subeventosPorEvento = {},
  aoTrocarEvento,
}: {
  eventos: Evento[]
  initialEventoId?: string
  /** Dentro do painel (/admin/scanner), que tem tema claro e escuro — o
   *  seletor usa o estilo do painel em vez do fixo da tela preta do portão. */
  noPainel?: boolean
  /** Subeventos de cada evento (Vital, 30/09/2026) — vazio/ausente = evento sem subeventos. */
  subeventosPorEvento?: Record<string, { id: string; nome: string }[]>
  /**
   * Abre o modal "Qual evento você vai trabalhar?" lá no `ScannerRouter`
   * pai — que agora é o único dono de QUAL evento está ativo (01/10/2026).
   * Antes esta tela tinha seu próprio `<select>` de evento, e trocar aqui
   * dentro não avisava ninguém: o leitor (QR/rosto) ficava preso ao
   * método do evento errado, e a pergunta de área podia aparecer precoce,
   * antes de o operador sequer ter escolhido o evento de verdade.
   */
  aoTrocarEvento?: () => void
}) {
  // O `ScannerRouter` pai remonta este componente (via `key`) toda vez que
  // o evento muda — então `eventoId` É o evento ativo, não só um palpite
  // inicial. Mantido como estado (não como const) só porque o resto do
  // arquivo já lê/escreve nele; na prática nunca muda durante esta instância.
  const [eventoId] = useState(initialEventoId ?? eventos[0]?.id ?? '')
  const subeventosDoEvento = subeventosPorEvento[eventoId] ?? []
  // Sem internet, a leitura fica guardada no aparelho e sobe sozinha depois (Juan, 18/10/2026) — ver lib/fila-offline.ts.
  const fila = useFilaSemInternet(eventoId)
  // Localização do aparelho do operador: obrigatória, vai junto em cada leitura (ver components/LocalizacaoOperador).
  const localizacao = useLocalizacaoOperador()

  /*
   * "Qual área você vai atuar?" (Vital, 01/10/2026) — multi-seleção, salva
   * NO APARELHO por evento (ao contrário da 1ª versão, que era um <select>
   * de UM subevento só e não ficava salva — pedido explícito do Juan: "essa
   * configuração deve permanecer salva para aquele dispositivo/scanner").
   * `areasOverride` é a escolha feita NESTA sessão, que tem prioridade sobre
   * o que está salvo (evita esperar o próximo render pra refletir o clique).
   */
  const areasSalvasRaw = useSyncExternalStore(semAssinatura, lerAreasSalvasRaw, () => '{}')
  const [areasOverride, setAreasOverride] = useState<string[] | null>(null)
  // Sem subeventos neste leitor (seleção de área desligada na organização), áreas guardadas de antes não valem.
  const subeventoIds = subeventosDoEvento.length ? (areasOverride ?? areasDoEvento(areasSalvasRaw, eventoId)) : []
  const subeventoIdsRef = useRef<string[]>([])
  useEffect(() => { subeventoIdsRef.current = subeventoIds }, [subeventoIds])
  const confirmarAreas = (ids: string[]) => {
    salvarAreasDoEvento(eventoId, ids)
    setAreasOverride(ids)
  }
  // Pede a configuração sempre que o evento tem área e nenhuma foi escolhida
  // ainda neste aparelho; "Alterar" (abaixo) reabre por escolha do operador.
  const [configurandoArea, setConfigurandoArea] = useState(false)
  const precisaConfigurarArea = !!subeventosDoEvento.length && subeventoIds.length === 0
  // `processQR` só é recriado na câmera uma vez, no mount (ver `useEffect`
  // abaixo) — sem este ref ele travaria pra sempre no valor do 1º render.
  const precisaConfigurarAreaRef = useRef(precisaConfigurarArea)
  useEffect(() => { precisaConfigurarAreaRef.current = precisaConfigurarArea }, [precisaConfigurarArea])
  const mostrarConfigArea = precisaConfigurarArea || configurandoArea
  // Começa vazio — é exatamente o que vale na 1ª vez (`precisaConfigurarArea`
  // = ninguém escolheu nada ainda). Reabrir pra EDITAR uma área já salva
  // ("Alterar", no botão abaixo) é que precisa copiar `subeventoIds` pro
  // rascunho — e isso é feito ali mesmo, no clique, não aqui num efeito.
  const [rascunhoAreas, setRascunhoAreas] = useState<string[]>([])
  // O modo salvo vem do aparelho sem piscar a tela (mesmo padrão do menu).
  const modoSalvo = useSyncExternalStore(semAssinatura, lerModoSalvo, () => null)
  const [modoEscolhido, setModoEscolhido] = useState<Modo | null>(null)
  const modo: Modo = modoEscolhido ?? (modoSalvo === 'fim' ? 'fim' : 'entrada')
  const escolherModo = (m: Modo) => {
    setModoEscolhido(m)
    try { localStorage.setItem(CHAVE_MODO, m) } catch { /* aba anônima */ }
  }
  const [result, setResult] = useState<ScanResult | null>(null)
  const [validando, setValidando] = useState(false)
  // A prévia esperando SALVAR / CANCELAR.
  const [confirmacao, setConfirmacao] = useState<{ codigo: string; modo: Modo; r: ScanResult } | null>(null)
  const [salvando, setSalvando] = useState(false)
  /*
   * Saída SEM INTERNET de quem não bateu a entrada (Juan, 19/10/2026): o operador pergunta a hora e informa aqui; a
   * entrada vai para a fila junto com a saída (lançada à mão, com o nome dele) e sobe quando a internet voltar.
   */
  const [informandoEntrada, setInformandoEntrada] = useState(false)
  const [horaEntrada, setHoraEntrada] = useState('')
  // O modal da hora da entrada, COM internet (tela "sem entrada registrada"): o operador informa e entrada + saída saem juntas.
  const [modalEntrada, setModalEntrada] = useState<{ codigo: string; nome: string; funcionarioId: string } | null>(null)
  const [horaDoModal, setHoraDoModal] = useState('')
  const [gravandoModal, setGravandoModal] = useState(false)
  // Motivo do atraso — só aparece quando a prévia pede (fornecedor com meio ligado).
  const [justificativaAtraso, setJustificativaAtraso] = useState('')
  const [conferindo, setConferindo] = useState(false)
  // Aviso discreto abaixo da câmera: o mesmo QR lido de novo logo em seguida.
  const [repetido, setRepetido] = useState<string | null>(null)
  // A câmera não abriu. Sem isto, quem opera o portão fica olhando um quadrado
  // preto sem saber o motivo — ver o comentário no `catch` do `start`.
  const [erroCamera, setErroCamera] = useState<string | null>(null)
  // O nome técnico do erro, pequeno na tela — é o que permite diagnosticar
  // por um print do celular do portão.
  const [codigoErroCamera, setCodigoErroCamera] = useState<string | null>(null)
  const [linkCopiado, setLinkCopiado] = useState(false)

  /** Uma validação por vez: enquanto houver uma em curso ou um resultado na tela, nada novo entra. */
  const ocupadoRef = useRef(false)
  /** Identifica a leitura da vez — uma resposta atrasada de uma leitura antiga não sobrescreve a atual. */
  const leituraRef = useRef(0)
  /** A leitura esperando o servidor — para "Seguir sem internet" saber o que guardar. */
  const pendenteRef = useRef<{ codigo: string; modo: Modo; etapa: 'previa' | 'salvar' } | null>(null)
  /** O último QR com resultado, pra não validar de novo o mesmo QR parado na frente da câmera. */
  const ultimoRef = useRef<{ codigo: string; modo: Modo; em: number; resumo: string } | null>(null)
  const modoRef = useRef<Modo>(modo)
  useEffect(() => { modoRef.current = modo }, [modo])
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repetidoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scannerRef = useRef<import('html5-qrcode').Html5Qrcode | null>(null)
  // Ref para o callback do scanner (que captura o estado do primeiro render).
  // Atualizada num efeito, não durante o render — o linter do React passou a
  // recusar escrever em `.current` no corpo do componente.
  const eventoIdRef = useRef(eventoId)
  useEffect(() => {
    eventoIdRef.current = eventoId
    ultimoRef.current = null // outro evento: o mesmo QR pode ter outro resultado
  }, [eventoId])

  // Som e vibração só depois de um toque (regra do navegador).
  useEffect(() => {
    const liberar = () => prepararSom()
    window.addEventListener('pointerdown', liberar, { once: true })
    return () => window.removeEventListener('pointerdown', liberar)
  }, [])

  /** Para de decodificar quadros (a imagem continua ao vivo). */
  const pausarLeitura = () => {
    try { scannerRef.current?.pause(false) } catch { /* já pausado ou ainda não começou */ }
  }
  const retomarLeitura = () => {
    try { scannerRef.current?.resume() } catch { /* não estava pausado */ }
  }

  /** Tira o resultado da tela e deixa o scanner pronto pro próximo QR. */
  const liberar = () => {
    if (temporizadorRef.current) { clearTimeout(temporizadorRef.current); temporizadorRef.current = null }
    // O "mesmo QR de novo" conta a partir de AGORA (o resultado ficou na tela
    // até o toque): o celular da pessoa ainda na frente da câmera não reabre.
    if (ultimoRef.current) ultimoRef.current = { ...ultimoRef.current, em: Date.now() }
    leituraRef.current++ // qualquer resposta atrasada ainda pendente deixa de valer
    setResult(null)
    setValidando(false)
    setConfirmacao(null)
    setSalvando(false)
    setConferindo(false)
    setJustificativaAtraso('')
    setInformandoEntrada(false)
    setHoraEntrada('')
    pendenteRef.current = null
    ocupadoRef.current = false
    retomarLeitura()
  }

  const mostrarResultado = (id: number, codigo: string, modoDaLeitura: Modo, r: ScanResult) => {
    if (id !== leituraRef.current) return // o operador já seguiu em frente
    const categoria = categoriaDo(r)
    setValidando(false)
    // "Sem resposta" aparece POR CIMA da confirmação (que continua lá embaixo);
    // qualquer resultado de verdade a encerra.
    if (categoria !== 'semResposta') setConfirmacao(null)
    setResult(r)
    sinalizar(categoria)

    // "Sem resposta" não é resultado: não trava o mesmo QR de ser lido de novo.
    if (categoria !== 'semResposta') {
      const quem = r.funcionario?.nome ?? r.veiculo?.placa ?? ''
      ultimoRef.current = {
        codigo, modo: modoDaLeitura, em: Date.now(),
        resumo: `${VISUAL[categoria].titulo}${quem ? ` — ${quem}` : ''}`,
      }
    }

    /*
     * O resultado NÃO some sozinho (pedido do Juan, 26/09/2026): fica na tela
     * até o operador tocar em "Ler o próximo". Sumir sozinho fazia o operador
     * perder o resultado quando olhava pra pessoa, e não pra tela.
     */
  }

  const semRede = (): ScanResult => {
    // A tela anota que o pedido não chegou: trocar para o Registrar ponto agora abre a cópia guardada, sem esperar.
    percebeuSemRede()
    return {
      success: false,
      semRede: true,
      message: 'Não foi possível validar agora. Confira a internet do aparelho e leia o QR de novo.',
    }
  }

  /*
   * SEM INTERNET (Juan, 18/10/2026). A leitura não para: a tela mostra quem é (pela lista do evento guardada no
   * aparelho), o operador confirma, e a batida fica GUARDADA com a hora da leitura. Quem a lista já sabe que não
   * pode entrar (baixa, pendente, negado) é recusado aqui mesmo; o resto o servidor confere quando a internet voltar.
   */
  const abrirSemInternet = async (id: number, codigo: string, modoDaLeitura: Modo) => {
    if (id !== leituraRef.current) return
    percebeuSemRede()
    if (ehQrDeVeiculo(codigo)) {
      mostrarResultado(id, codigo, modoDaLeitura, { success: false, message: 'Sem internet: o QR de veículo precisa de internet para ser conferido. Anote a placa e confira quando a internet voltar.' })
      return
    }
    if (!tokenDoQR(codigo)) {
      mostrarResultado(id, codigo, modoDaLeitura, { success: false, qrInvalido: true, message: 'QR Code fora do padrão. Peça para a pessoa abrir a credencial de novo e mostrar o código.' })
      return
    }
    const pessoa = await pessoaPeloQR(eventoIdRef.current, codigo).catch(() => null)
    if (id !== leituraRef.current) return
    const funcionario = pessoa ? { nome: pessoa.nome, cargo: pessoa.cargo, setor: pessoa.equipe } : undefined
    // O aparelho sabe se a pessoa já tem entrada: lista guardada (renovada de poucos em poucos minutos) + o que ele mesmo guardou.
    const situacaoEntrada: SituacaoDeEntrada | undefined = pessoa
      ? await situacaoDeEntrada(eventoIdRef.current, pessoa.id).catch((): SituacaoDeEntrada => ({ tipo: 'desconhecida' }))
      : undefined
    if (id !== leituraRef.current) return
    const impedimento = pessoa ? motivoDaSituacao(pessoa.situacao) : null
    if (impedimento) {
      mostrarResultado(id, codigo, modoDaLeitura, { success: false, funcionario, message: `${impedimento} (conferido na lista guardada no aparelho — sem internet.)` })
      return
    }
    setValidando(false)
    setResult(null)
    // Sem entrada na lista: a hora já abre para ser informada (o operador pode dizer que ela já entrou).
    setInformandoEntrada(modoDaLeitura === 'fim' && situacaoEntrada?.tipo === 'sem_entrada')
    setHoraEntrada('')
    setConfirmacao({
      codigo, modo: modoDaLeitura,
      r: {
        success: true, previa: true, offline: true, funcionario, pessoaId: pessoa?.id, situacaoEntrada,
        message: pessoa
          ? 'Sem internet: a batida fica guardada neste aparelho e sobe sozinha quando a internet voltar.'
          : 'Sem internet, e esta pessoa não está na lista guardada no aparelho (cadastro novo?). A batida fica guardada e é conferida quando a internet voltar.',
      },
    })
    vibrar(40)
  }

  /** Guarda a leitura confirmada no aparelho, com a hora certa (a do servidor) e a localização de agora. */
  const guardarLeitura = async (c: { codigo: string; modo: Modo; r: ScanResult }, horaDaEntrada?: string): Promise<boolean> => {
    try {
      const lidoEm = agoraCerto().toISOString()
      const nome = c.r.funcionario?.nome ?? null
      const equipe = c.r.funcionario?.setor ?? null
      const leitura = {
        id: idNovo(), eventoId: eventoIdRef.current, tipo: 'qr' as const, codigo: c.codigo, momento: c.modo,
        lidoEm, local: localizacao.atual(),
        subeventoIds: subeventoIdsRef.current.length ? subeventoIdsRef.current : undefined,
        nome, equipe, pessoaId: c.r.pessoaId ?? null,
      }
      // A entrada informada e a saída entram juntas na fila, ou nenhuma das duas.
      if (horaDaEntrada && c.r.pessoaId) {
        await guardarNaFilaJuntos([
          entradaInformadaParaSaida({ eventoId: eventoIdRef.current, pessoaId: c.r.pessoaId, nome, equipe, hora: horaDaEntrada, saidaLidaEm: lidoEm, via: 'qr' }),
          leitura,
        ])
      } else {
        await guardarNaFila(leitura)
      }
      return true
    } catch {
      return false
    }
  }

  const mostrarGuardada = async (id: number, c: { codigo: string; modo: Modo; r: ScanResult }, motivo: string, horaDaEntrada?: string) => {
    const ok = await guardarLeitura(c, horaDaEntrada)
    setConfirmacao(null)
    setInformandoEntrada(false)
    setHoraEntrada('')
    mostrarResultado(id, c.codigo, c.modo, ok
      ? { success: true, guardado: true, momento: c.modo, funcionario: c.r.funcionario, message: motivo }
      : { success: false, message: 'Sem internet e não foi possível guardar neste aparelho (navegador em modo anônimo?). Use o Registrar ponto quando a internet voltar.' })
  }

  /** "Seguir sem internet" na tela de "sem resposta": desiste de esperar e guarda (ou abre a confirmação sem internet). */
  const seguirSemInternet = () => {
    const p = pendenteRef.current
    if (!p) return liberar()
    const id = ++leituraRef.current // a resposta atrasada, se chegar, não vale mais
    setResult(null)
    setSalvando(false)
    if (p.etapa === 'salvar' && confirmacao) {
      void mostrarGuardada(id, confirmacao, 'A internet não respondeu: a batida ficou guardada neste aparelho e sobe sozinha quando a internet voltar.')
    } else {
      void abrirSemInternet(id, p.codigo, p.modo)
    }
  }

  /**
   * Espera a resposta; se demorar, a tela DIZ que ainda não chegou (e troca
   * pelo que chegar). Devolve `null` se o operador já seguiu em frente.
   */
  const aguardar = async (id: number, codigo: string, m: Modo, pedido: Promise<ScanResult>): Promise<ScanResult | null> => {
    const tempo = setTimeout(() => {
      mostrarResultado(id, codigo, m, {
        success: false,
        semResposta: true,
        message: 'A internet está lenta e a resposta ainda não chegou. NÃO leia de novo: o resultado aparece aqui assim que chegar. Se demorar muito, confira a pessoa em "Registrar ponto".',
      })
    }, TEMPO_SEM_RESPOSTA_MS)
    const r = await pedido
    clearTimeout(tempo)
    return id === leituraRef.current ? r : null
  }

  /*
   * CONFIRMAR ANTES DE GRAVAR (pedido do Juan, 26/09/2026): a leitura mostra
   * QUEM é e O QUE vai ser registrado (entrada / saída / volta), e só grava
   * quando o operador toca SALVAR. CANCELAR não grava nada (e fica no
   * histórico de leituras como cancelada). A confirmação refaz todas as
   * checagens no servidor — a prévia não é um passe livre.
   */
  const confirmar = async () => {
    const c = confirmacao
    if (!c || salvando) return
    if (c.r.precisaJustificativaAtraso && justificativaAtraso.trim().length < 5) return
    if (c.r.offline && informandoEntrada && !horaDeEntradaValida(horaEntrada)) return
    const id = ++leituraRef.current
    // Prévia sem internet: SALVAR guarda no aparelho.
    if (c.r.offline) {
      // Saída de quem não bateu a entrada: a hora informada vai junto (precisa ser uma hora válida).
      const horaDaEntrada = informandoEntrada && c.modo === 'fim' && c.r.pessoaId ? horaEntrada : undefined
      await mostrarGuardada(
        id, c,
        horaDaEntrada
          ? `Entrada às ${horaDaEntrada} (informada) e saída guardadas neste aparelho. Sobem juntas quando a internet voltar — não precisa ler de novo.`
          : 'Guardada neste aparelho. Sobe sozinha quando a internet voltar — não precisa ler de novo.',
        horaDaEntrada,
      )
      return
    }
    setSalvando(true)
    pendenteRef.current = { codigo: c.codigo, modo: c.modo, etapa: 'salvar' }
    const r = await aguardar(
      id, c.codigo, c.modo,
      registrarPresencaQR(eventoIdRef.current, c.codigo, c.modo, {
        local: localizacao.atual(),
        subeventoIds: subeventoIdsRef.current.length ? subeventoIdsRef.current : undefined,
        justificativaAtraso: c.r.precisaJustificativaAtraso ? justificativaAtraso.trim() : undefined,
      }).catch(semRede),
    )
    setSalvando(false)
    if (!r) return
    // A internet caiu entre a prévia e o SALVAR: guarda no aparelho (o operador já confirmou).
    if (r.semRede) {
      await mostrarGuardada(id, c, 'A internet caiu ao salvar: a batida ficou guardada neste aparelho e sobe sozinha quando a internet voltar.')
      return
    }
    setConfirmacao(null)
    // O aparelho anota a batida que acabou de ser feita aqui: se a internet cair, sabe que a pessoa já tem entrada (ou já saiu).
    if (r.success && !r.veiculo) void anotarBatidaPeloQR(eventoIdRef.current, c.codigo, c.modo)
    mostrarResultado(id, c.codigo, c.modo, r)
  }

  /*
   * "REGISTRAR A ENTRADA DELE" (tela "sem entrada registrada", com internet): lança a entrada na hora informada e
   * registra a saída, as duas pelo servidor de uma vez. Se a internet cair no meio, as duas ficam guardadas no aparelho.
   */
  const registrarEntradaESaida = async () => {
    const m = modalEntrada
    if (!m || gravandoModal || !horaDeEntradaValida(horaDoModal)) return
    const id = ++leituraRef.current
    setGravandoModal(true)
    const hora = horaDoModal
    const r: ScanResult = await registrarSaidaComEntradaInformada(eventoIdRef.current, m.codigo, hora, {
      local: localizacao.atual(),
      subeventoIds: subeventoIdsRef.current.length ? subeventoIdsRef.current : undefined,
    }).catch(semRede)
    setGravandoModal(false)
    if (r.semRede) {
      // A internet caiu: as duas batidas (entrada informada + saída) ficam na fila do aparelho.
      const guardada = await guardarLeitura(
        { codigo: m.codigo, modo: 'fim', r: { success: true, message: '', funcionario: { nome: m.nome, cargo: null }, pessoaId: m.funcionarioId } }, hora,
      )
      setModalEntrada(null)
      mostrarResultado(id, m.codigo, 'fim', guardada
        ? { success: true, guardado: true, momento: 'fim', funcionario: { nome: m.nome, cargo: null }, message: `Entrada às ${hora} (informada) e saída guardadas neste aparelho. Sobem juntas quando a internet voltar.` }
        : { success: false, message: 'Sem internet e não foi possível guardar neste aparelho. Registre pelo Registrar ponto quando a internet voltar.' })
      return
    }
    setModalEntrada(null)
    setHoraDoModal('')
    if (r.success) void anotarBatidaPeloQR(eventoIdRef.current, m.codigo, 'fim')
    mostrarResultado(id, m.codigo, 'fim', r)
  }

  const cancelar = () => {
    const c = confirmacao
    if (!c) return
    void cancelarLeituraQR(eventoIdRef.current, c.codigo, c.modo).catch(() => {})
    // O mesmo QR parado na frente da câmera não reabre a confirmação na hora.
    ultimoRef.current = {
      codigo: c.codigo, modo: c.modo, em: Date.now(),
      resumo: `CANCELADO${c.r.funcionario?.nome ? ` — ${c.r.funcionario.nome}` : ''}`,
    }
    liberar()
  }

  const processQR = async (bruto: string) => {
    const codigo = (bruto ?? '').trim()
    if (!codigo || ocupadoRef.current) return
    // Evento com áreas, mas este portão ainda não escolheu nenhuma: a tela de
    // configuração está cobrindo a câmera — não é pra validar nada ainda.
    if (precisaConfigurarAreaRef.current) return

    /*
     * O mesmo QR logo depois do resultado dele: é o celular da pessoa que
     * continuou na frente da câmera. Não valida de novo (era a segunda
     * validação que confundia o portão) — só avisa, sem cobrir a câmera.
     */
    // Trocar o botão (ENTRADA → SAÍDA) libera o mesmo QR na hora: foi escolha.
    const modoDaLeitura = modoRef.current
    const ultimo = ultimoRef.current
    if (ultimo && ultimo.codigo === codigo && ultimo.modo === modoDaLeitura && Date.now() - ultimo.em < REPETIDO_MS) {
      setRepetido(`Este QR acabou de ser lido: ${ultimo.resumo}. Aponte para o próximo.`)
      if (repetidoTimerRef.current) clearTimeout(repetidoTimerRef.current)
      repetidoTimerRef.current = setTimeout(() => setRepetido(null), 3000)
      return
    }

    ocupadoRef.current = true
    pausarLeitura()
    const id = ++leituraRef.current
    setRepetido(null)
    setResult(null)
    setConfirmacao(null)
    setValidando(true) // "Validando..." aparece NA HORA
    vibrar(30)

    // Veículo não tem entrada/saída nem confirmação: vai direto.
    if (ehQrDeVeiculo(codigo)) {
      const r = await aguardar(id, codigo, modoDaLeitura, conferirVeiculoPorQR(eventoIdRef.current, codigo).catch(semRede))
      if (r) mostrarResultado(id, codigo, modoDaLeitura, r)
      return
    }

    // Aparelho sabidamente sem internet: nem tenta — vai direto para a confirmação sem internet.
    if (navigator.onLine === false) {
      await abrirSemInternet(id, codigo, modoDaLeitura)
      return
    }

    // Primeiro a PRÉVIA (nada é gravado); o operador confirma na tela.
    pendenteRef.current = { codigo, modo: modoDaLeitura, etapa: 'previa' }
    const previa = await aguardar(
      id, codigo, modoDaLeitura,
      registrarPresencaQR(eventoIdRef.current, codigo, modoDaLeitura, {
        apenasConferir: true,
        local: localizacao.atual(),
        subeventoIds: subeventoIdsRef.current.length ? subeventoIdsRef.current : undefined,
      }).catch(semRede),
    )
    if (!previa) return
    // O pedido não chegou ao servidor: segue sem internet.
    if (previa.semRede) {
      await abrirSemInternet(id, codigo, modoDaLeitura)
      return
    }
    if (previa.previa) {
      setResult(null)
      setValidando(false)
      setConfirmacao({ codigo, modo: modoDaLeitura, r: previa })
      vibrar(40)
      return
    }
    // Recusa, "já registrado", QR inválido: mostra direto — não há o que confirmar.
    mostrarResultado(id, codigo, modoDaLeitura, previa)
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    let desmontou = false

    import('html5-qrcode').then(async ({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
      if (desmontou) return
      /*
       * Só QR, sem espelhar (26/09/2026). Sem `formatsToSupport` a biblioteca
       * procurava TODOS os formatos (códigos de barras de produto inclusive)
       * em cada quadro; e sem `disableFlip`, todo quadro sem código — quase
       * todos, enquanto se mira — era decodificado DE NOVO espelhado. A câmera
       * traseira não espelha o QR: era trabalho dobrado a troco de nada, e
       * pesa em celular simples esquentado depois de horas de portão.
       */
      const config = {
        fps: 15,
        // Até 300 px, mas nunca maior que 85% da imagem (tela pequena).
        qrbox: (largura: number, altura: number) => {
          const lado = Math.max(120, Math.min(300, Math.floor(Math.min(largura, altura) * 0.85)))
          return { width: lado, height: lado }
        },
        disableFlip: true,
      }

      // Uma instância nova por tentativa: depois de um `start` que falhou, a
      // mesma instância nem sempre aceita começar de novo.
      const tentar = async (camera: string | MediaTrackConstraints) => {
        const leitor = new Html5Qrcode('qr-reader', {
          verbose: false,
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          // Leitor nativo do aparelho (Android/Chrome) quando existir — bem
          // mais rápido que o de JavaScript. Onde não existe, cai no outro.
          useBarCodeDetectorIfSupported: true,
        })
        scannerRef.current = leitor
        try {
          await leitor.start(camera, config, (texto: string) => { void processQR(texto) }, () => {})
        } catch (e) {
          try { leitor.clear() } catch { /* nada pra limpar */ }
          throw e
        }
        // Foco contínuo quando o aparelho deixa escolher — sem isso, alguns
        // Android travam o foco longe e o QR na mão fica borrado.
        try {
          await leitor.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] })
        } catch { /* nem todo aparelho aceita — segue com o padrão */ }
      }

      /*
       * Primeiro a câmera traseira; se não abrir, CADA câmera do aparelho.
       *
       * Portão do Pontal Weekend (25/09/2026): câmera permitida e mesmo assim
       * "a câmera não abriu" — e a tela só sabia dizer "permita a câmera",
       * então ninguém sabia o que fazer e a entrada virou lançamento manual.
       * O pedido genérico de câmera traseira falha em alguns Android (outra
       * lente, câmera ocupada por outra aba); pedir pelo id de cada câmera
       * costuma resolver sozinho. Permissão negada não adianta insistir.
       */
      let ultimoErro: unknown = null
      try { await tentar({ facingMode: 'environment' }); return } catch (e) { ultimoErro = e }

      if (!ehPermissaoNegada(ultimoErro)) {
        try {
          const cameras = await Html5Qrcode.getCameras()
          const traseiraPrimeiro = [...cameras].sort((a, b) => Number(ehTraseira(b.label)) - Number(ehTraseira(a.label)))
          for (const c of traseiraPrimeiro) {
            if (desmontou) return
            try { await tentar(c.id); return } catch (e) { ultimoErro = e }
          }
        } catch (e) { ultimoErro = e }
      }

      if (desmontou) return
      console.error(ultimoErro)
      setErroCamera(emNavegadorEmbutido()
        ? 'Você abriu por dentro de outro aplicativo (WhatsApp, Instagram), e por ali a câmera não funciona. Toque em "Copiar link", abra o Chrome ou o Safari e cole lá.'
        : mensagemDoErroDeCamera(ultimoErro))
      setCodigoErroCamera(codigoDoErro(ultimoErro))
    })

    return () => {
      desmontou = true
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current)
      if (repetidoTimerRef.current) clearTimeout(repetidoTimerRef.current)
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(() => {})
      }
    }
    // O scanner nasce uma vez; o resto do estado chega por refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const categoria = result ? categoriaDo(result) : null
  const visual = categoria ? VISUAL[categoria] : null

  return (
    <div className="flex-1 flex flex-col items-center p-4 gap-5">
      <ModoSemInternet eventoId={eventoId} />
      {localizacao.bloqueado && <BloqueioSemLocalizacao estado={localizacao.estado} onTentar={localizacao.tentarDeNovo} />}
      <div className="w-full max-w-sm space-y-3">
        {/*
          * Evento — escolhido lá no "Qual evento você vai trabalhar?" do
          * `ScannerRouter`, não aqui (01/10/2026). Aqui é só o resumo +
          * "Trocar" (quando há mais de um evento pra escolher).
          */}
        <div
          data-tutorial="scan-evento"
          className={noPainel ? 'input w-full flex items-center justify-between gap-2' : 'w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 flex items-center justify-between gap-2'}
        >
          <div className="min-w-0">
            <p className={`text-2xs ${noPainel ? 'text-slate-400' : 'text-white/50'}`}>Evento</p>
            <p className={`text-sm font-semibold truncate ${noPainel ? 'text-slate-800' : 'text-white'}`}>
              {eventos.find(e => e.id === eventoId)?.nome ?? '—'}
            </p>
          </div>
          {eventos.length > 1 && aoTrocarEvento && (
            <button
              type="button"
              onClick={aoTrocarEvento}
              className="shrink-0 text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors"
            >
              Trocar
            </button>
          )}
        </div>

        {/*
          * Área de atuação deste portão (Vital, 01/10/2026) — várias
          * portarias lendo cada uma só determinadas áreas do mesmo evento.
          * Só aparece em evento com subevento cadastrado; sem isso, ~99% dos
          * eventos nem veem este campo. A configuração em si (checkboxes)
          * mora no overlay `mostrarConfigArea`, mais abaixo — aqui é só o
          * resumo + o botão pra reabrir.
          */}
        {!!subeventosDoEvento.length && !mostrarConfigArea && (
          <div className={noPainel ? 'input w-full flex items-center justify-between gap-2' : 'w-full bg-[#161b22] border border-[#30363d] rounded-lg px-3 py-2 flex items-center justify-between gap-2'}>
            <div className="min-w-0">
              <p className={`text-2xs ${noPainel ? 'text-slate-400' : 'text-white/50'}`}>Área de atuação deste portão</p>
              <p className={`text-sm font-semibold truncate ${noPainel ? 'text-slate-800' : 'text-white'}`}>
                {subeventosDoEvento.filter(s => subeventoIds.includes(s.id)).map(s => s.nome).join(' + ')}
              </p>
            </div>
            <button
              type="button"
              onClick={() => { setRascunhoAreas(subeventoIds); setConfigurandoArea(true) }}
              className="shrink-0 text-xs font-semibold text-brand-400 hover:text-brand-300 transition-colors"
            >
              Alterar
            </button>
          </div>
        )}

        {/* ENTRADA / SAÍDA — o operador escolhe (de volta em 26/09/2026). */}
        <div className="grid grid-cols-2 gap-2" data-tutorial="scan-modo" role="radiogroup" aria-label="Registrar">
          <button
            type="button"
            role="radio"
            aria-checked={modo === 'entrada'}
            onClick={() => escolherModo('entrada')}
            className={`rounded-xl py-3.5 font-extrabold text-base tracking-wide transition-all active:scale-95 ${
              modo === 'entrada'
                ? 'bg-green-600 text-white shadow-lg ring-2 ring-green-300'
                /*
                 * `border-slate-600 text-slate-400` só fica legível dentro
                 * do painel (`noPainel`, tema normal) — no `/scan` cheio,
                 * fundo sempre escuro (`bg-[#161b22]`, nunca participa do
                 * tema), slate-400 vira quase preto no tema claro e some
                 * sobre o preto (achado do Juan, 02/10/2026: "o de entrar
                 * fica preto"). Mesmo remédio já usado no resto deste
                 * arquivo pro mesmo motivo — branco translúcido, que não
                 * depende de tema nenhum.
                 */
                : noPainel ? 'border-2 border-slate-600 text-slate-400' : 'border-2 border-white/30 text-white/70'
            }`}
          >
            ENTRADA
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={modo === 'fim'}
            onClick={() => escolherModo('fim')}
            className={`rounded-xl py-3.5 font-extrabold text-base tracking-wide transition-all active:scale-95 ${
              modo === 'fim'
                ? 'bg-blue-600 text-white shadow-lg ring-2 ring-blue-300'
                : noPainel ? 'border-2 border-slate-600 text-slate-400' : 'border-2 border-white/30 text-white/70'
            }`}
          >
            SAÍDA
          </button>
        </div>
        <p className={`text-xs text-center ${noPainel ? 'text-slate-500' : 'text-white/50'}`}>
          Registrando <strong className={modo === 'entrada' ? 'text-green-500' : 'text-blue-400'}>{modo === 'entrada' ? 'ENTRADAS' : 'SAÍDAS'}</strong>.
          Quem saiu e está voltando: use ENTRADA — a saída fica no histórico como pausa.
          O <strong>meio</strong> continua sendo registrado pelo próprio funcionário, com foto, na credencial dele.
        </p>
        <AvisoFilaSemInternet estado={fila} />
      </div>

      {/*
        * A câmera falhou: explica e oferece a saída, em vez do quadrado preto.
        *
        * Fica NO LUGAR do leitor, não abaixo dele — embaixo, com a moldura
        * vazia ainda na tela, quem está no portão continua tentando apontar o
        * celular pro nada.
        */}
      {erroCamera ? (
        <div className="w-full max-w-sm bg-red-950/40 border border-red-800 rounded-xl p-4 text-center">
          <CameraOff className="w-8 h-8 text-red-400 mx-auto" />
          <p className="text-red-200 font-semibold text-sm mt-2">A câmera não abriu</p>
          <p className="text-red-300/90 text-xs mt-1.5 leading-relaxed">{erroCamera}</p>
          {codigoErroCamera && <p className="text-red-400/60 text-2xs mt-1.5 font-mono">Código: {codigoErroCamera}</p>}
          <div className="flex flex-col gap-2 mt-3">
            <button
              onClick={async () => {
                if (await copiarTexto(window.location.href)) {
                  setLinkCopiado(true)
                  setTimeout(() => setLinkCopiado(false), 5000)
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-white bg-red-600 hover:bg-red-500 active:scale-95 transition-all px-3 py-2 rounded-lg"
            >
              {linkCopiado ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {linkCopiado ? 'Link copiado!' : 'Copiar link'}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="text-red-300 text-xs font-semibold hover:text-white transition-colors"
            >
              Tentar de novo
            </button>
          </div>
          {/*
            * A saída que funciona mesmo sem câmera nenhuma: conferir pelo CPF.
            * Sem isto, quem está no portão com a câmera quebrada não tem o que
            * fazer além de parar a fila.
            */}
          <button
            onClick={() => setConferindo(true)}
            className="w-full mt-3 pt-3 border-t border-red-800/60 text-red-200 text-xs font-semibold hover:text-white transition-colors"
          >
            Conferir pelo CPF enquanto isso →
          </button>
        </div>
      ) : (
        <div className="relative w-full max-w-sm" data-tutorial="scan-camera">
          <div id="qr-reader" className="rounded-xl overflow-hidden" />
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            {/* A moldura segue o botão: verde entrada, azul saída — o
                operador vê o modo sem tirar o olho da câmera. */}
            <div className={`w-64 h-64 border-4 rounded-2xl opacity-70 ${modo === 'entrada' ? 'border-green-500' : 'border-blue-500'}`} />
          </div>
        </div>
      )}

      {!erroCamera && (
        repetido ? (
          <p className="w-full max-w-sm text-center text-amber-300 text-sm font-semibold bg-amber-500/15 border border-amber-500/40 rounded-lg px-3 py-2">
            {repetido}
          </p>
        ) : (
          <p className={`text-sm flex items-center gap-2 ${noPainel ? 'text-slate-500' : 'text-white/50'}`}>
            <ScanLine className="w-4 h-4" />
            Aponte a câmera para o QR da credencial ou do veículo
          </p>
        )
      )}

      {/*
        * "QUAL ÁREA VOCÊ VAI ATUAR?" (Vital, 01/10/2026) — antes de ler
        * qualquer QR, o portão escolhe uma ou mais áreas. Cobre a câmera
        * (que continua ligada por baixo, só não lê nada — ver o guard no
        * início de `processQR`) até confirmar; "Cancelar" só existe quando
        * já havia uma área salva (senão o operador ficaria sem jeito de
        * sair e nunca escanear nada).
        */}
      {/*
        * `bg-slate-900` sólido, não `/95` — este overlay é o PRIMEIRO
        * conteúdo da tela (não cobre uma câmera já escura por baixo).
        * Dentro do /admin/scanner (painel, fundo claro), os 5% de
        * transparência deixavam o título "Scanner" e o resto do painel
        * "vazando" por trás, um efeito fantasma feio (relatado pelo Juan,
        * 01/10/2026). As telas de confirmação/resultado abaixo continuam
        * com `/95` de propósito — essas sim cobrem a câmera, já escura.
        */}
      {mostrarConfigArea && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-slate-900 px-6" role="dialog" aria-modal="true" aria-label="Qual área você vai atuar?">
          <div className="w-full max-w-sm text-white">
            <p className="text-lg font-bold text-center">Qual área você vai atuar?</p>
            <p className="text-white/50 text-sm text-center mt-1.5">
              Selecione uma ou mais áreas. Este leitor só vai liberar entrada de ingressos destas áreas. A saída é livre.
            </p>
            <div className="mt-5 space-y-2 max-h-[45vh] overflow-y-auto">
              {subeventosDoEvento.map(s => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 cursor-pointer hover:bg-white/10 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={rascunhoAreas.includes(s.id)}
                    onChange={() => setRascunhoAreas(ids => ids.includes(s.id) ? ids.filter(x => x !== s.id) : [...ids, s.id])}
                    className="w-5 h-5 rounded border-white/30 accent-brand-500 shrink-0"
                  />
                  <span className="font-medium">{s.nome}</span>
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => { confirmarAreas(rascunhoAreas); setConfigurandoArea(false) }}
              disabled={!rascunhoAreas.length}
              className="mt-6 w-full rounded-2xl py-4 text-lg font-extrabold text-white bg-brand-500 disabled:opacity-40 active:scale-95 transition-all"
            >
              Confirmar e começar a escanear
            </button>
            {!!subeventoIds.length && (
              <button
                type="button"
                onClick={() => setConfigurandoArea(false)}
                className="mt-3 w-full text-center text-white/50 text-sm font-semibold hover:text-white transition-colors"
              >
                Cancelar
              </button>
            )}
          </div>
        </div>
      )}

      {/*
        * CONFIRMAÇÃO: quem é e o que vai ser registrado. SALVAR grava;
        * CANCELAR, logo abaixo, desiste sem gravar nada. Fundo escuro de
        * propósito — verde/azul cheio fica só pro resultado JÁ gravado.
        */}
      {confirmacao && (() => {
        const r = confirmacao.r
        const ehEntrada = confirmacao.modo === 'entrada'
        const cor = ehEntrada ? 'bg-green-600' : 'bg-blue-600'
        const acao = ehEntrada ? (r.volta ? 'VOLTA AO TRABALHO' : 'ENTRADA') : 'SAÍDA'
        return (
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 px-6" role="dialog" aria-modal="true" aria-label={`Confirmar ${acao}`}>
            <div className="w-full max-w-sm text-center text-white">
              {r.offline && (
                <p className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-amber-500 px-3 py-1 text-xs font-extrabold tracking-wide text-slate-900">
                  <CloudOff className="w-3.5 h-3.5" /> SEM INTERNET
                </p>
              )}
              <p className="text-sm font-semibold opacity-70">Confirme o registro</p>
              <span className={`inline-block mt-2 rounded-full px-5 py-2 text-lg font-extrabold tracking-wide ${cor}`}>
                {acao}
              </span>
              {r.funcionario && (
                <>
                  <p className="text-3xl font-extrabold mt-6 leading-tight">{r.funcionario.nome}</p>
                  <p className="text-base opacity-75 mt-1">
                    {[r.funcionario.cargo, r.funcionario.setor].filter(Boolean).join(' · ')}
                  </p>
                </>
              )}
              <p className="text-base mt-4 opacity-90 leading-snug">{r.message}</p>
              {r.aviso && (
                <p className="mt-4 rounded-xl bg-amber-400 text-slate-900 text-sm font-semibold px-3 py-2 leading-snug">⚠ {r.aviso}</p>
              )}

              {/*
                * SEM INTERNET: o aparelho diz se a pessoa já tem entrada (lista guardada, renovada de poucos em poucos
                * minutos, + o que ele mesmo guardou). Na SAÍDA de quem não tem, a hora da entrada já abre para ser
                * informada; o operador pode dizer que ela já entrou. O servidor confere tudo de novo quando a internet volta.
                *
                * CORES FIXAS (caixas sólidas, texto branco ou escuro): esta tela é escura nos dois temas e as cores do
                * Tailwind (red-100, green-100…) mudam com o tema — foi o que deixou o texto ilegível (Juan, 19/10/2026).
                */}
              {r.offline && r.pessoaId && r.situacaoEntrada && (() => {
                const sit = r.situacaoEntrada
                const conferido = sit.tipo !== 'desconhecida' && sit.conferidoEm ? `Conferido às ${formatarBR(sit.conferidoEm, 'hora')} na lista do aparelho.` : null
                const caixa = 'mt-5 rounded-2xl px-4 py-3 text-left'
                if (sit.tipo === 'com_entrada') {
                  return ehEntrada ? (
                    <div className={`${caixa} bg-[#f59e0b] text-[#111827]`}>
                      <p className="text-base font-extrabold leading-snug">⚠ Já tem entrada às {formatarBR(sit.em, 'hora')}</p>
                      <p className="mt-0.5 text-sm font-semibold leading-snug">Se a pessoa está saindo, volte e use SAÍDA.{conferido ? ` ${conferido}` : ''}</p>
                    </div>
                  ) : (
                    <div className={`${caixa} bg-[#15803d] text-white`}>
                      <p className="text-base font-extrabold leading-snug">✓ Entrada registrada às {formatarBR(sit.em, 'hora')}</p>
                      {conferido && <p className="mt-0.5 text-sm font-semibold leading-snug text-white/85">{conferido}</p>}
                    </div>
                  )
                }
                if (sit.tipo === 'ja_saiu') {
                  return ehEntrada ? null : (
                    <div className={`${caixa} bg-[#f59e0b] text-[#111827]`}>
                      <p className="text-base font-extrabold leading-snug">⚠ Saída já registrada às {formatarBR(sit.em, 'hora')}</p>
                      <p className="mt-0.5 text-sm font-semibold leading-snug">Esta pode ser uma saída repetida.{conferido ? ` ${conferido}` : ''}</p>
                    </div>
                  )
                }
                if (ehEntrada) return null
                const semEntrada = sit.tipo === 'sem_entrada'
                return (
                  <div className="mt-5 text-left">
                    {semEntrada && (
                      <div className="rounded-2xl bg-[#b91c1c] px-4 py-3 text-white">
                        <p className="text-base font-extrabold leading-snug">⚠ SEM ENTRADA REGISTRADA</p>
                        <p className="mt-0.5 text-sm font-semibold leading-snug text-white/90">{conferido ? `${conferido} ` : ''}Informe a hora em que a pessoa entrou.</p>
                      </div>
                    )}
                    {!informandoEntrada ? (
                      <button
                        type="button" onClick={() => setInformandoEntrada(true)}
                        className="mt-3 w-full rounded-2xl border-2 border-[#f59e0b] bg-[#f59e0b]/15 px-4 py-3 text-left text-base font-bold leading-snug text-[#fbbf24]"
                      >
                        A pessoa não bateu a entrada? Toque aqui para informar a hora →
                      </button>
                    ) : (
                      <div className="mt-4">
                        <label className="mb-2 block text-base font-bold text-white" htmlFor="hora-entrada-informada">
                          Que horas ela entrou? *
                        </label>
                        <CampoHoraDeEntrada id="hora-entrada-informada" valor={horaEntrada} aoMudar={setHoraEntrada} />
                        <p className="mt-2 text-sm leading-snug text-white/75">
                          A entrada fica marcada como lançada à mão, com o seu nome. A saída é guardada agora e as duas sobem juntas quando a internet voltar.
                        </p>
                        <button
                          type="button" onClick={() => { setInformandoEntrada(false); setHoraEntrada('') }}
                          className="mt-3 text-sm font-bold text-white underline underline-offset-4"
                        >
                          Ela já entrou — guardar só a saída
                        </button>
                      </div>
                    )}
                  </div>
                )
              })()}

              {r.precisaJustificativaAtraso && (
                <div className="mt-5 text-left">
                  <label className="text-white/80 text-sm font-semibold block mb-1.5">
                    Motivo do atraso *
                  </label>
                  <textarea
                    value={justificativaAtraso}
                    onChange={e => setJustificativaAtraso(e.target.value)}
                    placeholder="Ex: trânsito, ônibus atrasado..."
                    rows={2}
                    className="w-full rounded-xl px-3 py-2 text-sm bg-white/10 border border-white/30 text-white placeholder:text-white/40 outline-none focus:border-white/60"
                  />
                </div>
              )}

              <button
                type="button"
                onClick={confirmar}
                disabled={salvando || (r.precisaJustificativaAtraso && justificativaAtraso.trim().length < 5) || (informandoEntrada && !horaDeEntradaValida(horaEntrada))}
                className={`mt-8 w-full rounded-2xl py-5 text-xl font-extrabold text-white shadow-lg active:scale-95 transition-all disabled:opacity-50 ${cor}`}
              >
                {salvando
                  ? <span className="inline-flex items-center gap-2"><Loader2 className="w-6 h-6 animate-spin" /> Salvando...</span>
                  : !ehEntrada && r.offline && informandoEntrada && !horaDeEntradaValida(horaEntrada)
                    ? 'INFORME A HORA DA ENTRADA'
                    : `${r.offline ? 'GUARDAR' : 'SALVAR'} ${ehEntrada ? 'ENTRADA' : informandoEntrada && r.offline ? 'ENTRADA E SAÍDA' : 'SAÍDA'}`}
              </button>
              <button
                type="button"
                onClick={cancelar}
                disabled={salvando}
                className="mt-3 w-full rounded-2xl py-4 text-base font-bold text-white border-2 border-white/50 active:scale-95 transition-all disabled:opacity-50"
              >
                CANCELAR
              </button>
            </div>
          </div>
        )
      })()}

      {/* Validando: aparece no mesmo instante da leitura — a tela nunca fica parada. */}
      {validando && !result && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-900/95 text-white text-center px-8" role="status" aria-live="assertive">
          <Loader2 className="w-16 h-16 animate-spin mb-6" />
          <p className="text-3xl font-bold">Validando {modo === 'entrada' ? 'entrada' : 'saída'}...</p>
          <p className="text-base opacity-70 mt-3">QR lido. Aguarde a resposta — não precisa ler de novo.</p>
        </div>
      )}

      {/* Resultado: tela inteira, cor e título pelo tipo, e o detalhe do servidor embaixo. */}
      {result && visual && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center ${visual.fundo}`}
          role="alert"
          aria-live="assertive"
        >
          <div className="text-white text-center px-8 max-w-lg">
            <div className="text-8xl mb-4 leading-none">{visual.icone}</div>
            <p className="text-4xl font-extrabold tracking-tight">{visual.titulo}</p>
            {result.funcionario && (
              <>
                <p className="text-2xl font-semibold mt-5">{result.funcionario.nome}</p>
                {result.funcionario.cargo && <p className="text-base opacity-75 mt-1">{result.funcionario.cargo}</p>}
              </>
            )}
            {result.veiculo && (
              <>
                <p className="text-2xl font-semibold mt-5 font-mono">{result.veiculo.placa}</p>
                <p className="text-base opacity-75 mt-1">
                  {result.veiculo.modelo} • {result.veiculo.condutorNome}
                </p>
                {result.veiculo.entradaLiberadaEm && (
                  <p className="text-sm opacity-60 mt-1">
                    Entrada liberada às {formatarBR(result.veiculo.entradaLiberadaEm, 'hora')}
                  </p>
                )}
              </>
            )}
            <p className="text-lg mt-5 opacity-95 leading-snug">{result.message}</p>
            {result.aviso && (
              <p className="mt-4 rounded-xl bg-amber-400 text-slate-900 text-base font-semibold px-3 py-2 leading-snug">⚠ {result.aviso}</p>
            )}

            {categoria === 'semResposta' && (
              <>
                <Loader2 className="w-8 h-8 animate-spin mx-auto mt-5 opacity-80" />
                {/* Internet que não responde (Wi-Fi sem sinal de verdade): não precisa esperar — guarda no aparelho. */}
                <button
                  onClick={e => { e.stopPropagation(); seguirSemInternet() }}
                  className="mt-6 w-full max-w-xs mx-auto flex items-center justify-center gap-2 bg-slate-900/80 text-white font-bold rounded-2xl px-6 py-4 border-2 border-white/40 active:scale-95 transition-all"
                >
                  <CloudOff className="w-5 h-5" /> Seguir sem internet
                </button>
              </>
            )}

            {/*
              * Crachá de outra etapa: o operador precisa DECIDIR, não só ler.
              *
              * Os dois caminhos ficam à vista. "Pedir o CPF" é o que resolve
              * de verdade — diz se a pessoa está na lista. "Voltar a ler" cobre
              * o caso inocente e mais comum: ela só precisa recarregar a tela.
              */}
            {categoria === 'semEntrada' && result.funcionarioId ? (
              /* A pessoa não tem entrada: o operador pergunta a hora e registra entrada + saída de uma vez (modal abaixo). */
              <div className="mt-8 space-y-3 max-w-xs mx-auto">
                <button
                  onClick={e => {
                    e.stopPropagation()
                    const codigo = ultimoRef.current?.codigo
                    if (!codigo || !result.funcionarioId) return
                    setHoraDoModal('')
                    setModalEntrada({ codigo, nome: result.funcionario?.nome ?? 'a pessoa', funcionarioId: result.funcionarioId })
                  }}
                  className="w-full bg-white text-orange-700 font-extrabold text-lg rounded-2xl py-4 shadow-lg active:scale-95 transition-all"
                >
                  REGISTRAR A ENTRADA DELE
                </button>
                <button
                  onClick={e => { e.stopPropagation(); liberar() }}
                  className="w-full border-2 border-white/60 text-white font-semibold rounded-2xl py-3"
                >
                  Ler o próximo
                </button>
              </div>
            ) : result.faseErrada ? (
              <div className="mt-8 space-y-3 max-w-xs mx-auto">
                <button
                  onClick={e => { e.stopPropagation(); setConferindo(true) }}
                  className="w-full bg-white text-red-700 font-bold rounded-2xl py-4 text-lg shadow-lg"
                >
                  Pedir o CPF e conferir
                </button>
                <button
                  onClick={e => { e.stopPropagation(); liberar() }}
                  className="w-full border-2 border-white/60 text-white font-semibold rounded-2xl py-3"
                >
                  Voltar a ler QR Code
                </button>
              </div>
            ) : (
              // A ÚNICA saída desta tela — grande, pra não ter dúvida.
              <button
                onClick={e => { e.stopPropagation(); liberar() }}
                className="mt-8 w-full max-w-xs mx-auto block bg-white text-slate-900 font-extrabold text-lg rounded-2xl px-6 py-4 shadow-lg active:scale-95 transition-all"
              >
                {categoria === 'semResposta' ? 'Fechar e ler o próximo' : 'LER O PRÓXIMO'}
              </button>
            )}
          </div>
        </div>
      )}

      {/*
        * O MODAL DA HORA DA ENTRADA (com internet): quem está dando a saída não bateu a entrada — o operador pergunta a
        * hora, informa aqui e o sistema registra a entrada (lançada à mão, com o nome dele) e a saída, as duas de uma vez.
        * Cores fixas (não do tema): esta tela é escura nos dois temas e o cartão é branco.
        */}
      {modalEntrada && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/90 px-6" role="dialog" aria-modal="true" aria-label="Registrar a entrada">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-sm font-semibold text-[#64748b]">Registrar a entrada de</p>
            <p className="mt-0.5 text-2xl font-extrabold leading-tight text-[#0f172a]">{modalEntrada.nome}</p>
            <label htmlFor="hora-do-modal" className="mb-1.5 mt-5 block text-sm font-semibold text-[#334155]">Que horas ela entrou? *</label>
            <CampoHoraDeEntrada id="hora-do-modal" valor={horaDoModal} aoMudar={setHoraDoModal} autoFocus />
            <p className="mt-2 text-xs leading-snug text-[#64748b]">A entrada fica marcada como lançada à mão, com o seu nome. A saída é registrada agora, na hora de agora.</p>
            <button
              type="button" onClick={registrarEntradaESaida} disabled={gravandoModal || !horaDeEntradaValida(horaDoModal)}
              className="mt-5 w-full rounded-2xl bg-[#2563eb] py-4 text-lg font-extrabold text-white shadow-lg transition-all active:scale-95 disabled:opacity-50"
            >
              {gravandoModal ? <span className="inline-flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> Registrando...</span> : 'REGISTRAR ENTRADA E SAÍDA'}
            </button>
            <button
              type="button" onClick={() => setModalEntrada(null)} disabled={gravandoModal}
              className="mt-3 w-full rounded-2xl border-2 border-[#cbd5e1] py-3 text-base font-bold text-[#334155] transition-all active:scale-95 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/*
        * Duas portas para a mesma conferência: o crachá de outra etapa (o
        * caso original) e a câmera que não abriu. O aviso muda porque o
        * motivo de estar aqui é outro — e quem opera precisa saber qual é.
        */}
      {conferindo && (
        <ConferenciaCpf
          eventoId={eventoId}
          aviso={result?.faseErrada
            ? `O QR apresentado é da ${result.faseErrada.doQR}, e hoje é ${result.faseErrada.deHoje}. Confirme pelo CPF se esta pessoa está credenciada.`
            : 'Sem câmera, dá para conferir quem está credenciado pelo CPF. Para REGISTRAR o ponto, use "Registrar ponto" no topo da tela.'}
          aoFechar={liberar}
        />
      )}
    </div>
  )
}
