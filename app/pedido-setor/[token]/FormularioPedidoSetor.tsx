'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Script from 'next/script'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { enviarPedidoDeSetor } from '@/lib/actions-pedidos-setor'
import { normalizarPedidoPublico, MAX_SETORES_POR_PEDIDO, type ContextoDoPedido } from '@/lib/pedido-setor-regras'
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
  const [setores, setSetores] = useState<SetorForm[]>(() => [novoSetor()])
  const [observacao, setObservacao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)

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

      {setores.map((s, i) => (
        <Bloco
          key={s.chave}
          titulo={setores.length > 1 ? `Serviço / Fornecedor ${i + 1}` : 'Serviço / Fornecedor'}
          acao={setores.length > 1 && (
            <button type="button" onClick={() => setSetores(l => l.filter(x => x.chave !== s.chave))} className="text-red-500 text-xs font-medium inline-flex items-center gap-1 hover:underline">
              <Trash2 className="w-3.5 h-3.5" /> Remover
            </button>
          )}
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

      {setores.length < MAX_SETORES_POR_PEDIDO && (
        <button type="button" onClick={() => setSetores(l => [...l, novoSetor()])} className="btn btn-secundario w-full">
          <Plus className="w-4 h-4" /> Incluir outro serviço / fornecedor neste pedido
        </button>
      )}

      <Campo rotulo="Observação (opcional)">
        <textarea rows={3} maxLength={500} value={observacao} onChange={e => setObservacao(e.target.value)} className="input" placeholder="Algo que o administrador precisa saber?" />
      </Campo>

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

      <button type="submit" disabled={enviando || (!!TURNSTILE_SITE_KEY && !turnstileToken)} className="w-full btn btn-primario btn-lg">
        {enviando ? 'Enviando…' : 'Enviar pedido →'}
      </button>
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
