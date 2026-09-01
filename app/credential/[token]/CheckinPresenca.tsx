'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, Clock, Lock, MapPin, Loader2, QrCode, LogOut, Copy, CheckCheck } from 'lucide-react'
import { registrarPresencaFoto, registrarPresencaLivre } from '@/lib/actions'

type Status = 'feito' | 'disponivel' | 'aguardando' | 'encerrado' | 'indefinido'

export type MomentoInfo = {
  momento: 'entrada' | 'meio' | 'fim'
  label: string
  descricao: string
  inicio: string | null
  fim: string | null
  status: Status
  feitoEm: string | null
  /*
   * O horário já em texto, montado no servidor.
   *
   * Existe porque as etapas deixaram de ter todas o mesmo formato: entrada e
   * saída agora costumam ser "livre hoje, a qualquer hora" (sem instante
   * nenhum), e o meio é calculado a partir da entrada de CADA pessoa. Só o
   * servidor sabe qual das regras vale — deixar o cliente adivinhar a partir de
   * inicio/fim faria "livre" virar "horário não definido".
   */
  janelaTexto: string
  /** Recado extra quando a etapa passou do prazo. Só o meio usa. */
  avisoAtraso?: string | null
}

function horaBR(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

/*
 * Prazo para decodificar a foto.
 *
 * Em navegador embutido quebrado (o de dentro do WhatsApp, em alguns
 * aparelhos), `img.onload` e `img.onerror` simplesmente nunca disparam —
 * nem sucesso, nem erro — e sem um teto aqui a tela ficava girando pra
 * sempre, com o botão preso em "Enviando...". Foi isso, e não a
 * localização, que travou o registro relatado pelo Juan: o mesmo defeito
 * de WebView, só que num passo que ainda não tinha teto.
 */
const TETO_COMPRESSAO_MS = 10_000

// Reduz a foto antes de enviar (limite de tamanho da server action + rapidez —
// durante o evento, a rede do local costuma ser ruim, então prioriza velocidade
// sobre qualidade aqui: são só fotos de conferência, não precisam de nitidez).
function comprimir(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    const limpar = () => { clearTimeout(teto); URL.revokeObjectURL(url) }
    const teto = setTimeout(() => { limpar(); reject(new Error('comprimir-teto')) }, TETO_COMPRESSAO_MS)
    img.onload = () => {
      limpar()
      const max = 720
      let { width, height } = img
      if (width > height && width > max) { height = Math.round((height * max) / width); width = max }
      else if (height >= width && height > max) { width = Math.round((width * max) / height); height = max }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas'))
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.5))
    }
    img.onerror = () => { limpar(); reject(new Error('img')) }
    img.src = url
  })
}

type Coords = { lat: number; lng: number }

type Localizacao = {
  /** A melhor posição que já chegou, se alguma chegou. Leitura instantânea. */
  agora: () => Coords | null
  /** Resolve na primeira posição que chegar; null quando todas falham. */
  pronta: Promise<Coords | null>
  /** Alguma tentativa foi barrada por permissão negada. */
  negada: () => boolean
}

/**
 * Começa a procurar a localização — sem prender ninguém.
 *
 * Chamada no TOQUE do botão, não depois da foto. É a diferença entre o
 * registro levar quase um minuto e não levar nada: enquanto a pessoa abre a
 * câmera, enquadra e tira a selfie passam de cinco a vinte segundos que antes
 * eram jogados fora e agora são exatamente o tempo que o aparelho gasta para
 * se localizar. Quando a foto fica pronta, a posição quase sempre já chegou.
 *
 * As duas tentativas correm JUNTAS, não em fila:
 *
 *   - aproximada (torre/wi-fi) responde em segundos e funciona sob laje;
 *   - fina (satélite) demora mais e às vezes não fixa dentro de um galpão.
 *
 * Em fila, a fina segurava a aproximada e o pior caso somava os dois tetos.
 * Em paralelo vale a primeira que chegar — e a fina ainda melhora o registro
 * se chegar depois, sem custar espera a ninguém.
 *
 * Nenhuma falha aqui interrompe nada: quem decide o que fazer sem posição é
 * quem chamou, na hora de enviar.
 */
