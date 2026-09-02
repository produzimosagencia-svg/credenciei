'use client'
import { useRef, useState, useTransition } from 'react'
import {
  Search, Camera as CameraIcon, X, CheckCircle2, User, AlertTriangle,
  MapPin, Clock, Building2, IdCard, ShieldCheck, Check, RotateCcw, UserSearch,
} from 'lucide-react'
import {
  localizarFuncionario, abrirFuncionarioLocalizado, registrarPresencaAssistida,
  type FuncionarioLocalizado, type CandidatoLocalizado, type MomentoPresenca,
} from '@/lib/actions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Secao, Cartao, EmptyState } from '@/components/ui/Superficie'

// Reduz a foto antes de enviar (mesmo padrão de CheckinPresenca.tsx)
function comprimir(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      const max = 640
      let { width, height } = img
      if (width > height && width > max) { height = Math.round((height * max) / width); width = max }
      else if (height >= width && height > max) { width = Math.round((width * max) / height); height = max }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('canvas'))
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', 0.7))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')) }
    img.src = url
  })
}

/** GPS é prova de auditoria, não requisito: se o aparelho negar, o registro segue. */
function pegarLocalizacao(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  })
}

/**
 * Máscara só quando o que a pessoa digita é número. Aplicar formatCpf sempre
 * destruiria um nome enquanto ele é digitado.
 */
function mascarar(valor: string): string {
  return /^[\d.\-\s]*$/.test(valor) ? formatCpf(valor) : valor
}

