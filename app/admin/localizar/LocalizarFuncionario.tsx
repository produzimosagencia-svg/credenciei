'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import {
  Search, Camera as CameraIcon, X, CheckCircle2, User, AlertTriangle,
  MapPin, Clock, Building2, IdCard, ShieldCheck, Check, RotateCcw, UserSearch, ScanFace, ChevronLeft, ChevronRight, LayoutGrid,
  CloudOff, CloudUpload,
} from 'lucide-react'
import {
  localizarFuncionario, abrirFuncionarioLocalizado, listarPessoasDoEvento, registrarPresencaAssistida, lancarEntradaNaoBatida, metodoIdentificacaoDoEvento,
  type FuncionarioLocalizado, type CandidatoLocalizado, type MomentoPresenca, type PessoaDaLista,
} from '@/lib/actions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Secao, Cartao, EmptyState } from '@/components/ui/Superficie'
import CadastroBiometrico from '@/components/CadastroBiometrico'
import { useLocalizacaoOperador, BloqueioSemLocalizacao } from '@/components/LocalizacaoOperador'
import AvisoFilaSemInternet, { useFilaSemInternet } from '@/components/FilaSemInternet'
import ModoSemInternet from '@/components/ModoSemInternet'
import CampoHoraDeEntrada from '@/components/CampoHoraDeEntrada'
import { percebeuSemRede } from '@/lib/rede-do-portao'
import {
  guardarNaFila, guardarNaFilaJuntos, pessoaPeloCpf, pessoasPeloNome, motivoDaSituacao, agoraCerto, idNovo, entradaInformadaParaSaida, situacaoDeEntrada, anotarBatida,
  horaDeEntradaValida, type PessoaParaSemInternet, type SituacaoDeEntrada,
} from '@/lib/fila-offline'

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

/**
 * Máscara só quando o que a pessoa digita é número. Aplicar formatCpf sempre
 * destruiria um nome enquanto ele é digitado.
 */
function mascarar(valor: string): string {
  return /^[\d.\-\s]*$/.test(valor) ? formatCpf(valor) : valor
}