function iniciarLocalizacao(): Localizacao {
  let melhor: Coords | null = null
  let precisao = Infinity
  let recusada = false
  let avisar: ((c: Coords | null) => void) | null = null
  let pendentes = 2

  const pronta = new Promise<Coords | null>(r => { avisar = r })

  const aceitar = (pos: GeolocationPosition) => {
    // A mais precisa vence, venha ela primeiro ou depois.
    if (pos.coords.accuracy < precisao) {
      precisao = pos.coords.accuracy
      melhor = { lat: pos.coords.latitude, lng: pos.coords.longitude }
    }
    avisar?.(melhor)
  }

  const desistir = (err: GeolocationPositionError) => {
    if (err.code === err.PERMISSION_DENIED) recusada = true
    // Só desiste de verdade quando as duas falharam e nada chegou.
    if (--pendentes === 0 && !melhor) avisar?.(null)
  }

  navigator.geolocation.getCurrentPosition(aceitar, desistir,
    { enableHighAccuracy: false, timeout: 15_000, maximumAge: 120_000 })
  navigator.geolocation.getCurrentPosition(aceitar, desistir,
    { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 })

  return { agora: () => melhor, pronta, negada: () => recusada }
}

/** Espera curta, para não deixar ninguém preso quando a posição atrasa. */
const aposMs = (ms: number) => new Promise<null>(r => setTimeout(() => r(null), ms))

/**
 * Quanto ainda esperamos DEPOIS que a foto ficou pronta.
 *
 * Curto de propósito. A busca começou lá atrás, no toque do botão; se mesmo
 * assim não chegou nada até aqui, é porque não vai chegar — e é melhor dizer
 * isso rápido do que segurar a pessoa na fila do credenciamento.
 */
const GRACA_MS = 6_000

/**
 * A pessoa está no navegador embutido de outro aplicativo?
 *
 * O link chega pelo WhatsApp, e tocar nele abre um navegador de dentro do
 * próprio WhatsApp. No Android esse navegador é uma WebView que não recebe a
 * permissão de localização do sistema: `getCurrentPosition` simplesmente não
 * responde — nem sucesso, nem erro. Foi o que travou o registro no Manos da
 * Vila, e é por isso que pelo navegador de verdade vai rápido.
 *
 * Não dá para consertar isso de dentro da página: a permissão é do aplicativo
 * hospedeiro. O que dá é reconhecer onde estamos e dizer à pessoa o caminho —
 * antes de ela perder tempo tentando.
 */
function emNavegadorEmbutido(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  // `; wv` marca WebView no Android; os demais são os apps que mais aparecem.
  return /;\s*wv\)|WhatsApp|FB_IAB|FBAN|FBAV|Instagram|Line\/|MicroMessenger/i.test(ua)
}

/** Uma batida pronta que ainda não conseguiu subir. */
type Pendente = { base64: string; lat: number; lng: number; em: number }

const chavePendente = (token: string) => `credenciei:meio-pendente:${token}`

/**
 * Por quanto tempo uma batida guardada ainda vale.
 *
 * Existe por causa do horário. Quem carimba é o servidor, na hora em que
 * RECEBE — então uma batida que sobe muito depois entra no relatório com o
 * horário errado, contra a pessoa, justo no dado que serve para justificar a
 * jornada com ela.
 *
 * Meia hora cobre com folga o que isto foi feito para resolver: rede saturada
 * de evento, que volta em segundos ou minutos. O que passar disso é descartado
 * com aviso para refazer — melhor perder a foto do que gravar hora errada.
 */
const VALIDADE_MS = 30 * 60 * 1000

