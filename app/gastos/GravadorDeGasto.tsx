'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, Square, Loader2, Check, X, Pencil, AlertTriangle, Sparkles } from 'lucide-react'
import { criarGasto } from '@/lib/actions-gastos'
import { CATEGORIAS_GASTO, CATEGORIA_PADRAO, ROTULO_CAMPO, brl } from '@/lib/gastos-constantes'
import SeletorLista from '@/components/SeletorLista'
import DateTimePicker from '@/components/DateTimePicker'

type Extraido = {
  transcricao: string
  valor: number | null
  descricao: string | null
  fornecedor: string | null
  categoria: string | null
  dataGasto: string | null
  precisaConfirmar: string[]
}

type Fase = 'parado' | 'gravando' | 'processando' | 'conferindo'

const MIMES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
function melhorMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return MIMES.find(m => MediaRecorder.isTypeSupported(m)) ?? ''
}

/**
 * O botão gigante. É o elemento principal da tela — "falei o que gastei e
 * pronto".
 *
 * FLUXO: parado → (clica) gravando com contador e anel pulsante → (finaliza)
 * processando → conferindo, um card com o que a IA entendeu. Campos que ela
 * marcou como incertos vêm em âmbar; se faltar valor ou descrição, o card já
 * abre em modo edição e não deixa confirmar sem preencher.
 *
 * Se o microfone for negado ou o navegador não gravar, cai direto no aviso
 * apontando pro "+ Adicionar manualmente" — nenhuma função depende só do áudio.
 */
