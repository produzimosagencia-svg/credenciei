'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Camera as CameraIcon, X, Sparkles } from 'lucide-react'
import { cadastrarFuncionarioPublico, buscarCadastroPorCpf } from '@/lib/actions'
import { formatCpf, formatTelefone, titleCaseNome, validarCpf } from '@/lib/format'
import SeletorLista from '@/components/SeletorLista'
import { CIDADES_ES } from '@/lib/cidades'
import { useCampoFormatado } from '@/components/inputs'

const initialForm = {
  nome: '',
  cpf: '',
  telefone: '',
  cargo: '',
  cidade: '',
  chavePix: '',
}

// Reduz a foto antes de enviar (mesmo padrão de app/credential/[token]/CheckinPresenca.tsx)
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

export default function FormularioFuncionario({
  fornecedorId, origem = 'formulario', cpfInicial,
}: {
  fornecedorId: string
  /** De onde a pessoa veio. Guardado no cadastro para auditoria. */
  origem?: string
  /** Veio da portaria já com o CPF digitado — evita pedir de novo. */
  cpfInicial?: string
}) {
  const router = useRouter()
  const [form, setForm] = useState(() => ({ ...initialForm, cpf: cpfInicial ? formatCpf(cpfInicial) : '' }))
  const [consentimento, setConsentimento] = useState(false)
  const [foto, setFoto] = useState<string | null>(null)
  const [erroFoto, setErroFoto] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [qrToken, setQrToken] = useState<string | null>(null)
  const [autofill, setAutofill] = useState(false)
  const [erroCpf, setErroCpf] = useState<string | null>(null)
  const cpfBuscado = useRef<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (field: keyof typeof form, value: string) =>
    setForm(f => ({ ...f, [field]: value }))

  /*
   * Campos de texto com Title Case. Passam pelo hook em vez de formatar no
   * onChange: em teclado com acento morto, reformatar durante a composição
   * grava "Conceiçã" no lugar de "Conceição" — e ninguém percebe até o crachá
   * sair errado.
   */
  const campoNome = useCampoFormatado(titleCaseNome, v => set('nome', v))
  const campoCargo = useCampoFormatado(titleCaseNome, v => set('cargo', v))
  const campoCidade = useCampoFormatado(titleCaseNome, v => set('cidade', v))

  // Base central de cadastros: quando o CPF fica completo, busca o cadastro
  // mais recente da pessoa (eventos anteriores do mesmo organizador) e
  // pré-preenche o resto do formulário — só a foto continua sendo nova.
  const onCpf = (value: string) => {
    set('cpf', value)
    setAutofill(false)
    const digitos = value.replace(/\D/g, '')
    if (digitos.length < 11) { setErroCpf(null); return }
    if (!validarCpf(digitos)) { setErroCpf('O CPF precisa ter 11 dígitos.'); return }
    setErroCpf(null)
    if (cpfBuscado.current === digitos) return
    cpfBuscado.current = digitos
    buscarCadastroPorCpf(fornecedorId, digitos).then(dados => {
      if (!dados) return
      setForm(f => ({
        ...f,
        nome: f.nome || dados.nome,
        telefone: f.telefone || formatTelefone(dados.telefone),
        /*
         * `cargo` fica DE FORA de propósito.
         *
         * A função muda de evento para evento: quem foi portaria no último
         * pode ser bar neste. Preencher com a anterior faria a pessoa confirmar
         * sem ler, e o setor receberia gente escalada na função errada — erro
         * que só aparece no dia, com a equipe já no local.
         */
        cidade: f.cidade || (dados.cidade ?? ''),
        chavePix: f.chavePix || (dados.chavePix ?? ''),
      }))
      setAutofill(true)
    }).catch(() => {})
  }

  /*
   * Veio da portaria com o CPF na mão — dispara a mesma busca de quando a
   * pessoa digita, uma vez, sem esperar ela tocar no campo de novo.
   *
   * Adiado um tique (mesmo padrão de app/credential/[token]/CheckinPresenca.tsx):
   * chamar `onCpf` — que muda estado — direto no corpo do efeito é o que o
   * React reclama como cascata de re-render.
   */
  useEffect(() => {
    if (!cpfInicial) return
    const id = setTimeout(() => onCpf(formatCpf(cpfInicial)), 0)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setFoto(await comprimir(file))
      setErroFoto(null)
    } catch {
      setErroFoto('Não foi possível processar essa foto. Tente outra.')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validarCpf(form.cpf)) {
      setErroCpf('O CPF precisa ter 11 dígitos.')
      return
    }
    setLoading(true)
    const res = await cadastrarFuncionarioPublico(fornecedorId, {
      origem,
      nome: form.nome,
      cpf: form.cpf,
      telefone: form.telefone,
      cargo: form.cargo,
      cidade: form.cidade,
      consentimento,
      chavePix: form.chavePix,
      fotoBase64: foto ?? undefined,
    })

    if (res.qrToken) {
      /*
       * Veio da portaria: direto pro check-in, sem tela intermediária.
       *
       * Fora da portaria a pessoa pode preferir salvar o link e voltar depois
       * — por isso só aqui o redirecionamento é automático. Quem chegou pelo
       * cartaz está com fila atrás e precisa registrar a entrada agora.
       */
      if (origem === 'portaria') {
        router.push(`/credential/${res.qrToken}`)
        return
      }
      setQrToken(res.qrToken)
    } else {
      alert(res.error ?? 'Erro ao enviar formulário. Tente novamente.')
    }
    setLoading(false)
  }

  if (qrToken) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-sm">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500 rounded-2xl mb-2 shadow-lg shadow-green-200">
          <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-slate-800 font-bold text-xl">Cadastro realizado!</h2>
        <p className="text-slate-500 text-sm">
          Salve o link abaixo. Nele está seu QR code (apresente na entrada e na saída) e o registro por foto durante o evento.
        </p>
        <a
          href={`/credential/${qrToken}`}
          className="block w-full btn btn-primario btn-lg"
        >
          Abrir minha credencial →
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-sm">
      <Field label="Foto (opcional)" tutorial="form-foto">
        <input ref={fileRef} type="file" accept="image/*" capture="user" className="hidden" onChange={onFoto} />
        {foto ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={foto} alt="Prévia da foto" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
            <button type="button" onClick={() => setFoto(null)} className="text-xs text-red-500 hover:underline flex items-center gap-1">
              <X className="w-3 h-3" /> Remover
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className={`w-full flex items-center justify-center gap-2 border border-dashed rounded-xl py-3 text-sm transition-colors ${
              erroFoto ? 'border-red-300 text-red-500' : 'border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-600'
            }`}
          >
            <CameraIcon className="w-4 h-4" /> Tirar foto
          </button>
        )}
        {erroFoto && <p className="text-red-500 text-xs mt-1">{erroFoto}</p>}
      </Field>
      <Field label="CPF *" tutorial="form-cpf">
        <input required value={form.cpf} onChange={e => onCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" className="input" inputMode="numeric" />
        {erroCpf && <p className="text-red-500 text-xs mt-1">{erroCpf}</p>}
        {!erroCpf && autofill && (
          <p className="flex items-center gap-1 text-brand-600 text-xs mt-1">
            <Sparkles className="w-3 h-3 shrink-0" /> Encontramos seu cadastro anterior e preenchemos os dados. Confira se está tudo certo e informe a função deste evento.
          </p>
        )}
      </Field>
      <Field label="Nome completo *">
        <input required value={form.nome} {...campoNome} placeholder="Seu nome completo" className="input" />
      </Field>
      <Field label="Telefone *" tutorial="form-telefone">
        <input required value={form.telefone} onChange={e => set('telefone', formatTelefone(e.target.value))} placeholder="(11) 99999-9999" className="input" inputMode="tel" />
      </Field>
      <Field label="Cargo *">
        <input required value={form.cargo} {...campoCargo} placeholder="Ex: Segurança, Garçom..." className="input" />
      </Field>
      <Field label="Cidade onde você mora *">
        {/* Lista em vez de texto livre.
            Digitado à mão, 56 cadastros viraram 10 "cidades" para 7 reais —
            "Vitória" e "Vitoria", "Vila Velha" e "Vila Velhas". Cada variação
            some da busca por cidade, que é justamente como o organizador acha
            quem consegue chegar ao local. A lista mata o problema na origem. */}
        <SeletorLista
          opcoes={CIDADES_ES.map(c => ({ valor: c, rotulo: c }))}
          valor={form.cidade}
          onChange={v => set('cidade', v)}
          placeholder="Escolher a cidade…"
          titulo="Cidade onde você mora"
          busca
        />
      </Field>
      <Field label="Chave PIX (opcional)" tutorial="form-pix">
        <input value={form.chavePix} onChange={e => set('chavePix', e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" className="input" />
      </Field>

      {/*
        Aceite da base regional.
        Fica no fim, logo acima do botão, porque é a última coisa que a pessoa
        decide antes de enviar. O texto diz o que acontece com o dado em vez de
        remeter a um "termo" que ninguém abre: quem vê, o que vê e pra quê.
      */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
        {/* Uma linha, e o resto atrás de um toque.
            O parágrafo inteiro aberto na tela era pulado por todo mundo: bloco
            denso logo acima do botão de enviar, quando a pessoa só quer terminar
            o cadastro. Ninguém lia — então nem servia como consentimento
            informado, só ocupava a tela. Uma frase que diz o essencial ("guardar
            e me chamar pra outros eventos") é lida; quem quiser o detalhe abre.
            O texto completo continua ali, palavra por palavra. */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            required
            checked={consentimento}
            onChange={e => setConsentimento(e.target.checked)}
            className="mt-0.5 w-4 h-4 shrink-0 accent-brand-500 cursor-pointer"
          />
          <span className="text-slate-600 text-xs leading-relaxed">
            Autorizo o Credenciei a guardar meus dados para me chamar para trabalhar
            em outros eventos.
          </span>
        </label>

        {/* Fora do <label> de propósito: dentro dele, abrir o detalhe marcaria
            o checkbox junto. */}
        <details className="group pl-7">
          <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer text-brand-500 text-2xs font-medium hover:underline">
            <span className="group-open:hidden">O que exatamente eu autorizo?</span>
            <span className="hidden group-open:inline">Esconder detalhes</span>
          </summary>
          <p className="text-slate-500 text-2xs leading-relaxed mt-1.5">
            O Credenciei guarda seus dados e mostra seu{' '}
            <strong className="text-slate-700">nome, cidade, função e telefone</strong> para
            organizadores de outros eventos que procurem equipe na sua região —
            é assim que você é chamado para novos trabalhos. Seu CPF não é usado
            para isso, e você pode pedir a remoção a qualquer momento.
          </p>
        </details>
      </div>

      <button
        type="submit"
        data-tutorial="form-enviar"
        disabled={loading || !consentimento}
        className="w-full btn btn-primario btn-lg"
      >
        {loading ? 'Enviando...' : 'Enviar e gerar minha presença →'}
      </button>
    </form>
  )
}

function Field({ label, children, tutorial }: { label: string; children: React.ReactNode; tutorial?: string }) {
  return (
    <div className="space-y-1.5" data-tutorial={tutorial}>
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  )
}
