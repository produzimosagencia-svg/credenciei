'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Truck, Search, Check, AlertTriangle, User, Camera, X, Download } from 'lucide-react'
import { buscarCondutorPorCpf, cadastrarVeiculo, type CondutorEncontrado } from '@/lib/actions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import SeletorLista from '@/components/SeletorLista'

const TIPOS = ['Caminhão', 'Van', 'Carro', 'Moto', 'Outro']

/**
 * Cadastro de veículo — o condutor não precisa mais estar credenciado no
 * evento (pedido do Juan, 23/09/2026): pode ser hóspede de hotel, pessoa do
 * lounge, qualquer um. Os campos do condutor ficam sempre abertos; "Buscar
 * por CPF" continua existindo como atalho pra quem JÁ é da equipe — só
 * preenche nome/telefone sozinho, não é mais obrigatório passar por ele.
 */
export default function FormVeiculo({
  eventoId, dias,
}: {
  eventoId: string
  /** Dias de trabalho do evento, pra marcar quando o veículo pode entrar. */
  dias: { data: string; tipo: string }[]
}) {
  const router = useRouter()

  const [cpf, setCpf] = useState('')
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [funcionarioId, setFuncionarioId] = useState<string | null>(null)
  const [erroCpf, setErroCpf] = useState<string | null>(null)
  const [buscando, startBusca] = useTransition()

  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<{ placa: string; condutor: string; qrDataUrl: string } | null>(null)
  const [salvando, startSalvar] = useTransition()
  const [diasMarcados, setDiasMarcados] = useState<string[]>([])
  const [previaVeiculo, setPreviaVeiculo] = useState<string | null>(null)
  const [previaPessoa, setPreviaPessoa] = useState<string | null>(null)

  const buscarPorCpf = () => {
    const digitos = cpf.replace(/\D/g, '')
    if (digitos.length !== 11) { setErroCpf('Digite os 11 números do CPF pra buscar.'); return }
    setErroCpf(null)
    startBusca(async () => {
      const r = await buscarCondutorPorCpf(eventoId, digitos)
      if (r.condutor) {
        preencherCondutor(r.condutor)
      } else {
        // Não é erro de verdade: o condutor pode simplesmente não ser da
        // equipe. Avisa e deixa a pessoa preencher nome/telefone na mão.
        setErroCpf('Não encontrei esse CPF na equipe — preencha o nome e telefone abaixo.')
      }
    })
  }

  const preencherCondutor = (c: CondutorEncontrado) => {
    setFuncionarioId(c.id)
    setNome(c.nome)
    setCpf(formatCpf(c.cpf))
  }

  const salvar = (formData: FormData) => {
    setErro(null)
    setSucesso(null)
    if (funcionarioId) formData.set('funcionario_id', funcionarioId)
    startSalvar(async () => {
      const r = await cadastrarVeiculo(eventoId, formData)
      if (!r.ok) { setErro(r.error); return }
      setSucesso({ placa: r.placa, condutor: r.condutor, qrDataUrl: r.qrDataUrl })
      // Limpa pra cadastrar o próximo: numa montagem chegam vários seguidos.
      setFuncionarioId(null)
      setCpf('')
      setNome('')
      setTelefone('')
      setDiasMarcados([])
      setPreviaVeiculo(null)
      setPreviaPessoa(null)
      router.refresh()
    })
  }

  const alternarDia = (d: string) =>
    setDiasMarcados(m => m.includes(d) ? m.filter(x => x !== d) : [...m, d])

  if (sucesso) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 text-center">
        <div className="flex items-center justify-center gap-2 text-green-700">
          <Check className="w-5 h-5" />
          <p className="font-semibold text-sm">{sucesso.placa} cadastrada para {sucesso.condutor}.</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sucesso.qrDataUrl} alt={`QR do veículo ${sucesso.placa}`} className="mx-auto rounded-xl border border-slate-200" />
        <div className="flex gap-2">
          <a href={sucesso.qrDataUrl} download={`qr-${sucesso.placa}.png`} className="btn btn-secundario btn-sm flex-1 justify-center">
            <Download className="w-3.5 h-3.5" /> Baixar QR
          </a>
          <button onClick={() => setSucesso(null)} className="btn btn-primario btn-sm flex-1 justify-center">
            <Truck className="w-3.5 h-3.5" /> Cadastrar outro
          </button>
        </div>
      </div>
    )
  }

  return (
    <form action={salvar} className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
      <div>
        <p className="text-slate-800 font-semibold text-sm">Quem vai dirigir</p>
        <p className="text-slate-400 text-xs mt-0.5">
          Não precisa ser da equipe — pode ser hóspede, pessoa do lounge, qualquer condutor.
        </p>
      </div>

      <div>
        <label className="text-slate-600 text-xs font-medium block mb-1">CPF do condutor *</label>
        <div className="flex gap-2">
          <input
            required name="condutor_cpf"
            value={cpf}
            onChange={e => { setCpf(formatCpf(e.target.value)); setErroCpf(null); setFuncionarioId(null) }}
            placeholder="000.000.000-00"
            className="input flex-1"
            autoComplete="off"
            inputMode="numeric"
          />
          <button type="button" onClick={buscarPorCpf} disabled={buscando} className="btn btn-secundario shrink-0">
            <Search className="w-4 h-4" />
            {buscando ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
        <p className="text-slate-400 text-2xs mt-1">Buscar preenche o nome sozinho, se a pessoa já for da equipe.</p>
      </div>

      {erroCpf && (
        <p className="flex items-start gap-1.5 text-amber-700 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erroCpf}
        </p>
      )}
      {funcionarioId && (
        <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
          <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-slate-700 text-sm">Encontrado na equipe deste evento.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-slate-600 text-xs font-medium block mb-1">Nome completo *</label>
          <input
            required name="condutor_nome" value={nome} onChange={e => setNome(e.target.value)}
            placeholder="Nome do condutor" className="input" autoComplete="off"
          />
        </div>
        <div>
          <label className="text-slate-600 text-xs font-medium block mb-1">Telefone/WhatsApp *</label>
          <input
            required name="condutor_telefone" value={telefone} onChange={e => setTelefone(e.target.value)}
            placeholder="(00) 00000-0000" className="input" autoComplete="off" inputMode="tel"
          />
        </div>
      </div>

      <div>
        <p className="text-slate-800 font-semibold text-sm">O veículo</p>
        <p className="text-slate-400 text-xs mt-0.5">Placa, modelo e foto do veículo são obrigatórios.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-slate-600 text-xs font-medium block mb-1">Placa *</label>
          <input
            required name="placa" placeholder="ABC1D23"
            className="input uppercase" autoComplete="off" maxLength={8}
          />
        </div>
        <div>
          <label className="text-slate-600 text-xs font-medium block mb-1">Modelo *</label>
          <input required name="modelo" placeholder="Ex.: Mercedes Sprinter" className="input" autoComplete="off" />
        </div>
        <div>
          <label className="text-slate-600 text-xs font-medium block mb-1">Ano</label>
          <input name="ano" placeholder="2024" className="input" autoComplete="off" inputMode="numeric" maxLength={4} />
        </div>
        <div>
          <label className="text-slate-600 text-xs font-medium block mb-1">Cor</label>
          <input name="cor" placeholder="Ex.: Branco" className="input" autoComplete="off" />
        </div>
        <div>
          <label className="text-slate-600 text-xs font-medium block mb-1">Tipo</label>
          <SeletorLista
            name="tipo"
            defaultValor=""
            placeholder="Não informado"
            titulo="Tipo de veículo"
            opcoes={[
              { valor: '', rotulo: 'Não informado' },
              ...TIPOS.map(t => ({ valor: t, rotulo: t })),
            ]}
          />
        </div>
        <div>
          <label className="text-slate-600 text-xs font-medium block mb-1">Setor</label>
          <input name="setor" placeholder="Ex.: Produção, Segurança" className="input" autoComplete="off" />
        </div>
      </div>

      <div>
        <label className="text-slate-600 text-xs font-medium block mb-1">
          Empresa <span className="text-slate-400 font-normal">(opcional)</span>
        </label>
        <input name="empresa" placeholder="De quem é o veículo" className="input" autoComplete="off" />
      </div>

      {/*
        * Sem nenhum dia marcado = vale todos os dias do evento. É o caso
        * comum (o caminhão da montagem vai e volta a semana inteira), e
        * obrigar a marcar os onze dias pra dizer "todos" seria trabalho
        * repetido em cada cadastro.
        */}
      {dias.length > 0 && (
        <div>
          <label className="text-slate-600 text-xs font-medium block mb-1">
            Dias autorizados <span className="text-slate-400 font-normal">(nenhum marcado = todos)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {diasMarcados.map(d => <input key={d} type="hidden" name="dias" value={d} />)}
            {dias.map(d => {
              const marcado = diasMarcados.includes(d.data)
              return (
                <button
                  key={d.data} type="button" onClick={() => alternarDia(d.data)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                    marcado
                      ? 'bg-brand-500 border-brand-500 text-white'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300'
                  }`}
                >
                  {formatarBR(`${d.data}T12:00:00-03:00`, 'data').slice(0, 5)}
                  {d.tipo === 'principal' && <span className="ml-1 opacity-70">·evento</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <CampoFoto
          id="foto-veiculo" name="foto" label="Foto do veículo" obrigatoria
          previa={previaVeiculo} onEscolher={setPreviaVeiculo}
        />
        <CampoFoto
          id="foto-pessoa" name="foto_pessoa" label="Foto da pessoa" opcional
          previa={previaPessoa} onEscolher={setPreviaPessoa}
        />
      </div>

      <div>
        <label className="text-slate-600 text-xs font-medium block mb-1">
          Observações <span className="text-slate-400 font-normal">(opcional)</span>
        </label>
        <input
          name="observacoes" className="input" autoComplete="off"
          placeholder="Ex.: carga frágil, entra só após as 22h"
        />
      </div>

      {erro && (
        <p className="flex items-start gap-1.5 text-red-600 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}

      <button type="submit" disabled={salvando} className="btn btn-primario w-full">
        <Truck className="w-4 h-4" />
        {salvando ? 'Cadastrando…' : 'Cadastrar veículo'}
      </button>
    </form>
  )
}

/** Um campo de foto com preview, câmera ou galeria — usado pra veículo (obrigatória) e pessoa (opcional). */
function CampoFoto({
  id, name, label, obrigatoria, opcional, previa, onEscolher,
}: {
  id: string
  name: string
  label: string
  obrigatoria?: boolean
  opcional?: boolean
  previa: string | null
  onEscolher: (url: string | null) => void
}) {
  return (
    <div>
      <label className="text-slate-600 text-xs font-medium block mb-1">
        {label} {obrigatoria && <span className="text-red-500">*</span>}
        {opcional && <span className="text-slate-400 font-normal">(opcional)</span>}
      </label>
      {previa ? (
        <div className="space-y-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previa} alt={`${label} escolhida`} className="w-full h-24 object-cover rounded-xl border border-slate-200" />
          <button
            type="button"
            onClick={() => {
              onEscolher(null)
              const el = document.getElementById(id) as HTMLInputElement | null
              if (el) el.value = ''
            }}
            className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 text-2xs font-semibold"
          >
            <X className="w-3 h-3" /> Trocar
          </button>
        </div>
      ) : (
        <label
          htmlFor={id}
          className="flex items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl py-4 text-xs text-slate-500 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors h-24"
        >
          <Camera className="w-4 h-4" /> Adicionar
        </label>
      )}
      <input
        id={id} type="file" name={name} accept="image/*" capture="environment"
        className="hidden" required={obrigatoria && !previa}
        onChange={e => {
          const f = e.target.files?.[0]
          onEscolher(f ? URL.createObjectURL(f) : null)
        }}
      />
    </div>
  )
}
