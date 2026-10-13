'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { AlertTriangle, Download, FileSpreadsheet, CheckCircle2 } from 'lucide-react'
import { enviarPedidoDeSetor } from '@/lib/actions-pedidos-setor'
import { normalizarPedidoPublico, type ContextoDoPedido } from '@/lib/pedido-setor-regras'
import type { DiaDaEscala } from '@/lib/escala-regras'
import { CpfInput, TelefoneInput, NomeInput, NomeMaiusculoInput } from '@/components/inputs'
import SeletorLista from '@/components/SeletorLista'
import DiasComQuantidade from '@/components/DiasComQuantidade'

/** Vazio enquanto o captcha não está configurado — o widget nem aparece (mesma tolerância do cadastro da equipe). */
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''

type Pessoa = { nome: string; cpf: string; telefone: string }
type SetorForm = {
  chave: number
  nome: string
  subeventoId: string
  quantidade: string
  /** Dia marcado → quantidade digitada (um dia está marcado quando tem chave). */
  dias: Record<string, string>
  outroSupervisor: boolean
  supervisor: Pessoa
}

const vazia: Pessoa = { nome: '', cpf: '', telefone: '' }
let proximaChave = 1
const novoSetor = (): SetorForm => ({ chave: proximaChave++, nome: '', subeventoId: '', quantidade: '', dias: {}, outroSupervisor: false, supervisor: { ...vazia } })

/**
 * O pedido do fornecedor: quem é o supervisor responsável, e um ou mais setores — cada um com o total de
 * colaboradores e, quando o evento tem vários dias, quantas pessoas em cada dia. As mesmas regras do servidor
 * (`normalizarPedidoPublico`) rodam aqui antes do envio, então o erro aparece na hora e com o mesmo texto.
 */