function lerPendente(token: string): { pendente: Pendente | null; venceu: boolean } {
  try {
    const cru = localStorage.getItem(chavePendente(token))
    if (!cru) return { pendente: null, venceu: false }
    const p = JSON.parse(cru) as Pendente
    if (!p?.base64 || typeof p.em !== 'number') throw new Error('formato')
    if (Date.now() - p.em > VALIDADE_MS) {
      localStorage.removeItem(chavePendente(token))
      return { pendente: null, venceu: true }
    }
    return { pendente: p, venceu: false }
  } catch {
    // Armazenamento indisponível ou conteúdo corrompido: seguir sem pendência
    // é sempre seguro — a pessoa refaz a batida.
    try { localStorage.removeItem(chavePendente(token)) } catch {}
    return { pendente: null, venceu: false }
  }
}

function guardarPendente(token: string, p: Pendente) {
  try { localStorage.setItem(chavePendente(token), JSON.stringify(p)) } catch {}
}

function limparPendente(token: string) {
  try { localStorage.removeItem(chavePendente(token)) } catch {}
}

/**
 * O servidor recusou porque a etapa JÁ está registrada?
 *
 * Isso acontece quando o envio chegou e só a resposta se perdeu no caminho: o
 * reenvio bate na guarda de duplicidade. Para a pessoa é sucesso — a batida
 * existe. Mostrar "já registrou" como erro faria ela achar que deu errado e
 * tentar de novo.
 */
const ehDuplicata = (msg?: string) => /já registrou/i.test(msg ?? '')