export default function LocalizarFuncionario({ eventoId, soMeio = false }: { eventoId: string; soMeio?: boolean }) {
  /*
   * Localização do aparelho de quem tira a foto: OBRIGATÓRIA (pedido do Juan, 08/10/2026) — antes era "se o
   * aparelho deixar". Vai junto do registro e marca, internamente, se foi feito fora do local do evento.
   */
  const localizacao = useLocalizacaoOperador()
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
  // Saída recusada por falta de entrada no turno: o operador informa a hora da entrada (Juan, 18/10/2026).
  const [semEntrada, setSemEntrada] = useState(false)
  const [horaEntrada, setHoraEntrada] = useState('')
  const [sucesso, setSucesso] = useState<{ nome: string; etapa: string; guardada?: boolean; aviso?: string } | null>(null)
  /*
   * SEM INTERNET (Juan, 18/10/2026): a busca usa a lista do evento guardada no aparelho (CPF completo ou nome), e a
   * batida — com a foto — fica guardada e sobe sozinha quando a internet voltar. Ver lib/fila-offline.ts.
   */
  const fila = useFilaSemInternet(eventoId)
  const [semNet, setSemNet] = useState<PessoaParaSemInternet | null>(null)
  // Saída sem internet de quem não bateu a entrada (Juan, 19/10/2026): o operador informa a hora e as duas ficam na fila.
  const [informandoEntradaSemNet, setInformandoEntradaSemNet] = useState(false)
  // Se a pessoa já tem entrada, como o aparelho enxerga (lista guardada + fila) — ver `situacaoDeEntrada`.
  const [situacaoSemNet, setSituacaoSemNet] = useState<SituacaoDeEntrada | null>(null)
  const [candidatosSemNet, setCandidatosSemNet] = useState<PessoaParaSemInternet[] | null>(null)
  const [buscando, startBusca] = useTransition()
  const [registrando, startRegistro] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)

  // Biometria: só oferece o cadastro quando o EVENTO desta pessoa usa
  // biometria — consulta à parte, tolerante (ver `metodoIdentificacaoDoEvento`).
  const [metodoEvento, setMetodoEvento] = useState<string>('qr')
  const [cadastrandoBiometria, setCadastrandoBiometria] = useState(false)
  useEffect(() => {
    // Sem pessoa aberta a ficha inteira some da tela (ver `{func && (...)}`
    // abaixo), botão de biometria incluso — não precisa zerar o estado aqui.
    if (func?.eventoId) metodoIdentificacaoDoEvento(func.eventoId).then(setMetodoEvento)
  }, [func?.eventoId])

  const recomecar = () => {
    setTermo(''); setFunc(null); setCandidatos(null); setMomento(null); setFoto(null); setErro(null); setSucesso(null)
    setSemNet(null); setCandidatosSemNet(null); setInformandoEntradaSemNet(false); setHoraEntrada('')
  }

  const abrirSemNet = (p: PessoaParaSemInternet) => {
    setCandidatosSemNet(null)
    setSemNet(p)
    setMomento('entrada')
    setFoto(null)
    setInformandoEntradaSemNet(false)
    setHoraEntrada('')
    setSituacaoSemNet(null)
    // O aparelho diz se ela já tem entrada; sem entrada, a hora já abre para ser informada na saída.
    void situacaoDeEntrada(eventoId, p.id).then(sit => {
      setSituacaoSemNet(sit)
      setInformandoEntradaSemNet(sit.tipo === 'sem_entrada')
    }).catch(() => {})
  }

  /** A busca sem internet: CPF completo (pelo resumo guardado) ou parte do nome. */
  const buscarSemInternet = async (t: string) => {
    percebeuSemRede()
    const digitos = t.replace(/\D/g, '')
    if (digitos.length === 11) {
      const p = await pessoaPeloCpf(eventoId, digitos).catch(() => null)
      if (p) return abrirSemNet(p)
      return setErro(fila.pacote
        ? 'Sem internet, e este CPF não está na lista guardada neste aparelho. Confira o número, ou busque pelo nome.'
        : 'Sem internet, e a lista do evento ainda não foi guardada neste aparelho. Quando a internet voltar, abra esta tela uma vez para guardar.')
    }
    const lista = await pessoasPeloNome(eventoId, t).catch(() => [] as PessoaParaSemInternet[])
    if (!lista.length) {
      return setErro(fila.pacote
        ? 'Sem internet: ninguém com esse nome na lista guardada neste aparelho. Busque pelo CPF completo.'
        : 'Sem internet, e a lista do evento ainda não foi guardada neste aparelho. Quando a internet voltar, abra esta tela uma vez para guardar.')
    }
    if (lista.length === 1) return abrirSemNet(lista[0])
    setCandidatosSemNet(lista)
  }

  /** Guarda a batida no aparelho, com a hora certa (a do servidor), a foto e a localização de agora. */
  const guardarBatida = async (p: { id: string; nome: string; equipe: string | null }, etapa: 'entrada' | 'fim', fotoDaBatida: string, horaDaEntrada?: string) => {
    try {
      const lidoEm = agoraCerto().toISOString()
      const batida = {
        id: idNovo(), eventoId, tipo: 'assistido' as const, funcionarioId: p.id, momento: etapa,
        lidoEm, local: localizacao.atual(), foto: fotoDaBatida, dispositivo: navigator.userAgent,
        nome: p.nome, equipe: p.equipe,
      }
      // A entrada informada e a saída entram juntas na fila, ou nenhuma das duas.
      if (horaDaEntrada && etapa === 'fim') {
        await guardarNaFilaJuntos([
          entradaInformadaParaSaida({ eventoId, pessoaId: p.id, nome: p.nome, equipe: p.equipe, hora: horaDaEntrada, saidaLidaEm: lidoEm, via: 'assistido' }),
          batida,
        ])
      } else {
        await guardarNaFila(batida)
      }
      setSucesso({
        nome: p.nome, guardada: true,
        etapa: horaDaEntrada && etapa === 'fim' ? `Entrada às ${horaDaEntrada} (informada) e saída` : etapa === 'entrada' ? 'Entrada' : 'Saída',
      })
    } catch {
      setErro('Sem internet e não foi possível guardar neste aparelho (navegador em modo anônimo?). Registre quando a internet voltar.')
    }
  }

  const abrirFicha = (f: FuncionarioLocalizado) => {
    setFunc(f)
    setSemEntrada(false)
    setHoraEntrada('')
    // Sugestão pré-marcada; some se a pessoa já tem tudo registrado — aí o
    // operador escolhe manualmente qual corrigir.
    setMomento(soMeio ? (f.etapas.some(e => e.momento === 'meio') ? 'meio' : null) : (f.proximaPendente?.momento ?? null))
    setFoto(null)
  }

  const buscar = (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null); setFunc(null); setCandidatos(null); setMomento(null); setFoto(null); setSemNet(null); setCandidatosSemNet(null)
    if (navigator.onLine === false) { void buscarSemInternet(termo); return }
    startBusca(async () => {
      let res: Awaited<ReturnType<typeof localizarFuncionario>>
      try {
        res = await localizarFuncionario(termo, eventoId)
      } catch {
        // O pedido não chegou: busca na lista guardada no aparelho.
        return buscarSemInternet(termo)
      }
      if (res.error) return setErro(res.error)
      if (res.candidatos) return setCandidatos(res.candidatos)
      abrirFicha(res.funcionario!)
    })
  }

  /** Escolheu alguém da lista: busca a ficha completa dessa pessoa. */
  const escolher = (id: string) => {
    setErro(null)
    startBusca(async () => {
      let res: Awaited<ReturnType<typeof abrirFuncionarioLocalizado>>
      try {
        res = await abrirFuncionarioLocalizado(id)
      } catch {
        percebeuSemRede()
        return setErro('Sem internet agora. Busque a pessoa de novo pelo CPF completo ou pelo nome — a busca sem internet usa a lista guardada neste aparelho.')
      }
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
    setSemEntrada(false)
    startRegistro(async () => {
      const gps = localizacao.atual()
      let res: Awaited<ReturnType<typeof registrarPresencaAssistida>>
      try {
        res = await registrarPresencaAssistida(func.id, momento, {
          fotoBase64: foto,
          latitude: gps?.latitude,
          longitude: gps?.longitude,
          precisao: gps?.precisao ?? undefined,
          dispositivo: navigator.userAgent,
        })
      } catch {
        // A internet caiu ao registrar: entrada e saída ficam guardadas no aparelho (o meio precisa de internet).
        percebeuSemRede()
        if (momento === 'meio') return setErro('Sem internet agora. O meio só pode ser registrado com internet — tente de novo em instantes.')
        return guardarBatida({ id: func.id, nome: func.nome, equipe: func.setorNome }, momento, foto)
      }
      if (res.error) {
        setSemEntrada(res.semEntrada === true)
        return setErro(res.error)
      }
      // O aparelho anota a batida feita aqui: se a internet cair, sabe que a pessoa já tem entrada (ou já saiu).
      if (momento === 'entrada' || momento === 'fim') void anotarBatida(eventoId, func.id, momento)
      setSucesso({ nome: res.nome ?? func.nome, etapa: res.etapa ?? '', aviso: res.aviso })
    })
  }

  /* "Lançar a entrada e registrar a saída": lança a entrada que faltou, na hora informada, e registra a saída (com a mesma foto). */
  const lancarEntradaERegistrarSaida = () => {
    if (!func || !foto || !horaEntrada) return
    setErro(null)
    startRegistro(async () => {
      const r = await lancarEntradaNaoBatida(func.id, horaEntrada)
      if ('error' in r) return setErro(r.error)
      const gps = localizacao.atual()
      const res = await registrarPresencaAssistida(func.id, 'fim', {
        fotoBase64: foto, latitude: gps?.latitude, longitude: gps?.longitude, precisao: gps?.precisao ?? undefined, dispositivo: navigator.userAgent,
      })
      if (res.error) return setErro(`A entrada das ${horaEntrada} foi lançada, mas a saída não: ${res.error}`)
      setSemEntrada(false)
      void anotarBatida(eventoId, func.id, 'fim')
      setSucesso({ nome: res.nome ?? func.nome, etapa: `Entrada às ${horaEntrada} (lançada) e saída` })
    })
  }

  if (sucesso) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3 shadow-sm">
        <ModoSemInternet eventoId={eventoId} />
        {sucesso.guardada
          ? <CloudUpload className="w-14 h-14 text-teal-600 mx-auto" />
          : <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />}
        <div>
          <p className="text-slate-800 font-bold text-lg">{sucesso.guardada ? 'Guardada sem internet' : 'Presença registrada'}</p>
          <p className="text-slate-500 text-sm mt-1">
            <strong>{sucesso.nome}</strong> — {sucesso.etapa.toLowerCase()}
          </p>
        </div>
        {sucesso.aviso && (
          <p className="text-amber-800 text-sm font-semibold bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">⚠ {sucesso.aviso}</p>
        )}
        <p className="text-slate-400 text-xs">
          {sucesso.guardada
            ? 'Ficou neste aparelho com a hora de agora, a foto e a localização, e sobe sozinha quando a internet voltar. Se o sistema recusar, aparece em "não entraram" no aviso desta tela.'
            : 'O registro ficou marcado como feito por você, com a foto, o horário e a localização.'}
        </p>
        <button onClick={recomecar} className="btn-press w-full btn btn-primario btn-lg">
          Localizar outra pessoa
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {localizacao.bloqueado && <BloqueioSemLocalizacao estado={localizacao.estado} onTentar={localizacao.tentarDeNovo} />}
      <ModoSemInternet eventoId={eventoId} />
      <AvisoFilaSemInternet estado={fila} />
      {/* Busca por CPF ou nome */}
      <Secao
        tom="acento"
        icone={<UserSearch className="w-3.5 h-3.5" />}
        titulo="Buscar funcionário"
        descricao="Você só localiza pessoas dos fornecedores sob sua responsabilidade"
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
                placeholder="CPF, nome ou telefone"
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

      {/* Nada buscado ainda: a lista do evento (30 por página, em ordem alfabética) — antes era um retângulo
          vazio, e quem não lembrava o nome exato não tinha por onde começar (pedido do Juan, 08/10/2026). */}
      {!termo && !candidatos && !func && !erro && !fila.semInternet && (
        <ListaDoEvento eventoId={eventoId} aoEscolher={escolher} desabilitado={buscando} />
      )}

      {/* Sem internet: a lista guardada no aparelho achou mais de uma pessoa com esse nome. */}
      {candidatosSemNet && (
        <div className="bg-white border border-amber-200 rounded-2xl shadow-sm overflow-hidden">
          <p className="text-amber-800 text-xs font-semibold px-4 py-3 border-b border-amber-100 bg-amber-50 flex items-center gap-1.5">
            <CloudOff className="w-3.5 h-3.5 shrink-0" /> Sem internet — {candidatosSemNet.length} pessoas na lista guardada. Toque em quem você está atendendo.
          </p>
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {candidatosSemNet.map(c => (
              <button key={c.id} type="button" onClick={() => abrirSemNet(c)} className="btn-press w-full text-left px-4 py-3 hover:bg-slate-50 flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-slate-300" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800 text-sm font-semibold truncate">{c.nome}</p>
                  <p className="text-slate-400 text-2xs truncate">{c.equipe}{c.cargo ? ` • ${c.cargo}` : ''}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Sem internet: a ficha que a lista guardada conhece — só entrada e saída, com foto, guardadas no aparelho. */}
      {semNet && (() => {
        const impedimento = motivoDaSituacao(semNet.situacao)
        const etapa = momento === 'fim' ? 'fim' : 'entrada'
        return (
          <div className="bg-white border border-amber-300 rounded-2xl p-5 shadow-sm space-y-4">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-2xs font-extrabold tracking-wide">
              <CloudOff className="w-3.5 h-3.5" /> SEM INTERNET — LISTA GUARDADA NO APARELHO
            </p>
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center shrink-0">
                <User className="w-6 h-6 text-slate-300" />
              </div>
              <div className="min-w-0">
                <p className="text-slate-800 font-bold leading-tight">{semNet.nome}</p>
                <p className="text-slate-500 text-xs mt-0.5">{semNet.equipe}{semNet.cargo ? ` • ${semNet.cargo}` : ''}</p>
              </div>
            </div>
            {impedimento ? (
              <p className="text-red-700 text-sm font-semibold bg-red-50 border border-red-200 rounded-xl px-3 py-2">{impedimento} Não registre.</p>
            ) : soMeio ? (
              <p className="text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Sem internet, o meio não pode ser registrado. Registre quando a internet voltar.</p>
            ) : (
              <>
                <div>
                  <p className="text-sm font-medium text-slate-700 mb-2">Que batida é esta?</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['entrada', 'fim'] as const).map(m => (
                      <button
                        key={m} type="button" onClick={() => setMomento(m)}
                        className={`btn-press rounded-xl border p-3 text-sm font-semibold transition-colors ${
                          etapa === m ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500 text-slate-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {m === 'entrada' ? 'Entrada' : 'Saída'}
                      </button>
                    ))}
                  </div>
                </div>
                {/* O aparelho diz se a pessoa já tem entrada (lista guardada + fila). Na saída de quem não tem, a hora já abre. */}
                {(() => {
                  const sit = situacaoSemNet
                  const conferido = sit && sit.tipo !== 'desconhecida' && sit.conferidoEm ? ` (conferido às ${formatarBR(sit.conferidoEm, 'hora')})` : ''
                  if (sit?.tipo === 'com_entrada') {
                    return etapa === 'fim'
                      ? <p className="text-green-800 text-sm font-semibold bg-green-50 border border-green-200 rounded-xl px-3 py-2">✓ Entrada registrada às {formatarBR(sit.em, 'hora')}{conferido}.</p>
                      : <p className="text-amber-900 text-sm font-semibold bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">⚠ Já tem entrada às {formatarBR(sit.em, 'hora')}{conferido}. Se está saindo, escolha Saída.</p>
                  }
                  if (sit?.tipo === 'ja_saiu') {
                    return etapa === 'fim'
                      ? <p className="text-amber-900 text-sm font-semibold bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">⚠ Saída já registrada às {formatarBR(sit.em, 'hora')}{conferido}. Esta pode ser repetida.</p>
                      : null
                  }
                  if (etapa !== 'fim') return null
                  const semEntradaAqui = sit?.tipo === 'sem_entrada'
                  return (
                    <div className={`rounded-xl border p-3 space-y-2 ${semEntradaAqui ? 'border-red-300 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
                      {semEntradaAqui && <p className="text-red-800 text-sm font-bold">⚠ SEM ENTRADA REGISTRADA{conferido}. Informe a hora em que {semNet.nome.split(' ')[0]} entrou.</p>}
                      {!informandoEntradaSemNet ? (
                        <button type="button" onClick={() => setInformandoEntradaSemNet(true)} className="w-full text-left text-amber-900 text-sm font-semibold">
                          A pessoa não bateu a entrada? Informar a hora →
                        </button>
                      ) : (
                        <>
                          <label htmlFor="hora-entrada-semnet" className="text-sm font-semibold text-slate-800 block">Que horas {semNet.nome.split(' ')[0]} entrou? *</label>
                          <CampoHoraDeEntrada id="hora-entrada-semnet" valor={horaEntrada} aoMudar={setHoraEntrada} />
                          <p className="text-slate-500 text-2xs">
                            A entrada fica marcada como lançada à mão, com o seu nome, e a saída é guardada agora, com a foto. As duas sobem juntas quando a internet voltar.
                          </p>
                          <button type="button" onClick={() => { setInformandoEntradaSemNet(false); setHoraEntrada('') }} className="text-slate-500 text-xs font-semibold underline-offset-2 hover:underline">
                            Ela já entrou — guardar só a saída
                          </button>
                        </>
                      )}
                    </div>
                  )
                })()}
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
                    type="button" onClick={() => fileRef.current?.click()}
                    className="btn-press w-full flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl py-4 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
                  >
                    <CameraIcon className="w-4 h-4" /> Tirar a foto do rosto
                  </button>
                )}
                {(() => {
                  const podeInformar = !situacaoSemNet || situacaoSemNet.tipo === 'sem_entrada' || situacaoSemNet.tipo === 'desconhecida'
                  const comEntrada = etapa === 'fim' && informandoEntradaSemNet && podeInformar
                  return (
                    <button
                      type="button" disabled={!foto || (comEntrada && !horaDeEntradaValida(horaEntrada))}
                      onClick={() => foto && void guardarBatida({ id: semNet.id, nome: semNet.nome, equipe: semNet.equipe }, etapa, foto, comEntrada ? horaEntrada : undefined)}
                      className="btn btn-primario btn-lg w-full disabled:opacity-60"
                    >
                      Guardar {etapa === 'entrada' ? 'entrada' : comEntrada ? 'entrada e saída' : 'saída'} neste aparelho
                    </button>
                  )
                })()}
                <p className="text-slate-400 text-2xs text-center">
                  Vale a hora de agora. O sistema confere tudo quando a internet voltar — o que não puder entrar aparece em &ldquo;não entraram&rdquo;.
                </p>
              </>
            )}
            <button type="button" onClick={recomecar} className="w-full text-center text-slate-500 text-xs font-semibold hover:text-slate-700">
              Buscar outra pessoa
            </button>
          </div>
        )
      })()}

      {/* Nome quase nunca é único: quem escolhe a pessoa certa é o supervisor. */}
      {candidatos && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <p className="text-slate-500 text-xs font-semibold px-4 py-3 border-b border-slate-100 bg-slate-50">
            {candidatos.some(c => c.cpfAproximado)
              ? `CPF exato não encontrado — ${candidatos.length} cadastro${candidatos.length === 1 ? '' : 's'} parecido${candidatos.length === 1 ? '' : 's'}. Confirme pelo nome antes de continuar.`
              : `${candidatos.length} pessoas encontradas — toque em quem você está atendendo`}
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
                  <p className="text-slate-400 text-2xs truncate">{c.areaNome ? `${c.areaNome} › ` : ''}{c.setorNome} • {c.eventoNome}</p>
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
      {/* A hora da entrada, editável: aparece quando a saída foi recusada por falta de entrada — e JÁ ao escolher Saída para quem
          não tem entrada no turno (Juan, 19/10/2026), sem precisar tomar a recusa antes. */}
      {func && func.ativo && !soMeio && (semEntrada || (momento === 'fim' && !func.turnoFechado && !func.etapas.find(e => e.momento === 'entrada')?.quandoISO)) && (
        <div className="bg-white border border-brand-200 rounded-2xl p-4 space-y-2.5 shadow-sm">
          <p className="text-sm font-semibold text-slate-800">Que horas {func.nome.split(' ')[0]} entrou?</p>
          <p className="text-slate-500 text-xs -mt-1">Não há entrada registrada neste turno. Informe a hora para lançar a entrada junto com a saída.</p>
          <CampoHoraDeEntrada id="hora-entrada-online" valor={horaEntrada} aoMudar={setHoraEntrada} />
          <button
            type="button" onClick={lancarEntradaERegistrarSaida} disabled={!horaEntrada || !foto || registrando}
            className="btn-press w-full btn btn-primario disabled:opacity-60"
          >
            {registrando ? 'Registrando…' : 'Lançar a entrada e registrar a saída'}
          </button>
          <p className="text-slate-400 text-2xs">A entrada fica marcada como lançada à mão, com o seu nome. A saída é registrada agora, com a foto.</p>
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
              {/* A área vem primeiro: é o que o portão confere (pedido do Juan, 11/10/2026). */}
              {(func.areas?.length ?? 0) > 0
                ? <Dado icone={LayoutGrid} rotulo={func.areas!.length > 1 ? 'Áreas' : 'Área'} valor={func.areas!.join(' · ')} />
                : func.areaNome && <Dado icone={LayoutGrid} rotulo="Área" valor={func.areaNome} />}
              <Dado icone={Building2} rotulo="Fornecedor" valor={func.setorNome} />
              <Dado icone={IdCard} rotulo="Cargo" valor={func.cargo || '—'} />
              <Dado icone={ShieldCheck} rotulo="Supervisor" valor={func.supervisorNome || '—'} />
              <Dado
                icone={Clock}
                rotulo="Última batida"
                valor={func.ultimaBatida ? `${func.ultimaBatida.rotulo} • ${formatarBR(func.ultimaBatida.quandoISO, 'curto')}` : 'Nenhuma ainda'}
              />
              <Dado icone={MapPin} rotulo="Evento" valor={func.eventoNome} />
            </div>

            {/*
              * Cadastro assistido de biometria — só aparece quando o EVENTO
              * usa biometria (qualquer um dos dois modos). O consentimento
              * de verdade é pedido dentro de `CadastroBiometrico`, pra PESSOA,
              * não aqui — este botão só abre a tela.
              */}
            {(metodoEvento === 'biometria' || metodoEvento === 'biometria_qr') && (
              <button
                type="button"
                onClick={() => setCadastrandoBiometria(true)}
                className="btn-press w-full flex items-center justify-center gap-1.5 border border-dashed border-slate-300 rounded-xl py-2.5 text-xs font-semibold text-slate-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
              >
                <ScanFace className="w-3.5 h-3.5" /> Cadastrar biometria facial
              </button>
            )}
          </div>

          {cadastrandoBiometria && (
            <CadastroBiometrico
              funcionarioId={func.id}
              eventoId={func.eventoId}
              nome={func.nome}
              aoFechar={() => setCadastrandoBiometria(false)}
            />
          )}

          {func.ativo && (() => {
            /*
             * Já entrou E saiu hoje → a pessoa pode estar VOLTANDO ao trabalho
             * (pedido do Juan, 26/09/2026). "Adicionar mais uma entrada" manda
             * uma entrada, e o servidor (`registrarPresencaAssistida`) trata
             * como volta: a saída vira pausa no histórico e o turno reabre com
             * a chegada original — nada é sobrescrito. Sem limite de voltas.
             */
            const entradaFeita = func.etapas.find(e => e.momento === 'entrada')?.quandoISO ?? null
            const saidaFeita = func.etapas.find(e => e.momento === 'fim')?.quandoISO ?? null
            const jaSaiu = !!entradaFeita && !!saidaFeita && saidaFeita > entradaFeita
            const ehVolta = jaSaiu && momento === 'entrada'
            return (
            <>
              {/* O turno que acabou de fechar: sem isto, depois da saída a ficha aparecia zerada e parecia que a pessoa nem
                  tinha entrado (madrugada de 11/10/2026, VITAL). */}
              {func.turnoFechado && (
                <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3 text-sm">
                  <p className="text-green-800 font-semibold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Turno de {func.turnoFechado.dataRef.slice(8, 10)}/{func.turnoFechado.dataRef.slice(5, 7)} já registrado
                  </p>
                  <p className="text-green-700 text-xs mt-1">
                    {func.turnoFechado.batidas.map(b => `${b.rotulo} ${formatarBR(b.quandoISO, 'curto')}`).join(' · ')}
                  </p>
                  <p className="text-green-700/80 text-xs mt-1">As batidas abaixo são do dia de hoje. Se ela está indo embora agora, a saída já está registrada.</p>
                </div>
              )}

              {/* Seletor de etapa — o operador escolhe, o sistema só sugere.
                  Ver o comentário em registrarPresencaAssistida. */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-3" data-tutorial="loc-etapa">
                <p className="text-sm font-medium text-slate-700">Que batida é esta?</p>
                {/* Equipe sem batida de meio: só entrada e saída (Juan, 18/10/2026) — o supervisor, que só bate o meio, é avisado. */}
                {soMeio && !func.etapas.some(e => e.momento === 'meio') && (
                  <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Esta equipe não tem batida de meio — só entrada e saída, que são registradas pelo portão.</p>
                )}
                <div className={`grid gap-2 ${soMeio ? 'grid-cols-1' : func.etapas.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
                  {func.etapas.filter(e => !soMeio || e.momento === 'meio').map(e => {
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
                {jaSaiu && !soMeio && (
                  <button
                    type="button"
                    onClick={() => setMomento('entrada')}
                    className={`btn-press w-full rounded-xl border-2 border-dashed p-3 text-sm font-bold transition-colors ${
                      ehVolta
                        ? 'border-green-500 bg-green-50 text-green-700'
                        : 'border-green-400 text-green-700 hover:bg-green-50'
                    }`}
                  >
                    + Adicionar mais uma entrada
                    <span className="block text-2xs font-medium text-green-600 mt-0.5">A pessoa saiu e está voltando ao trabalho</span>
                  </button>
                )}
                {ehVolta ? (
                  <p className="flex items-start gap-1.5 text-green-700 text-2xs bg-green-50 border border-green-200 rounded-lg px-2.5 py-2">
                    <Check className="w-3.5 h-3.5 shrink-0 mt-px" />
                    Nova entrada agora. A saída das {formatarBR(saidaFeita!, 'hora')} fica no histórico como pausa — nada é apagado.
                  </p>
                ) : momento && func.etapas.find(e => e.momento === momento)?.quandoISO && (
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
                  : ehVolta
                    ? 'Registrar batida — Nova entrada (voltou ao trabalho)'
                    : momento
                      ? `Registrar batida — ${func.etapas.find(e => e.momento === momento)?.rotulo}`
                      : 'Escolha a etapa acima'}
              </button>
              {momento && !foto && <p className="text-slate-400 text-2xs text-center">Tire a foto para liberar o registro.</p>}
            </>
            )
          })()}

          {!func.ativo && (
            <p className="text-xs text-red-500 text-center">
              Esta pessoa ainda não foi ativada no evento. Ative no painel do fornecedor antes de registrar a presença.
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

/** A lista paginada de quem está no evento — tocar numa pessoa abre a ficha dela, como no resultado da busca. */
function ListaDoEvento({ eventoId, aoEscolher, desabilitado }: {
  eventoId: string
  aoEscolher: (id: string) => void
  desabilitado: boolean
}) {
  const [pagina, setPagina] = useState(1)
  const [dados, setDados] = useState<{ pessoas: PessoaDaLista[]; total: number; paginas: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    let vivo = true
    // O estado de "carregando" liga no clique que muda a página; aqui só desliga ao chegar a resposta.
    listarPessoasDoEvento(eventoId, pagina).then(r => {
      if (!vivo) return
      if ('error' in r) { setErro(r.error); setDados(null) } else { setErro(null); setDados(r) }
      setCarregando(false)
    }).catch(() => { if (vivo) { setErro('Não foi possível carregar a lista agora.'); setCarregando(false) } })
    return () => { vivo = false }
  }, [eventoId, pagina])

  const irPara = (p: number) => { setCarregando(true); setPagina(p) }

  if (erro) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
        <p className="text-red-600 text-xs font-medium">{erro}</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      <p className="text-slate-500 text-xs font-semibold px-4 py-3 border-b border-slate-100 bg-slate-50">
        {dados
          ? `Pessoas do evento — ${dados.total} no total. Toque em quem você está atendendo, ou busque acima.`
          : 'Carregando as pessoas do evento…'}
      </p>

      {dados && dados.total === 0 && (
        <EmptyState icone={<UserSearch className="w-8 h-8" />} titulo="Ninguém credenciado ainda" descricao="Quando houver pessoas neste evento, elas aparecem aqui." />
      )}

      <div className={`divide-y divide-slate-100 transition-opacity ${carregando ? 'opacity-50' : ''}`}>
        {(dados?.pessoas ?? []).map(p => (
          <button
            key={p.id}
            type="button"
            onClick={() => aoEscolher(p.id)}
            disabled={desabilitado || carregando}
            className="btn-press w-full text-left px-4 py-3 hover:bg-slate-50 disabled:opacity-60 flex items-center gap-3"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
              <User className="w-4 h-4 text-slate-300" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-slate-800 text-sm font-semibold truncate">
                {p.nome}
                {!p.ativo && <span className="ml-2 text-2xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-400 font-semibold align-middle">Inativo</span>}
              </p>
              <p className="text-slate-400 text-2xs tabular-nums">{formatCpf(p.cpf)}{p.cargo ? ` • ${p.cargo}` : ''}</p>
              <p className="text-slate-400 text-2xs truncate">{p.areaNome ? `${p.areaNome} › ` : ''}{p.setorNome}</p>
            </div>
          </button>
        ))}
      </div>

      {dados && dados.paginas > 1 && (
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-slate-100 bg-slate-50">
          <button
            type="button" onClick={() => irPara(pagina - 1)} disabled={pagina <= 1 || carregando}
            className="btn btn-secundario btn-sm disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
          </button>
          <span className="text-slate-500 text-xs font-semibold tabular-nums">Página {pagina} de {dados.paginas}</span>
          <button
            type="button" onClick={() => irPara(pagina + 1)} disabled={pagina >= dados.paginas || carregando}
            className="btn btn-secundario btn-sm disabled:opacity-40"
          >
            Próxima <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
