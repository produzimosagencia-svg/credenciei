'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Camera, AlertTriangle, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { cadastrarVeiculoPublico } from '@/lib/actions'
import { formatCpf, formatTelefone, validarCpf } from '@/lib/format'

const ETAPAS = ['Identificação', 'Profissional', 'Veículo', 'Fotos', 'Revisão', 'Autorização']

function normalizarPlaca(v: string): string {
  return (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function comprimir(file: File): Promise<{ blob: Blob; url: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const max = 1280
      let { width, height } = img
      if (width > height && width > max) { height = Math.round((height * max) / width); width = max }
      else if (height >= width && height > max) { width = Math.round((width * max) / height); height = max }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) { reject(new Error('canvas')); return }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('blob')); return }
        resolve({ blob, url })
      }, 'image/jpeg', 0.82)
    }
    img.onerror = () => reject(new Error('img'))
    img.src = url
  })
}

const initial = {
  nome: '', cpf: '', telefone: '', empresa: '', setor: '', modelo: '', ano: '', placa: '', cor: '',
}

export default function VeiculoWizard({ token }: { token: string }) {
  const router = useRouter()
  const [etapa, setEtapa] = useState(0)
  const [form, setForm] = useState(initial)
  const [fotoVeiculo, setFotoVeiculo] = useState<Blob | null>(null)
  const [previaVeiculo, setPreviaVeiculo] = useState<string | null>(null)
  const [fotoPessoa, setFotoPessoa] = useState<Blob | null>(null)
  const [previaPessoa, setPreviaPessoa] = useState<string | null>(null)
  const [autorizado, setAutorizado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, startEnviar] = useTransition()

  const set = (campo: keyof typeof form, valor: string) => setForm(f => ({ ...f, [campo]: valor }))

  const escolherFoto = async (file: File, alvo: 'veiculo' | 'pessoa') => {
    try {
      const { blob, url } = await comprimir(file)
      if (alvo === 'veiculo') { setFotoVeiculo(blob); setPreviaVeiculo(url) }
      else { setFotoPessoa(blob); setPreviaPessoa(url) }
    } catch {
      setErro('Não consegui processar essa imagem. Tente outra foto.')
    }
  }

  const validarEtapa = (): string | null => {
    if (etapa === 0) {
      if (form.nome.trim().length < 2) return 'Informe o nome completo.'
      if (!validarCpf(form.cpf.replace(/\D/g, ''))) return 'CPF inválido. Confira os números.'
      if (form.telefone.replace(/\D/g, '').length < 10) return 'Informe o telefone com DDD.'
    }
    if (etapa === 2) {
      const placa = normalizarPlaca(form.placa)
      if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(placa)) return 'Placa inválida. Use o formato ABC1D23 (Mercosul) ou ABC1234.'
      if (form.modelo.trim().length < 2) return 'Informe o modelo do veículo.'
    }
    if (etapa === 3) {
      if (!fotoVeiculo) return 'A foto do veículo é obrigatória.'
    }
    return null
  }

  const avancar = () => {
    const erroEtapa = validarEtapa()
    if (erroEtapa) { setErro(erroEtapa); return }
    setErro(null)
    setEtapa(e => Math.min(e + 1, ETAPAS.length - 1))
  }
  const voltar = () => { setErro(null); setEtapa(e => Math.max(e - 1, 0)) }

  const concluir = () => {
    if (!autorizado) { setErro('Confirme que está de acordo pra concluir o cadastro.'); return }
    setErro(null)
    const fd = new FormData()
    fd.set('condutor_nome', form.nome.trim())
    fd.set('condutor_cpf', form.cpf.replace(/\D/g, ''))
    fd.set('condutor_telefone', form.telefone.replace(/\D/g, ''))
    fd.set('empresa', form.empresa.trim())
    fd.set('setor', form.setor.trim())
    fd.set('placa', normalizarPlaca(form.placa))
    fd.set('modelo', form.modelo.trim())
    fd.set('ano', form.ano.trim())
    fd.set('cor', form.cor.trim())
    if (fotoVeiculo) fd.set('foto', fotoVeiculo, 'veiculo.jpg')
    if (fotoPessoa) fd.set('foto_pessoa', fotoPessoa, 'pessoa.jpg')

    startEnviar(async () => {
      const r = await cadastrarVeiculoPublico(token, fd)
      if (!r.ok) { setErro(r.error); return }
      router.push(`/veiculo/${r.qrToken}`)
    })
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
      {/* Indicador de progresso */}
      <div className="flex items-center gap-1">
        {ETAPAS.map((nome, i) => (
          <div key={nome} className="flex-1">
            <div className={`h-1.5 rounded-full ${i <= etapa ? 'bg-brand-500' : 'bg-slate-200'}`} />
          </div>
        ))}
      </div>
      <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">
        Etapa {etapa + 1} de {ETAPAS.length} · {ETAPAS[etapa]}
      </p>

      {etapa === 0 && (
        <div className="space-y-3">
          <Campo rotulo="Nome completo" obrigatorio>
            <input className="input" value={form.nome} onChange={e => set('nome', e.target.value)} placeholder="Seu nome completo" autoFocus />
          </Campo>
          <Campo rotulo="CPF" obrigatorio>
            <input className="input" value={form.cpf} onChange={e => set('cpf', formatCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" />
          </Campo>
          <Campo rotulo="Telefone/WhatsApp" obrigatorio>
            <input className="input" value={form.telefone} onChange={e => set('telefone', formatTelefone(e.target.value))} placeholder="(00) 00000-0000" inputMode="tel" />
          </Campo>
        </div>
      )}

      {etapa === 1 && (
        <div className="space-y-3">
          <p className="text-slate-400 text-xs">Se não se aplicar ao seu caso, pode deixar em branco.</p>
          <Campo rotulo="Empresa">
            <input className="input" value={form.empresa} onChange={e => set('empresa', e.target.value)} placeholder="De quem é o veículo" />
          </Campo>
          <Campo rotulo="Setor">
            <input className="input" value={form.setor} onChange={e => set('setor', e.target.value)} placeholder="Ex.: Produção, Segurança" />
          </Campo>
        </div>
      )}

      {etapa === 2 && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Placa" obrigatorio>
              <input className="input uppercase" value={form.placa} onChange={e => set('placa', e.target.value)} placeholder="ABC1D23" maxLength={8} />
            </Campo>
            <Campo rotulo="Modelo" obrigatorio>
              <input className="input" value={form.modelo} onChange={e => set('modelo', e.target.value)} placeholder="Ex.: Onix" />
            </Campo>
            <Campo rotulo="Ano">
              <input className="input" value={form.ano} onChange={e => set('ano', e.target.value.replace(/\D/g, ''))} placeholder="2024" maxLength={4} inputMode="numeric" />
            </Campo>
            <Campo rotulo="Cor">
              <input className="input" value={form.cor} onChange={e => set('cor', e.target.value)} placeholder="Ex.: Branco" />
            </Campo>
          </div>
        </div>
      )}

      {etapa === 3 && (
        <div className="space-y-4">
          <div>
            <p className="text-slate-700 text-sm font-medium mb-1">Foto do veículo <span className="text-red-500">*</span></p>
            <p className="text-slate-400 text-xs mb-2">
              Fotografe o veículo de forma que dê pra identificar claramente — de preferência o veículo inteiro e, se possível, a placa.
            </p>
            <FotoInput id="foto-veiculo" previa={previaVeiculo} onEscolher={f => escolherFoto(f, 'veiculo')} />
          </div>
          <div>
            <p className="text-slate-700 text-sm font-medium mb-1">Foto sua <span className="text-slate-400 font-normal">(opcional)</span></p>
            <FotoInput id="foto-pessoa" previa={previaPessoa} onEscolher={f => escolherFoto(f, 'pessoa')} />
          </div>
        </div>
      )}

      {etapa === 4 && (
        <div className="space-y-1.5 text-sm">
          <Linha rotulo="Nome" valor={form.nome} />
          <Linha rotulo="CPF" valor={form.cpf} />
          <Linha rotulo="Telefone" valor={form.telefone} />
          {form.empresa && <Linha rotulo="Empresa" valor={form.empresa} />}
          {form.setor && <Linha rotulo="Setor" valor={form.setor} />}
          <Linha rotulo="Placa" valor={normalizarPlaca(form.placa)} />
          <Linha rotulo="Modelo" valor={form.modelo} />
          {form.ano && <Linha rotulo="Ano" valor={form.ano} />}
          {form.cor && <Linha rotulo="Cor" valor={form.cor} />}
          <Linha rotulo="Foto do veículo" valor={previaVeiculo ? 'Anexada' : '—'} />
          <Linha rotulo="Foto da pessoa" valor={previaPessoa ? 'Anexada' : 'Não enviada'} />
        </div>
      )}

      {etapa === 5 && (
        <div className="space-y-3">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-600 text-xs space-y-1.5">
            <p>Ao confirmar, você autoriza o uso destes dados e desta foto exclusivamente para liberar a entrada do seu veículo neste evento.</p>
            <p>O cadastro fica <strong>pendente</strong> até a produção do evento aprovar — o QR Code é gerado agora, mas só passa a valer pra entrada depois da aprovação.</p>
          </div>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={autorizado} onChange={e => setAutorizado(e.target.checked)} className="mt-0.5" />
            <span className="text-slate-700 text-sm">Li e estou de acordo com as informações acima.</span>
          </label>
        </div>
      )}

      {erro && (
        <p className="flex items-start gap-1.5 text-red-600 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        {etapa > 0 && (
          <button type="button" onClick={voltar} className="btn btn-secundario">
            <ChevronLeft className="w-4 h-4" /> Voltar
          </button>
        )}
        {etapa < ETAPAS.length - 1 ? (
          <button type="button" onClick={avancar} className="btn btn-primario flex-1 justify-center">
            Próximo <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button type="button" onClick={concluir} disabled={enviando} className="btn btn-primario flex-1 justify-center">
            {enviando ? 'Enviando…' : <><Check className="w-4 h-4" /> Concluir cadastro</>}
          </button>
        )}
      </div>
    </div>
  )
}

function Campo({ rotulo, obrigatorio, children }: { rotulo: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-slate-500 text-xs font-medium">{rotulo}{obrigatorio && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-50 py-1.5">
      <span className="text-slate-400 text-xs">{rotulo}</span>
      <span className="text-slate-700 text-right">{valor}</span>
    </div>
  )
}

function FotoInput({ id, previa, onEscolher }: { id: string; previa: string | null; onEscolher: (f: File) => void }) {
  return (
    <div>
      {previa ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previa} alt="Foto escolhida" className="w-full h-40 object-cover rounded-xl border border-slate-200" />
      ) : (
        <label
          htmlFor={id}
          className="flex flex-col items-center justify-center gap-2 border border-dashed border-slate-300 rounded-xl h-40 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 cursor-pointer transition-colors"
        >
          <Camera className="w-6 h-6" />
          Tirar foto ou escolher da galeria
        </label>
      )}
      <input
        id={id} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onEscolher(f) }}
      />
      {previa && (
        <label htmlFor={id} className="inline-block mt-1.5 text-brand-600 text-2xs font-semibold cursor-pointer">
          Trocar foto
        </label>
      )}
    </div>
  )
}