export default function LocalizarFuncionario() {
  const [termo, setTermo] = useState('')
  const [func, setFunc] = useState<FuncionarioLocalizado | null>(null)
  const [candidatos, setCandidatos] = useState<CandidatoLocalizado[] | null>(null)
  // A etapa que o operador escolhe — pré-marcada com a recomendação do
  // sistema (proximaPendente), mas livre para trocar. Ver o comentário em
  // registrarPresencaAssistida (lib/actions.ts) sobre por que a escolha é
  // dele, não mais automática.
  const [momento, setMomento] = useState<MomentoPresenca | null>(null)
  const [foto, setFoto] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<{ nome: string; etapa: string } | null>(null)
  const [buscando, startBusca] = useTransition()
  const [registrando, startRegistro] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  const recomecar = () => {
    setTermo(''); setFunc(null); setCandidatos(null); setMomento(null); setFoto(null); setErro(null); setSucesso(null)
  }

  const abrirFicha = (f: FuncionarioLocalizado) => {
    setFunc(f)
    // Sugestão pré-marcada; some se a pessoa já tem tudo registrado — aí o
    // operador escolhe manualmente qual corrigir.
    setMomento(f.proximaPendente?.momento ?? null)
    setFoto(null)
  }

  const buscar = (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null); setFunc(null); setCandidatos(null); setMomento(null); setFoto(null)
    startBusca(async () => {
      const res = await localizarFuncionario(termo)
      if (res.error) return setErro(res.error)
      if (res.candidatos) return setCandidatos(res.candidatos)
      abrirFicha(res.funcionario!)
    })
  }

  /** Escolheu alguém da lista: busca a ficha completa dessa pessoa. */
  const escolher = (id: string) => {
    setErro(null)
    startBusca(async () => {
      const res = await abrirFuncionarioLocalizado(id)
      if (res.error) return setErro(res.error)
      setCandidatos(null)
      abrirFicha(res.funcionario!)
    })
  }

  const onFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setFoto(await comprimir(file))
      setErro(null)
    } catch {
      setErro('Não foi possível processar essa foto. Tente tirar de novo.')
    }
  }

  const registrar = () => {
    if (!func || !momento || !foto) return
    setErro(null)
    startRegistro(async () => {
      const gps = await pegarLocalizacao()
      const res = await registrarPresencaAssistida(func.id, momento, {
        fotoBase64: foto,
        latitude: gps?.latitude,
        longitude: gps?.longitude,
        dispositivo: navigator.userAgent,
      })
      if (res.error) return setErro(res.error)
      setSucesso({ nome: res.nome ?? func.nome, etapa: res.etapa ?? '' })
    })
  }

  if (sucesso) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 shadow-sm">
        <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
        <div>
          <p className="text-slate-800 font-bold text-lg">Presença registrada</p>
          <p className="text-slate-500 text-sm mt-1">
            <strong>{sucesso.nome}</strong> — {sucesso.etapa.toLowerCase()}
          </p>
        </div>
        <p className="text-slate-400 text-xs">
          O registro ficou marcado como feito por você, com a foto, o horário e a localização.
        </p>
        <button onClick={recomecar} className="btn-press w-full btn btn-primario btn-lg">
          Localizar outra pessoa
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Busca por CPF ou nome */}
      <Secao
        tom="acento"
        icone={<UserSearch className="w-3.5 h-3.5" />}
        titulo="Buscar funcionário"
        descricao="Você só localiza pessoas dos setores sob sua responsabilidade"
        corpoClassName="p-5"
      >
        <form onSubmit={buscar} className="space-y-3" data-tutorial="loc-busca">
          <label className="text-sm font-medium text-slate-700 block">CPF ou nome do funcionário</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                required
                autoFocus
                value={termo}
                onChange={e => { setTermo(mascarar(e.target.value)); setErro(null) }}
                placeholder="000.000.000-00 ou Maria Silva"
                className="input pl-9 w-full"
                autoComplete="off"
              />
            </div>
            <button
              type="submit"
              disabled={buscando}
              className="btn-press shrink-0 flex items-center gap-1.5 btn btn-primario"
            >
              {buscando ? 'Buscando...' : 'Buscar'}
            </button>
          </div>
        </form>
      </Secao>

      {/* Nada buscado ainda: sem isto a tela parece vazia embaixo do cartão de
          busca, um retângulo branco boiando num fundo cinza enorme. */}
      {!termo && !candidatos && !func && !erro && (
        <Cartao padding="nenhum">
          <EmptyState
            icone={<UserSearch className="w-8 h-8" />}
            titulo="Busque para começar"
            descricao="Digite o CPF ou o nome de quem perdeu o horário. A ficha e a etapa pendente aparecem aqui."
          />
        </Cartao>
      )}

      {/* Nome quase nunca é único: quem escolhe a pessoa certa é o supervisor. */}
      {candidatos && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <p className="text-slate-500 text-xs font-semibold px-4 py-3 border-b border-slate-100 bg-slate-50">
            {candidatos.length} pessoas encontradas — toque em quem você está atendendo
          </p>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {candidatos.map(c => (
              <button
                key={c.id}
                onClick={() => escolher(c.id)}
                disabled={buscando}
                className="btn-press w-full text-left px-4 py-3 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-slate-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800 text-sm font-semibold truncate">{c.nome}</p>
                  <p className="text-slate-400 text-2xs tabular-nums">
                    {formatCpf(c.cpf)}{c.cargo ? ` • ${c.cargo}` : ''}
                  </p>
                  <p className="text-slate-400 text-2xs truncate">{c.setorNome} • {c.eventoNome}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {erro && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <p className="text-red-600 text-xs font-medium">{erro}</p>
        </div>
      )}

      {func && (
        <>
          {/* Ficha da pessoa */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4" data-tutorial="loc-ficha">
            <div className="flex items-start gap-3">
              {func.fotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={func.fotoUrl} alt={func.nome} className="w-16 h-16 rounded-2xl object-cover border border-slate-200 shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
                  <User className="w-7 h-7 text-slate-300" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-slate-800 font-bold leading-tight">{func.nome}</p>
                <p className="text-slate-400 text-xs mt-0.5 tabular-nums">{formatCpf(func.cpf)}</p>
                <span className={`inline-block mt-1.5 text-2xs px-2 py-0.5 rounded-full font-semibold ${func.ativo ? 'bg-green-100 text-green-700' : 'bg-red-50 text-red-600'}`}>
                  {func.ativo ? 'Ativo' : 'Não ativado'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs border-t border-slate-100 pt-3">
              <Dado icone={IdCard} rotulo="Cargo" valor={func.cargo || '—'} />
              <Dado icone={Building2} rotulo="Setor" valor={func.setorNome} />
              <Dado icone={ShieldCheck} rotulo="Supervisor" valor={func.supervisorNome || '—'} />
              <Dado
                icone={Clock}
                rotulo="Última batida"
                valor={func.ultimaBatida ? `${func.ultimaBatida.rotulo} • ${formatarBR(func.ultimaBatida.quandoISO, 'curto')}` : 'Nenhuma ainda'}
              />
              <Dado icone={MapPin} rotulo="Evento" valor={func.eventoNome} />
            </div>

          </div>

          {func.ativo && (
            <>
              {/* Seletor de etapa — o operador escolhe, o sistema só sugere.
                  Ver o comentário em registrarPresencaAssistida. */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3" data-tutorial="loc-etapa">
                <p className="text-sm font-medium text-slate-700">Que batida é esta?</p>
                <div className="grid grid-cols-3 gap-2">
                  {func.etapas.map(e => {
                    const feita = !!e.quandoISO
                    const ativo = momento === e.momento
                    return (
                      <button
                        key={e.momento}
                        type="button"
                        onClick={() => setMomento(e.momento)}
                        className={`btn-press rounded-xl border p-2.5 text-left transition-colors ${
                          ativo
                            ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className="flex items-center gap-1 text-xs font-semibold text-slate-800">
                          {feita && <Check className="w-3 h-3 text-green-500 shrink-0" />}
                          {e.rotulo}
                        </span>
                        <span className="block text-2xs text-slate-400 mt-0.5">
                          {feita ? formatarBR(e.quandoISO!, 'curto') : 'pendente'}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {momento && func.etapas.find(e => e.momento === momento)?.quandoISO && (
                  <p className="flex items-start gap-1.5 text-amber-700 text-2xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    <RotateCcw className="w-3.5 h-3.5 shrink-0 mt-px" />
                    Esta etapa já tem registro — confirmar substitui o horário anterior por agora.
                  </p>
                )}
              </div>

              {/* Foto de validação */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3" data-tutorial="loc-foto">
                <div>
                  <p className="text-sm font-medium text-slate-700">Validar funcionário</p>
                  <p className="text-slate-400 text-2xs mt-0.5">
                    Tire uma foto do rosto da pessoa agora. É ela que comprova que o colaborador estava na sua frente.
                  </p>
                </div>
                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFoto} />
                {foto ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={foto} alt="Foto tirada agora" className="w-20 h-20 rounded-xl object-cover border border-slate-200" />
                    <button type="button" onClick={() => setFoto(null)} className="text-xs text-red-500 hover:underline flex items-center gap-1">
                      <X className="w-3 h-3" /> Tirar de novo
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    className="btn-press w-full flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl py-4 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
                  >
                    <CameraIcon className="w-4 h-4" /> Abrir câmera
                  </button>
                )}
              </div>

              <button
                onClick={registrar}
                disabled={!momento || !foto || registrando}
                data-tutorial="loc-registrar"
                className="btn btn-primario btn-lg w-full"
              >
                {registrando
                  ? 'Registrando...'
                  : momento
                    ? `Registrar batida — ${func.etapas.find(e => e.momento === momento)?.rotulo}`
                    : 'Escolha a etapa acima'}
              </button>
              {momento && !foto && <p className="text-slate-400 text-2xs text-center">Tire a foto para liberar o registro.</p>}
            </>
          )}

          {!func.ativo && (
            <p className="text-xs text-red-500 text-center">
              Esta pessoa ainda não foi ativada no evento. Ative no painel do setor antes de registrar a presença.
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Dado({ icone: Icone, rotulo, valor }: { icone: React.ElementType; rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-slate-400 flex items-center gap-1 text-2xs">
        <Icone className="w-3 h-3 shrink-0" /> {rotulo}
      </p>
      <p className="text-slate-700 font-medium truncate">{valor}</p>
    </div>
  )
}