export default function GravadorDeGasto({ eventoId, eventoNome }: { eventoId: string; eventoNome: string }) {
  const router = useRouter()
  const [fase, setFase] = useState<Fase>('parado')
  const [segundos, setSegundos] = useState(0)
  const [erro, setErro] = useState<string | null>(null)
  const [extraido, setExtraido] = useState<Extraido | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const pararTick = () => { if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null } }
  const soltarMic = () => { streamRef.current?.getTracks().forEach(t => t.stop()); streamRef.current = null }

  useEffect(() => () => { pararTick(); soltarMic() }, [])

  const comecar = async () => {
    setErro(null)
    if (!eventoId) { setErro('Escolha o evento primeiro.'); return }
    if (typeof MediaRecorder === 'undefined') {
      setErro('Este navegador não grava áudio. Use "Adicionar manualmente".')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setErro('Não consegui acessar o microfone. Libere a permissão ou use "Adicionar manualmente".')
      return
    }
    streamRef.current = stream
    const mime = melhorMime()
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunksRef.current = []
    rec.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data) }
    rec.onstop = () => enviar(new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' }))
    recorderRef.current = rec
    rec.start()
    setSegundos(0)
    setFase('gravando')
    tickRef.current = setInterval(() => setSegundos(s => {
      if (s >= 119) { finalizar() } // teto de 2 min — o resto vira ruído pra IA
      return s + 1
    }), 1000)
  }

  const finalizar = () => {
    pararTick()
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') rec.stop()
    soltarMic()
    setFase('processando')
  }

  const cancelarGravacao = () => {
    pararTick()
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') { rec.onstop = null; rec.stop() }
    soltarMic()
    setFase('parado')
  }

  const enviar = async (blob: Blob) => {
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader()
        fr.onerror = () => reject(new Error('Falha ao ler o áudio.'))
        fr.onload = () => resolve(String(fr.result).split(',')[1] ?? '')
        fr.readAsDataURL(blob)
      })
      const resp = await fetch('/api/gastos/transcrever', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioBase64: base64, mime: blob.type || 'audio/webm', eventoId }),
      })
      if (!resp.ok) {
        setErro(await resp.text() || 'Não consegui processar o áudio. Tente de novo.')
        setFase('parado')
        return
      }
      const dados = await resp.json() as Extraido
      setExtraido(dados)
      setFase('conferindo')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui enviar o áudio. Verifique a conexão.')
      setFase('parado')
    }
  }

  const fecharConferencia = () => { setExtraido(null); setFase('parado'); setErro(null) }

  return (
    <div className="space-y-3">
      {fase === 'parado' && (
        <button
          onClick={comecar}
          className="w-full rounded-3xl bg-brand-500 hover:bg-brand-600 active:scale-[0.99] transition-all text-white py-10 flex flex-col items-center gap-3 shadow-lg shadow-brand-500/20"
        >
          <Mic className="w-10 h-10" />
          <span className="text-lg font-bold">Registrar gasto</span>
          <span className="text-white/80 text-xs">Toque e fale quanto gastou, com o quê e com quem</span>
        </button>
      )}

      {fase === 'gravando' && (
        <div className="w-full rounded-3xl bg-red-500 text-white py-10 flex flex-col items-center gap-4 shadow-lg">
          <span className="relative flex items-center justify-center">
            <span className="absolute w-20 h-20 rounded-full bg-white/30 animate-ping" />
            <span className="relative w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
              <Mic className="w-8 h-8" />
            </span>
          </span>
          <span className="text-2xl font-bold tabular-nums">{fmt(segundos)}</span>
          <span className="text-white/80 text-xs">Gravando… fale naturalmente</span>
          <div className="flex gap-2">
            <button onClick={finalizar} className="bg-white text-red-600 font-semibold rounded-xl px-4 py-2 flex items-center gap-2">
              <Square className="w-4 h-4 fill-current" /> Finalizar gravação
            </button>
            <button onClick={cancelarGravacao} className="text-white/80 hover:text-white text-sm px-3">Cancelar</button>
          </div>
        </div>
      )}

      {fase === 'processando' && (
        <div className="w-full rounded-3xl bg-slate-800 text-white py-12 flex flex-col items-center gap-3">
          <Loader2 className="w-9 h-9 animate-spin" />
          <span className="font-semibold">Processando áudio…</span>
          <span className="text-white/70 text-xs">Transcrevendo e identificando o gasto</span>
        </div>
      )}

      {fase === 'conferindo' && extraido && (
        <CardConferencia
          extraido={extraido}
          eventoId={eventoId}
          eventoNome={eventoNome}
          onCancelar={fecharConferencia}
          onSalvo={() => { fecharConferencia(); router.refresh() }}
        />
      )}

      {erro && (
        <p className="flex items-start gap-1.5 text-red-600 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}
    </div>
  )
}

function fmt(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// ─── Card de conferência ─────────────────────────────────────────────────────

function CardConferencia({
  extraido, eventoId, eventoNome, onCancelar, onSalvo,
}: {
  extraido: Extraido
  eventoId: string
  eventoNome: string
  onCancelar: () => void
  onSalvo: () => void
}) {
  const faltaEssencial = extraido.valor == null || !extraido.descricao
  const [editando, setEditando] = useState(faltaEssencial || extraido.precisaConfirmar.length > 0)

  const [valor, setValor] = useState(extraido.valor != null ? String(extraido.valor).replace('.', ',') : '')
  const [descricao, setDescricao] = useState(extraido.descricao ?? '')
  const [fornecedor, setFornecedor] = useState(extraido.fornecedor ?? '')
  const [categoria, setCategoria] = useState(extraido.categoria ?? CATEGORIA_PADRAO)
  const [dataGasto, setDataGasto] = useState(extraido.dataGasto ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const incerto = (campo: string) => extraido.precisaConfirmar.includes(campo)

  const confirmar = () => {
    setErro(null)
    const valorNum = Number(valor.replace(/\s/g, '').replace('.', '').replace(',', '.'))
    if (!Number.isFinite(valorNum) || valorNum <= 0) { setErro('Informe o valor do gasto.'); setEditando(true); return }
    if (!descricao.trim()) { setErro('Diga o que foi o gasto.'); setEditando(true); return }

    const fd = new FormData()
    fd.set('evento_id', eventoId)
    fd.set('origem', 'audio')
    fd.set('transcricao', extraido.transcricao)
    fd.set('valor', valor)
    fd.set('descricao', descricao.trim())
    fd.set('fornecedor', fornecedor.trim())
    fd.set('categoria', categoria)
    if (dataGasto) fd.set('data_gasto', dataGasto)

    startTransition(async () => {
      const r = await criarGasto(fd)
      if (!r.ok) { setErro(r.erro); return }
      onSalvo()
    })
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-brand-500" />
        <h3 className="text-slate-800 font-bold text-sm">Gasto identificado</h3>
        <button onClick={onCancelar} disabled={pendente} className="ml-auto text-slate-400 hover:text-slate-600">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-slate-400 text-2xs italic">&ldquo;{extraido.transcricao}&rdquo;</p>

        {!editando ? (
          <>
            <dl className="space-y-1.5 text-sm">
              <Linha rotulo="Valor" valor={brl(Number(valor.replace(',', '.')))} destaque />
              <Linha rotulo="Descrição" valor={descricao} />
              <Linha rotulo="Fornecedor" valor={fornecedor || '—'} atencao={incerto('fornecedor')} />
              <Linha rotulo="Categoria" valor={categoria} atencao={incerto('categoria')} />
              <Linha rotulo="Data" valor={dataGasto ? dataBr(dataGasto) : 'hoje'} atencao={incerto('dataGasto')} />
              <Linha rotulo="Evento" valor={eventoNome} />
            </dl>
            <div className="flex gap-2 pt-1">
              <button onClick={confirmar} disabled={pendente} className="btn btn-primario flex-1 justify-center disabled:opacity-50">
                {pendente ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Confirmar gasto
              </button>
              <button onClick={() => setEditando(true)} disabled={pendente} className="btn btn-secundario">
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
            </div>
          </>
        ) : (
          <>
            {extraido.precisaConfirmar.length > 0 && (
              <p className="flex items-start gap-1.5 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                Confira: {extraido.precisaConfirmar.map(c => ROTULO_CAMPO[c] ?? c).join(', ')}.
              </p>
            )}
            <Campo rotulo="Valor (R$)" atencao={incerto('valor')}>
              <input value={valor} onChange={e => setValor(e.target.value)} inputMode="decimal" placeholder="0,00" className="input tabular-nums" autoFocus={incerto('valor')} />
            </Campo>
            <Campo rotulo="Descrição" atencao={incerto('descricao')}>
              <input value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: aluguel de estrutura" className="input" />
            </Campo>
            <Campo rotulo="Fornecedor" atencao={incerto('fornecedor')}>
              <input value={fornecedor} onChange={e => setFornecedor(e.target.value)} placeholder="Ex.: XYZ Eventos" className="input" />
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Categoria" atencao={incerto('categoria')}>
                <SeletorLista valor={categoria} onChange={setCategoria} titulo="Categoria" opcoes={CATEGORIAS_GASTO.map(c => ({ valor: c, rotulo: c }))} />
              </Campo>
              <Campo rotulo="Data do gasto" atencao={incerto('dataGasto')}>
                <DateTimePicker modo="data" value={dataGasto} onChange={setDataGasto} placeholder="Hoje" />
              </Campo>
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={confirmar} disabled={pendente} className="btn btn-primario flex-1 justify-center disabled:opacity-50">
                {pendente ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Confirmar gasto
              </button>
              {!faltaEssencial && (
                <button onClick={() => setEditando(false)} disabled={pendente} className="btn btn-secundario">Voltar</button>
              )}
            </div>
          </>
        )}

        {erro && (
          <p className="flex items-start gap-1.5 text-red-600 text-xs">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
          </p>
        )}
      </div>
    </div>
  )
}

function dataBr(iso: string) {
  return `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
}

function Linha({ rotulo, valor, destaque, atencao }: { rotulo: string; valor: string; destaque?: boolean; atencao?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-slate-400 text-xs">{rotulo}</dt>
      <dd className={`${destaque ? 'text-slate-900 font-bold text-base' : 'text-slate-700'} ${atencao ? 'text-amber-700' : ''} text-right`}>
        {valor}{atencao && <span className="text-amber-600 text-2xs ml-1">confirme</span>}
      </dd>
    </div>
  )
}

function Campo({ rotulo, atencao, children }: { rotulo: string; atencao?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className={`text-xs font-medium ${atencao ? 'text-amber-700' : 'text-slate-600'}`}>
        {rotulo}{atencao && ' · confirme'}
      </label>
      <div className={atencao ? 'rounded-xl ring-1 ring-amber-300' : ''}>{children}</div>
    </div>
  )
}