export default function FormularioPedidoSetor({
  token, ctx, dias, subeventos,
}: {
  token: string
  ctx: ContextoDoPedido
  /** Os dias que a tela oferece (os que ainda não passaram). Vazio = só o total. */
  dias: DiaDaEscala[]
  subeventos: { id: string; nome: string }[]
}) {
  const router = useRouter()
  const [contato, setContato] = useState<Pessoa>({ ...vazia })
  const [setores, setSetores] = useState<SetorForm[]>(() => [novoSetor()])  // um serviço por pedido
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  /*
   * O modelo da planilha é OBRIGATÓRIO antes de enviar (Juan, 13/10/2026): o fornecedor baixa, preenche a equipe (nome,
   * CPF, telefone…) e, depois de aprovado, o supervisor importa a planilha na equipe dele. Ao tocar em baixar, abre
   * primeiro a explicação de para que serve.
   */
  const [explicandoModelo, setExplicandoModelo] = useState(false)
  const [baixouModelo, setBaixouModelo] = useState(false)

  useEffect(() => {
    (window as unknown as { onTurnstileSuccess?: (t: string) => void }).onTurnstileSuccess = setTurnstileToken
    return () => { delete (window as unknown as { onTurnstileSuccess?: (t: string) => void }).onTurnstileSuccess }
  }, [])

  const mudar = (chave: number, parte: Partial<SetorForm>) =>
    setSetores(l => l.map(s => (s.chave === chave ? { ...s, ...parte } : s)))

  const montarPedido = () => ({
    contato,
    observacao,
    setores: setores.map(s => ({
      nome: s.nome,
      subeventoId: s.subeventoId,
      quantidade: s.quantidade,
      porDia: Object.fromEntries(Object.entries(s.dias).filter(([, q]) => q.trim())),
      supervisor: s.outroSupervisor ? s.supervisor : undefined,
    })),
  })

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (enviando) return
    if (!baixouModelo) { setErro('Antes de enviar, baixe o modelo da planilha da equipe (o botão logo acima).'); return }
    const pedido = montarPedido()
    const conferido = normalizarPedidoPublico(pedido, ctx)
    if (!conferido.ok) { setErro(conferido.erro); return }

    setEnviando(true)
    const r = await enviarPedidoDeSetor(token, pedido, turnstileToken ?? undefined)
    if ('erro' in r) { setErro(r.erro); setEnviando(false); return }
    router.push(`/pedido-setor/acompanhar/${r.token}`)
  }

  return (
    <form onSubmit={enviar} className="space-y-5">
      <Bloco titulo="Supervisor responsável" ajuda="É para o WhatsApp dele que chega o acesso, se o pedido for aprovado.">
        <Campo rotulo="Nome completo *">
          <NomeInput required className="input" autoComplete="name" placeholder="Nome e sobrenome" onValueChange={nome => setContato(c => ({ ...c, nome }))} />
        </Campo>
        <Campo rotulo="CPF *">
          <CpfInput required className="input" placeholder="000.000.000-00" onValueChange={cpf => setContato(c => ({ ...c, cpf }))} />
        </Campo>
        <Campo rotulo="WhatsApp com DDD *">
          <TelefoneInput required className="input" autoComplete="tel" placeholder="(27) 99999-9999" onValueChange={telefone => setContato(c => ({ ...c, telefone }))} />
        </Campo>
      </Bloco>

      {setores.map(s => (
        <Bloco
          key={s.chave}
          titulo="Serviço / Fornecedor"
        >
          {/* "Setor" virou "Serviço / Fornecedor" (pedido do Juan, 09/10/2026): quem preenche diz a FUNÇÃO que vai
              desempenhar no evento. O que ele escreve continua sendo o nome do setor no sistema. */}
          <Campo rotulo="Função que vai desempenhar no evento *">
            <NomeMaiusculoInput required className="input" placeholder="Ex.: SEGURANÇA, LIMPEZA, COMUNICAÇÃO VISUAL, BUFFET…" onValueChange={nome => mudar(s.chave, { nome })} />
          </Campo>

          {ctx.subeventoIds && (
            <Campo rotulo="Subevento *">
              <SeletorLista
                valor={s.subeventoId}
                onChange={v => mudar(s.chave, { subeventoId: v })}
                placeholder="Escolha o subevento…"
                titulo="Em qual subevento?"
                opcoes={subeventos.map(x => ({ valor: x.id, rotulo: x.nome.toLocaleUpperCase('pt-BR') }))}
              />
            </Campo>
          )}

          <Campo rotulo="Quantidade de colaboradores *" ajuda="O total de pessoas que você precisa para este serviço.">
            <input
              required type="number" inputMode="numeric" min={1} step={1} placeholder="Ex.: 10" className="input tabular-nums"
              value={s.quantidade} onChange={e => mudar(s.chave, { quantidade: e.target.value })}
            />
          </Campo>

          {!!dias.length && (
            <Campo rotulo="Dias de trabalho *" ajuda="Toque nos dias em que o serviço acontece e diga quantas pessoas precisa em cada um.">
              <DiasComQuantidade
                dias={dias}
                valores={s.dias}
                sugestao={s.quantidade}
                onChange={valores => mudar(s.chave, { dias: valores })}
              />
            </Campo>
          )}

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={s.outroSupervisor} onChange={e => mudar(s.chave, { outroSupervisor: e.target.checked })} className="w-4 h-4 accent-brand-500" />
            Este serviço tem outro supervisor (diferente do responsável acima)
          </label>
          {s.outroSupervisor && (
            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <Campo rotulo="Nome do supervisor deste serviço *">
                <NomeInput required className="input" onValueChange={nome => mudar(s.chave, { supervisor: { ...s.supervisor, nome } })} />
              </Campo>
              <Campo rotulo="CPF *">
                <CpfInput required className="input" placeholder="000.000.000-00" onValueChange={cpf => mudar(s.chave, { supervisor: { ...s.supervisor, cpf } })} />
              </Campo>
              <Campo rotulo="WhatsApp com DDD *">
                <TelefoneInput required className="input" placeholder="(27) 99999-9999" onValueChange={telefone => mudar(s.chave, { supervisor: { ...s.supervisor, telefone } })} />
              </Campo>
            </div>
          )}
        </Bloco>
      ))}

      {/* Um serviço / fornecedor por pedido (Juan, 13/10/2026: "pode tirar o botão de incluir outro serviço"). */}
      <Bloco titulo="Planilha da equipe *" ajuda="Obrigatório antes de enviar o pedido.">
        <button
          type="button"
          onClick={() => setExplicandoModelo(true)}
          className={`w-full btn ${baixouModelo ? 'btn-secundario' : 'btn-primario'}`}
        >
          {baixouModelo ? <CheckCircle2 className="w-4 h-4" /> : <Download className="w-4 h-4" />}
          {baixouModelo ? 'Modelo baixado · baixar de novo' : 'Baixar o modelo da planilha'}
        </button>
        <p className="text-slate-500 text-xs">
          Preencha um colaborador por linha: nome, CPF, telefone com DDD, cidade{dias.length ? ' e os dias em que cada um trabalha' : ''}.
          Depois que o pedido for aprovado, o supervisor envia essa planilha pelo Credenciei.
        </p>
      </Bloco>

      <Campo rotulo="Observação (opcional)">
        <textarea rows={3} maxLength={500} value={observacao} onChange={e => setObservacao(e.target.value)} className="input" placeholder="Algo que o administrador precisa saber?" />
      </Campo>

      {explicandoModelo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setExplicandoModelo(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center mb-4">
              <FileSpreadsheet className="w-6 h-6 text-brand-500" />
            </div>
            <h3 className="text-slate-800 font-bold text-lg">Para que serve esta planilha</h3>
            <ol className="mt-3 space-y-2 text-sm text-slate-600 list-decimal pl-5">
              <li>É nela que você cadastra a <strong>equipe inteira</strong> de uma vez: uma pessoa por linha, com nome, CPF, telefone com DDD e cidade (cargo e chave PIX são opcionais){dias.length ? ', e um X nos dias em que cada um trabalha' : ''}.</li>
              <li>Preencha agora, enquanto o pedido é analisado. Não mude o nome das colunas.</li>
              <li>Quando o pedido for <strong>aprovado</strong>, o supervisor recebe o acesso no WhatsApp, entra no Credenciei, abre a equipe e usa <strong>Importar planilha</strong> com este arquivo.</li>
              <li>Cada colaborador cadastrado recebe a <strong>própria credencial</strong> no WhatsApp.</li>
            </ol>
            <a
              href={`/pedido-setor/${token}/modelo`}
              download
              onClick={() => { setBaixouModelo(true); setExplicandoModelo(false) }}
              className="mt-5 w-full btn btn-primario"
            >
              <Download className="w-4 h-4" /> Entendi, baixar o modelo
            </a>
            <button type="button" onClick={() => setExplicandoModelo(false)} className="mt-2 w-full btn btn-secundario">Agora não</button>
          </div>
        </div>
      )}

      {erro && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setErro(null)}>
          <div className="bg-[#1a1a1a] border border-red-900/40 rounded-2xl p-6 w-full max-w-sm text-center" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-white font-semibold text-sm leading-relaxed">{erro}</p>
            <button type="button" onClick={() => setErro(null)} className="mt-5 w-full btn btn-primario">Entendi</button>
          </div>
        </div>
      )}

      {!!TURNSTILE_SITE_KEY && (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
          <div className="cf-turnstile flex justify-center" data-sitekey={TURNSTILE_SITE_KEY} data-callback="onTurnstileSuccess" data-theme="dark" />
        </>
      )}

      <button type="submit" disabled={enviando || !baixouModelo || (!!TURNSTILE_SITE_KEY && !turnstileToken)} className="w-full btn btn-primario btn-lg disabled:opacity-60">
        {enviando ? 'Enviando…' : 'Enviar pedido →'}
      </button>
      {!baixouModelo && <p className="text-center text-slate-500 text-xs -mt-2">Baixe o modelo da planilha para liberar o envio.</p>}
    </form>
  )
}

function Bloco({ titulo, ajuda, acao, children }: { titulo: string; ajuda?: string; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-slate-800 font-bold text-base">{titulo}</h2>
          {ajuda && <p className="text-slate-500 text-xs mt-0.5">{ajuda}</p>}
        </div>
        {acao}
      </div>
      {children}
    </section>
  )
}

function Campo({ rotulo, ajuda, children }: { rotulo: string; ajuda?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{rotulo}</label>
      {children}
      {ajuda && <p className="text-slate-500 text-xs">{ajuda}</p>}
    </div>
  )
}