export default function CheckinPresenca({
  token, momentos, diaPrincipal,
}: {
  token: string
  momentos: MomentoInfo[]
  /** Fora do dia principal, entrada e saída ganham registro sem operador (ver `registrarLivre`). */
  diaPrincipal: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  // Qual etapa (entrada/fim) está em andamento no registro sem operador — nunca as duas ao mesmo tempo.
  const [busyLivre, setBusyLivre] = useState<'entrada' | 'fim' | null>(null)
  // Em que ponto estamos: a espera fica longa e sem isto a tela parece travada.
  const [fase, setFase] = useState<'local' | 'enviando' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  /*
   * Só depois de montar. O servidor não sabe em que navegador a página vai
   * abrir, e chutar aqui daria divergência de hidratação.
   */
  const [embutido, setEmbutido] = useState(false)
  const [pendente, setPendente] = useState<Pendente | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const localRef = useRef<Localizacao | null>(null)
  // Impede dois envios ao mesmo tempo (o automático e o manual, por exemplo).
  const enviandoRef = useRef(false)

  useEffect(() => {
    /*
     * Depois da pintura, não durante. Estas duas leituras só existem no
     * navegador (userAgent e armazenamento local), então não dá para resolvê-las
     * na renderização — o servidor não as tem, e chutar daria divergência de
     * hidratação. Adiar um tique também evita a cascata de re-render que o
     * React reclama quando o estado muda em cima da montagem.
     */
    const id = setTimeout(() => {
      setEmbutido(emNavegadorEmbutido())
      // Recupera uma batida que ficou para trás — inclusive de uma visita
      // anterior, se a pessoa fechou a tela sem conseguir enviar.
      const { pendente: guardada, venceu } = lerPendente(token)
      if (guardada) setPendente(guardada)
      if (venceu) setErro('Sua batida guardada passou de meia hora e foi descartada para não gravar horário errado. Tire a foto de novo, por favor.')
    }, 0)
    return () => clearTimeout(id)
  }, [token])

  // Fluxo da etapa MEIO: câmera e localização ao mesmo tempo.
  // IMPORTANTE: fileRef.current.click() precisa rodar SÍNCRONO, direto no
  // clique do usuário — se passar por qualquer await antes (ex: esperar o
  // GPS), o navegador (principalmente celular) recusa abrir a câmera com
  // "File chooser dialog can only be shown with a user activation" e o
  // change do input nunca dispara, travando o botão pra sempre.
  const abrirCamera = () => {
    setErro(null)
    // A câmera primeiro, ainda dentro do gesto. A localização logo atrás, em
    // segundo plano: o tempo da foto passa a ser o tempo da localização, em
    // vez de os dois se somarem.
    fileRef.current?.click()
    localRef.current = iniciarLocalizacao()
  }

  /**
   * Entrada e saída sem operador — fora do dia principal.
   *
   * Sem selfie de propósito: é o toque que precisa ser rápido, e câmera é
   * exatamente o passo que trava em navegador embutido quebrado (o mesmo
   * problema já corrigido no meio). A localização não trava o registro —
   * falhando, some do resultado, mas a batida sai igual.
   */
  const registrarLivre = async (momento: 'entrada' | 'fim') => {
    if (busyLivre) return
    setErro(null)
    setBusyLivre(momento)
    try {
      const local = iniciarLocalizacao()
      const posicao = local.agora() ?? await Promise.race([local.pronta, aposMs(GRACA_MS)])
      const r = await registrarPresencaLivre(token, momento, posicao?.lat ?? null, posicao?.lng ?? null)
      if (r.ok || ehDuplicata(r.error)) {
        setErro(null)
        router.refresh()
      } else {
        setErro(r.error ?? 'Não foi possível registrar. Tente de novo.')
      }
    } catch {
      setErro('Não foi possível registrar agora. Verifique a internet e tente de novo.')
    } finally {
      setBusyLivre(null)
    }
  }

  /**
   * Entrega a batida — e, se a rede não deixar, guarda para reenviar.
   *
   * A distinção que sustenta tudo aqui é entre o servidor DIZER NÃO e o
   * servidor NÃO RESPONDER:
   *
   *   - resposta com erro é uma decisão (fora da janela, cadastro inativo).
   *     Insistir não muda nada, então descarta e explica.
   *   - exceção é transporte: a rede caiu, o pedido não chegou. Aí guardar e
   *     tentar de novo é exatamente o certo — e evita a pior parte do
   *     problema antigo, que era a pessoa ter de TIRAR A FOTO DE NOVO.
   */
  const entregar = async (p: Pendente) => {
    if (enviandoRef.current) return
    enviandoRef.current = true
    try {
      const r = await registrarPresencaFoto(token, p.base64, p.lat, p.lng)
      limparPendente(token)
      setPendente(null)
      if (r.ok || ehDuplicata(r.error)) {
        // Duplicata é sucesso: o envio anterior chegou, só a resposta se
        // perdeu. Dizer "já registrou" aqui faria a pessoa achar que falhou.
        setErro(null)
        router.refresh()
      } else {
        setErro(r.error ?? 'Não foi possível registrar. Tente de novo.')
      }
    } catch {
      guardarPendente(token, p)
      setPendente(p)
      setErro(null)
    } finally {
      enviandoRef.current = false
    }
  }

  /*
   * Enquanto houver batida guardada, seguimos tentando: assim que a conexão
   * voltar e, de tempos em tempos, porque o evento `online` nem sempre dispara
   * quando o sinal oscila sem cair de vez — que é o normal em estádio cheio.
   */
  useEffect(() => {
    if (!pendente) return
    const tentar = () => {
      // Venceu enquanto a tela estava aberta: descarta em vez de gravar hora
      // errada. A mesma checagem existe na leitura, para quem reabre depois.
      if (Date.now() - pendente.em > VALIDADE_MS) {
        limparPendente(token)
        setPendente(null)
        setErro('Sua batida guardada passou de meia hora e foi descartada para não gravar horário errado. Tire a foto de novo, por favor.')
        return
      }
      void entregar(pendente)
    }
    const id = setInterval(tentar, 15_000)
    window.addEventListener('online', tentar)
    return () => { clearInterval(id); window.removeEventListener('online', tentar) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendente, token])

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    // Cancelou a câmera sem tirar foto: como "busy" só liga depois daqui,
    // não sobra nenhum estado travado pra desfazer.
    if (!file) return

    setBusy(true)
    setFase('local')
    try {
      if (!('geolocation' in navigator)) {
        setErro('Seu aparelho não permite pegar a localização.')
        return
      }
      const local = localRef.current
      if (!local) throw new Error('semsinal')

      /*
       * Comprimir e localizar ao mesmo tempo. A compressão não depende da
       * posição — encadear as duas só somaria espera.
       */
      const [base64, posicao] = await Promise.all([
        comprimir(file),
        // Já chegou? segue na hora. Senão, espera pouco e desiste.
        local.agora() ?? Promise.race([local.pronta, aposMs(GRACA_MS)]),
      ])

      if (!posicao) throw new Error(local.negada() ? 'permissao' : 'semsinal')
      const coords = posicao
      setFase('enviando')

      /*
       * O ENVIO não tem teto de tempo, de propósito.
       *
       * Havia um limite de 15s aqui, e ele fazia mal: desistir de ESPERAR não
       * cancela o envio. Na rede saturada de um evento, a foto subia em 20s, o
       * registro era gravado — e a pessoa já tinha visto "Demorou demais" e
       * tentava de novo. Erro falso em cima de sucesso confunde mais do que uma
       * espera longa, porque leva a pessoa a duvidar de uma batida que existe.
       */
      await entregar({ base64, lat: coords.lat, lng: coords.lng, em: Date.now() })
    } catch (err) {
      /*
       * Cada falha tem a sua saída. Antes tudo virava "ative o GPS", inclusive
       * quando o GPS estava ligado e o problema era o lugar — mandava a pessoa
       * mexer numa configuração que já estava certa.
       */
      const causa = err instanceof Error ? err.message : ''
      const semPosicao = causa === 'permissao' || causa === 'semsinal'
      // A foto travou pra decodificar: no aparelho da pessoa, é o mesmo
      // sintoma do navegador embutido — mesmo quando `embutido` não bateu
      // (a lista de apps não é exaustiva), então tratamos igual.
      const travouProcessando = causa === 'comprimir-teto'
      setErro(
        // Dentro do navegador do WhatsApp a localização não funciona, e a
        // culpa não é do GPS da pessoa — mandá-la "ir para perto da porta"
        // seria fazê-la perder tempo com o problema errado.
        (semPosicao && embutido) || travouProcessando
          ? 'Este navegador (o de dentro do WhatsApp) não consegue registrar a foto. Toque em "Copiar link" abaixo, abra o Chrome ou Safari e cole lá — depois é só tirar a foto de novo.'
          : causa === 'permissao'
            ? 'Precisamos da sua localização. Permita o acesso à localização para este site e toque de novo.'
            : causa === 'semsinal'
              ? 'Não conseguimos pegar sua localização. Vá para perto de uma porta ou área aberta e tente de novo — se continuar, procure o credenciamento.'
              : 'Não foi possível processar a foto. Tente de novo.'
      )
      if (travouProcessando) setEmbutido(true)
    } finally {
      setBusy(false)
      setFase(null)
    }
  }

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <p className="text-red-600 text-xs font-medium">{erro}</p>
          {embutido && <BotaoCopiarLink />}
        </div>
      )}

      {/*
        * A batida guardada precisa ser VISÍVEL.
        *
        * Sem isto, quem ficou sem rede vê a tela igual à de antes de tirar a
        * foto e conclui que perdeu a batida — aí tira outra, ou vai reclamar
        * no credenciamento. Dizer que está guardada e subindo sozinha resolve
        * a dúvida sem ninguém sair do posto.
        */}
      {pendente && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
          <Loader2 className="w-4 h-4 text-amber-600 animate-spin shrink-0" />
          <div className="min-w-0">
            <p className="text-amber-900 text-xs font-semibold">Batida guardada — enviando</p>
            <p className="text-amber-700 text-xs mt-0.5">
              A internet oscilou, mas sua foto está salva e sobe sozinha assim que o sinal
              voltar. Pode deixar a tela aberta.
            </p>
          </div>
        </div>
      )}

      {/*
        * Avisa ANTES, não depois de falhar.
        *
        * Quem abre o link direto do WhatsApp cai numa WebView que não repassa
        * a permissão de localização, e a etapa da foto não tem como funcionar
        * ali. Descobrir isso só depois de tirar a selfie e esperar custa o
        * dobro do tempo — e no meio do evento esse tempo é fila.
        *
        * Só aparece quando existe etapa de foto a fazer: nas outras, o
        * navegador embutido dá conta e o aviso seria ruído.
        */}
      {embutido && momentos.some(m => m.momento === 'meio' && m.status === 'disponivel') && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <p className="text-amber-900 text-xs font-semibold">Abra no navegador para registrar</p>
          <p className="text-amber-700 text-xs mt-1">
            Pelo WhatsApp a foto e a localização não funcionam. Toque em <strong>Copiar link</strong> abaixo,
            abra o Chrome ou Safari e cole lá — depois é só tirar a foto.
          </p>
          <BotaoCopiarLink />
        </div>
      )}

      {momentos.map(m => (
        <div key={m.momento} data-tutorial={`cred-etapa-${m.momento}`} className="space-y-2">
          <Cartao
            info={m} busy={busy} fase={fase} onFoto={abrirCamera}
            diaPrincipal={diaPrincipal} busyLivre={busyLivre} onLivre={registrarLivre}
          />
          {/*
            * Fora do cartão, e não dentro do botão: o botão precisa continuar
            * curto e óbvio. Aqui cabe o recado inteiro — que ainda dá para
            * registrar, e que o atraso vai ser cobrado.
            */}
          {m.status === 'disponivel' && m.avisoAtraso && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
              <Clock className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-red-700 text-xs">{m.avisoAtraso}</p>
            </div>
          )}
        </div>
      ))}

      <p className="text-center text-slate-400 text-2xs pt-1 flex items-center justify-center gap-1">
        <MapPin className="w-3 h-3" /> Na etapa do meio, a localização é registrada junto com a foto.
      </p>
    </div>
  )
}

