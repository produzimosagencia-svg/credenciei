'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, Check, Clock, Lock, MapPin, Loader2, QrCode, LogOut } from 'lucide-react'
import { registrarPresencaFoto } from '@/lib/actions'

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
}

function horaBR(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

// Reduz a foto antes de enviar (limite de tamanho da server action + rapidez —
// durante o evento, a rede do local costuma ser ruim, então prioriza velocidade
// sobre qualidade aqui: são só fotos de conferência, não precisam de nitidez).
function comprimir(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
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
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')) }
    img.src = url
  })
}

type Coords = { lat: number; lng: number }

/** Uma tentativa de GPS, já com teto de tempo próprio. */
function tentarGps(opcoes: PositionOptions): Promise<Coords | GeolocationPositionError> {
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      err => resolve(err),
      opcoes
    )
  })
}

/**
 * Localização em duas tentativas.
 *
 * O teto de tempo tinha sido removido daqui porque desistir em 15s dava a
 * mensagem errada — "ative o GPS" para quem estava com o GPS ligado, só
 * demorando. Só que SEM teto o padrão da especificação é espera infinita: num
 * galpão, com alta precisão, o aparelho pode não fixar nunca e não chamar
 * callback nenhum. A tela ficava em "Registrando…" para sempre, sem erro e sem
 * saída. Foi o que travou a batida no Manos da Vila.
 *
 * Então: teto existe, mas desistir da PRECISÃO não é desistir da localização.
 * Primeiro tenta o GPS fino; se ele não fixa a tempo, cai para a localização
 * aproximada (torre/wi-fi), que é justamente a que funciona sob laje. Uma
 * posição grosseira responde a pergunta que importa — a pessoa está no evento?
 * — muito melhor do que posição nenhuma.
 *
 * Só a fase de localização tem teto. O envio da foto continua sem nenhum, de
 * propósito: lá, desistir de esperar não cancela o upload e faria a pessoa
 * duvidar de uma batida que existe.
 */
async function localizar(): Promise<Coords> {
  // Fina: o que dá o melhor registro quando o céu está visível.
  const fina = await tentarGps({ enableHighAccuracy: true, timeout: 25_000, maximumAge: 60_000 })
  if ('lat' in fina) return fina

  // Negada é decisão da pessoa, não lentidão: insistir não muda nada.
  if (fina.code === fina.PERMISSION_DENIED) throw new Error('permissao')

  // Aproximada: sem exigir satélite, costuma responder onde o GPS não fixa.
  const grossa = await tentarGps({ enableHighAccuracy: false, timeout: 20_000, maximumAge: 300_000 })
  if ('lat' in grossa) return grossa
  if (grossa.code === grossa.PERMISSION_DENIED) throw new Error('permissao')
  throw new Error('semsinal')
}

export default function CheckinPresenca({ token, momentos }: { token: string; momentos: MomentoInfo[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  // Em que ponto estamos: a espera fica longa e sem isto a tela parece travada.
  const [fase, setFase] = useState<'local' | 'enviando' | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fluxo da etapa MEIO: câmera primeiro, GPS depois.
  // IMPORTANTE: fileRef.current.click() precisa rodar SÍNCRONO, direto no
  // clique do usuário — se passar por qualquer await antes (ex: esperar o
  // GPS), o navegador (principalmente celular) recusa abrir a câmera com
  // "File chooser dialog can only be shown with a user activation" e o
  // change do input nunca dispara, travando o botão pra sempre.
  const abrirCamera = () => {
    setErro(null)
    fileRef.current?.click()
  }

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
      const coords = await localizar()
      setFase('enviando')

      /*
       * Sem teto de tempo, de propósito.
       *
       * Havia um limite de 15s aqui, e ele fazia mal: desistir de ESPERAR não
       * cancela o envio. Na rede saturada de um evento, a foto subia em 20s, o
       * registro era gravado — e a pessoa já tinha visto "Demorou demais" e
       * tentava de novo. Erro falso em cima de sucesso confunde mais do que uma
       * espera longa, porque leva a pessoa a duvidar de uma batida que existe.
       *
       * O botão continua saindo de "Registrando…" de qualquer forma: o
       * `finally` abaixo roda mesmo se isto falhar.
       */
      const base64 = await comprimir(file)
      const resultado = await registrarPresencaFoto(token, base64, coords.lat, coords.lng)
      if (resultado.ok) {
        router.refresh()
      } else {
        setErro(resultado.error ?? 'Não foi possível registrar. Tente de novo.')
      }
    } catch (err) {
      /*
       * Cada falha tem a sua saída. Antes tudo virava "ative o GPS", inclusive
       * quando o GPS estava ligado e o problema era o lugar — mandava a pessoa
       * mexer numa configuração que já estava certa.
       */
      const causa = err instanceof Error ? err.message : ''
      setErro(
        causa === 'permissao'
          ? 'Precisamos da sua localização. Permita o acesso à localização para este site e toque de novo.'
          : causa === 'semsinal'
            ? 'Não conseguimos pegar sua localização aqui dentro. Vá para perto de uma porta ou área aberta e tente de novo — se continuar, procure o credenciamento.'
            : 'Não foi possível processar a foto. Tente de novo.'
      )
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
        </div>
      )}

      {momentos.map(m => (
        <div key={m.momento} data-tutorial={`cred-etapa-${m.momento}`}>
          <Cartao info={m} busy={busy} fase={fase} onFoto={abrirCamera} />
        </div>
      ))}

      <p className="text-center text-slate-400 text-2xs pt-1 flex items-center justify-center gap-1">
        <MapPin className="w-3 h-3" /> Na etapa do meio, a localização é registrada junto com a foto.
      </p>
    </div>
  )
}

function Cartao({ info, busy, fase, onFoto }: { info: MomentoInfo; busy: boolean; fase: 'local' | 'enviando' | null; onFoto: () => void }) {
  const janela = info.janelaTexto || 'horário não definido'
  const base = 'rounded-2xl border p-4 flex items-center gap-3'
  const ehFoto = info.momento === 'meio'

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
