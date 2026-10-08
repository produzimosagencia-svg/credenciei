'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import 'leaflet/dist/leaflet.css'
import { Crosshair, MapPin, Check } from 'lucide-react'
import { obterEnderecoAproximado, salvarLocalDoEvento } from '@/lib/actions'

/**
 * O local do evento NUM MAPA DE VERDADE: pino arrastável, círculo do raio e o endereço em cima (pedido do Juan,
 * 08/10/2026, depois de ver o ponto sem contexto). É contra este ponto e este raio que cada leitura do operador é
 * conferida (marca "fora do local" na conferência interna; a batida vale do mesmo jeito).
 *
 * O raio é PARAMETRIZADO por evento, de propósito: o Sambão passa de 5 km de área, o Kleber Andrade passa de 2 km,
 * um teatro pequeno cabe em 100-200 m — um número fixo não serviria a nenhum dos dois.
 *
 * Leaflet puro (sem react-leaflet, que ainda não segue o React 19) — tiles do OpenStreetMap, sem chave de API.
 */
export default function LocalNoMapa({
  eventoId, latitude, longitude, raio, localDefault,
}: { eventoId: string; latitude: number | null; longitude: number | null; raio: number | null; localDefault: string }) {
  const [local, setLocal] = useState(localDefault)
  const [localTocadoPeloUsuario, setLocalTocadoPeloUsuario] = useState(false)
  const [lat, setLat] = useState(latitude ?? -20.3157)
  const [lng, setLng] = useState(longitude ?? -40.3584)
  const [raioM, setRaioM] = useState(raio ?? 800)
  const [temPonto, setTemPonto] = useState(latitude != null && longitude != null)
  const [endereco, setEndereco] = useState<string | null>(null)
  const [buscandoEndereco, setBuscandoEndereco] = useState(false)
  const [buscandoGps, setBuscandoGps] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const divRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapaRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pinoRef = useRef<any>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circuloRef = useRef<any>(null)

  // Monta o mapa uma vez. Pino e círculo são atualizados pelos efeitos abaixo, sempre que lat/lng/raio mudam.
  useEffect(() => {
    let cancelado = false
    import('leaflet').then(L => {
      if (cancelado || !divRef.current || mapaRef.current) return

      const mapa = L.map(divRef.current, { attributionControl: true }).setView([lat, lng], temPonto ? 15 : 12)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(mapa)

      // Pino em SVG inline — sem depender dos ícones padrão do Leaflet (que quebram ao empacotar com bundler).
      const icone = L.divIcon({
        html: `<svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 15 27 15 27s15-16.5 15-27C30 6.7 23.3 0 15 0z" fill="#2563eb" stroke="#fff" stroke-width="1.5"/>
          <circle cx="15" cy="15" r="6" fill="#fff"/>
        </svg>`,
        className: '', iconSize: [30, 42], iconAnchor: [15, 42],
      })
      const pino = L.marker([lat, lng], { icon: icone, draggable: true }).addTo(mapa)
      pino.on('dragend', () => {
        const p = pino.getLatLng()
        setLat(p.lat); setLng(p.lng); setTemPonto(true)
      })
      mapa.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        pino.setLatLng(e.latlng)
        setLat(e.latlng.lat); setLng(e.latlng.lng); setTemPonto(true)
      })

      const circulo = L.circle([lat, lng], {
        radius: raioM, color: '#ea580c', weight: 2, fillColor: '#ea580c', fillOpacity: 0.12,
      }).addTo(mapa)

      mapaRef.current = mapa; pinoRef.current = pino; circuloRef.current = circulo
    })
    return () => {
      cancelado = true
      if (mapaRef.current) { mapaRef.current.remove(); mapaRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pino, círculo e o zoom seguem lat/lng/raio — vindos do arraste, do clique, do GPS ou do "usar minha localização".
  useEffect(() => {
    if (!pinoRef.current || !circuloRef.current || !mapaRef.current) return
    pinoRef.current.setLatLng([lat, lng])
    circuloRef.current.setLatLng([lat, lng])
    circuloRef.current.setRadius(raioM)
    // Ajusta o zoom para o raio inteiro caber na tela — sem isso um raio de 5 km não aparecia no mapa aberto em 15.
    mapaRef.current.fitBounds(circuloRef.current.getBounds(), { maxZoom: 17, animate: true })
  }, [lat, lng, raioM])

  /*
   * Endereço acima do mapa — refeito (com pequeno atraso) toda vez que o ponto muda. É TAMBÉM o que preenche o
   * campo "Local" do evento: Juan pediu que o local passe a ser o ENDEREÇO REAL (08/10/2026), não um apelido —
   * esta é a única fonte do endereço no formulário. Enquanto o admin não editou o campo à mão, o endereço achado
   * aqui substitui automaticamente; depois de editado à mão uma vez, o toque dele passa a valer (o mapa não
   * sobrescreve mais, mesmo que o pino se mova de novo).
   */
  useEffect(() => {
    if (!temPonto) {
      const id = setTimeout(() => setEndereco(null), 0)
      return () => clearTimeout(id)
    }
    const id = setTimeout(() => {
      setBuscandoEndereco(true)
      obterEnderecoAproximado(lat, lng).then(e => {
        setEndereco(e)
        if (e && !localTocadoPeloUsuario) setLocal(e)
      }).finally(() => setBuscandoEndereco(false))
    }, 500)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng, temPonto])

  /*
   * Ação própria, sem passar pelo <form> grande da página (pedido do Juan, 08/10/2026: salvar o endereço estava
   * levando de volta para a tela do evento, no meio de ajustar o pino). `router.refresh()` atualiza os dados sem
   * sair de Editar evento.
   */
  const salvarLocal = () => {
    setErro(null)
    setSalvo(false)
    if (!local.trim()) { setErro('Informe o endereço do local.'); return }
    startTransition(async () => {
      const r = await salvarLocalDoEvento(eventoId, { local, latitude: temPonto ? lat : null, longitude: temPonto ? lng : null, raioM })
      if ('erro' in r) { setErro(r.erro); return }
      setSalvo(true)
      router.refresh()
    })
  }

  const usarMinhaLocalizacao = () => {
    setErro(null)
    if (!navigator.geolocation) { setErro('Este aparelho não informa a localização.'); return }
    setBuscandoGps(true)
    navigator.geolocation.getCurrentPosition(
      p => { setLat(p.coords.latitude); setLng(p.coords.longitude); setTemPonto(true); setBuscandoGps(false) },
      () => { setErro('Não foi possível pegar a localização. Permita a localização para este site.'); setBuscandoGps(false) },
      { enableHighAccuracy: true, timeout: 15000 },
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 p-4 space-y-3">
      {/*
        * `name="local"` continua existindo pro <form> grande (Salvar geral da página) levar o texto atual junto —
        * mas quem de fato grava o local, o pino e o raio é o botão "Salvar localização" abaixo, que NÃO navega.
        */}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-slate-700">Local (endereço)</span>
        <input
          name="local" value={local}
          onChange={e => { setLocal(e.target.value); setLocalTocadoPeloUsuario(true); setSalvo(false) }}
          placeholder="Rua, número, bairro, cidade"
          className="input"
        />
        <span className="text-slate-500 text-2xs block">
          Preenchido pelo endereço do pino no mapa abaixo — edite aqui se precisar corrigir algo.
        </span>
      </label>

      <div>
        <p className="text-sm font-semibold text-slate-800">Local do evento no mapa</p>
        <p className="text-xs text-slate-500 mt-0.5">
          Cada leitura do operador grava onde o aparelho estava. Leitura fora do círculo laranja continua
          valendo, mas fica marcada &quot;fora do local&quot; para a conferência (só administradores veem). Arraste
          o pino ou toque no mapa para ajustar.
        </p>
      </div>

      {/* O endereço — sempre em cima do mapa, como pedido. */}
      <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2 min-h-[2.75rem]">
        <MapPin className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
        <p className="text-sm text-slate-700 leading-snug">
          {!temPonto ? 'Nenhum local marcado ainda — toque no mapa ou use sua localização.'
            : buscandoEndereco ? 'Procurando o endereço…'
            : endereco ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
        </p>
      </div>

      <div ref={divRef} className="h-72 w-full rounded-xl overflow-hidden border border-slate-200" />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-600">Raio deste evento</span>
          <input
            type="number" inputMode="numeric" min={50} max={20000} step={50}
            value={raioM} onChange={e => setRaioM(Math.min(20000, Math.max(50, Number(e.target.value) || 800)))}
            className="input tabular-nums w-28"
          />
          <span className="text-xs text-slate-500">metros</span>
        </label>
        <button type="button" onClick={usarMinhaLocalizacao} disabled={buscandoGps} className="btn btn-secundario btn-sm">
          <Crosshair className="w-3.5 h-3.5" /> {buscandoGps ? 'Pegando…' : 'Usar minha localização atual'}
        </button>
        {temPonto && (
          <button type="button" onClick={() => { setTemPonto(false); setSalvo(false) }} className="text-slate-500 text-xs hover:underline">
            Remover local
          </button>
        )}
      </div>
      <p className="text-slate-400 text-2xs">
        Exemplos: um teatro pequeno cabe em 100–200 m; o Sambão e o Kleber Andrade, eventos grandes, passam de 2–5 km.
      </p>

      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={salvarLocal} disabled={isPending} className="btn btn-primario btn-sm">
          {isPending ? 'Salvando…' : 'Salvar localização'}
        </button>
        {salvo && (
          <span className="flex items-center gap-1 text-green-600 text-xs font-semibold">
            <Check className="w-3.5 h-3.5" /> Salvo
          </span>
        )}
      </div>
      {erro && <p className="text-red-600 text-xs">{erro}</p>}
    </div>
  )
}