/**
 * Copia o link desta página, para colar num navegador de verdade.
 *
 * A instrução "toque nos três pontinhos e escolha Abrir no navegador" exige
 * achar o menu certo dentro do WhatsApp — em aparelho velho ou pessoa nervosa
 * na fila do evento, isso trava mais do que ajuda. Um toque que já copia o
 * link tira esse passo: só falta abrir qualquer navegador e colar.
 */
function BotaoCopiarLink() {
  const [copiado, setCopiado] = useState(false)

  const copiar = async () => {
    const link = window.location.href
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link)
      } else {
        // Sem Clipboard API (navegador embutido antigo): o truque do campo
        // temporário funciona em praticamente qualquer WebView.
        const temp = document.createElement('textarea')
        temp.value = link
        temp.style.position = 'fixed'
        temp.style.opacity = '0'
        document.body.appendChild(temp)
        temp.focus()
        temp.select()
        document.execCommand('copy')
        document.body.removeChild(temp)
      }
      setCopiado(true)
      setTimeout(() => setCopiado(false), 5000)
    } catch {
      // Nem isso funcionou — a pessoa ainda consegue selecionar o link na
      // própria barra de endereço do navegador embutido. Último recurso.
    }
  }

  return (
    <button
      type="button"
      onClick={copiar}
      className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 active:scale-95 transition-all px-3 py-1.5 rounded-lg"
    >
      {copiado ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copiado ? 'Link copiado!' : 'Copiar link'}
    </button>
  )
}

function Cartao({
  info, busy, fase, onFoto, diaPrincipal, busyLivre, onLivre,
}: {
  info: MomentoInfo
  busy: boolean
  fase: 'local' | 'enviando' | null
  onFoto: () => void
  /** Fora do dia principal, entrada e saída ficam autônomas — ver `onLivre`. */
  diaPrincipal: boolean
  busyLivre: 'entrada' | 'fim' | null
  onLivre: (momento: 'entrada' | 'fim') => void
}) {
  const janela = info.janelaTexto || 'horário não definido'
  const base = 'rounded-2xl border p-4 flex items-center gap-3'
  const ehFoto = info.momento === 'meio'
  const ehLivre = !ehFoto && !diaPrincipal
  const registrandoEsta = busyLivre === info.momento

  if (info.status === 'feito') {
    return (
      <div className={`${base} bg-green-50 border-green-200`}>
        <div className="w-10 h-10 rounded-xl bg-green-500 flex items-center justify-center shrink-0">
          <Check className="w-5 h-5 text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-green-800 font-bold text-sm">{info.label} registrada</p>
          <p className="text-green-600 text-xs">às {horaBR(info.feitoEm)}</p>
        </div>
      </div>
    )
  }

  if (info.status === 'disponivel') {
    // Meio: botão que abre câmera. Entrada/Fim: instrução pra apresentar o QR.
    if (ehFoto) {
      return (
        <button
          onClick={onFoto}
          disabled={busy}
          className={`${base} w-full bg-brand-500 border-brand-500 text-white hover:bg-brand-600 transition-all disabled:opacity-60`}
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
          </div>
          <div className="min-w-0 text-left">
            <p className="font-bold text-sm">
              {!busy ? 'Registrar meio com foto' : fase === 'local' ? 'Pegando sua localização...' : 'Enviando...'}
            </p>
            <p className="text-brand-100 text-xs">
              {!busy
                ? `Tire uma foto agora • ${janela}`
                : fase === 'local'
                  ? 'Pode levar alguns segundos. Não feche a tela.'
                  : 'Quase lá — não feche a tela.'}
            </p>
          </div>
        </button>
      )
    }
    /*
     * Fora do dia principal, entrada e saída não precisam de operador.
     *
     * É o que resolve quem chega antes da portaria abrir ou sai depois dela
     * fechar na montagem/desmontagem: um toque registra, com localização —
     * sem selfie, pra ser rápido. No dia principal isto nunca aparece; o
     * Fluxo 1 (QR lido no credenciamento) continua do jeito que já era.
     */
    if (ehLivre) {
      return (
        <button
          onClick={() => onLivre(info.momento as 'entrada' | 'fim')}
          disabled={registrandoEsta}
          className={`${base} w-full bg-brand-500 border-brand-500 text-white hover:bg-brand-600 transition-all disabled:opacity-60`}
        >
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            {registrandoEsta
              ? <Loader2 className="w-5 h-5 animate-spin" />
              : info.momento === 'entrada' ? <QrCode className="w-5 h-5" /> : <LogOut className="w-5 h-5" />}
          </div>
          <div className="min-w-0 text-left">
            <p className="font-bold text-sm">
              {registrandoEsta ? 'Registrando...' : `Registrar ${info.momento === 'entrada' ? 'entrada' : 'saída'}`}
            </p>
            <p className="text-brand-100 text-xs">
              {registrandoEsta ? 'Não feche a tela.' : `Toque para confirmar • ${janela}`}
            </p>
          </div>
        </button>
      )
    }
    return (
      <div className={`${base} bg-blue-50 border-blue-200`}>
        <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center shrink-0">
          {info.momento === 'entrada' ? <QrCode className="w-5 h-5 text-white" /> : <LogOut className="w-5 h-5 text-white" />}
        </div>
        <div className="min-w-0">
          <p className="text-blue-800 font-bold text-sm">{info.label} — apresente o QR code</p>
          <p className="text-blue-600 text-xs">Mostre o QR acima na {info.momento === 'entrada' ? 'entrada' : 'saída'} • {janela}</p>
        </div>
      </div>
    )
  }

  // aguardando / encerrado / indefinido
  const info2: Record<string, { icon: React.ElementType; texto: string }> = {
    // Sem instante (o meio de quem ainda não bateu a entrada), o próprio texto
    // da janela já explica a espera — "Abre às " sozinho ficaria pela metade.
    aguardando: { icon: Clock, texto: info.inicio ? `Abre às ${horaBR(info.inicio)}` : janela },
    encerrado: { icon: Lock, texto: `Horário encerrado${info.fim ? ` às ${horaBR(info.fim)}` : ''}` },
    indefinido: { icon: Clock, texto: janela },
  }
  const { icon: Icon, texto } = info2[info.status] ?? info2.indefinido
  return (
    <div className={`${base} bg-slate-50 border-slate-200`}>
      <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-slate-400" />
      </div>
      <div className="min-w-0">
        <p className="text-slate-600 font-bold text-sm">{info.label}{ehFoto ? ' (foto)' : ' (QR code)'}</p>
        <p className="text-slate-400 text-xs">{texto} {info.status === 'aguardando' && info.fim ? `• até ${horaBR(info.fim)}` : ''}</p>
      </div>
    </div>
  )
}
