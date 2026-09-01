'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowRight, Loader2, ShieldCheck } from 'lucide-react'
import { identificarNaPortaria } from '@/lib/actions'

type Setor = { id: string; nome: string; token_formulario: string | null }

const soDigitos = (v: string) => v.replace(/\D/g, '').slice(0, 11)

const mascara = (d: string) =>
  d.length <= 3 ? d
  : d.length <= 6 ? `${d.slice(0, 3)}.${d.slice(3)}`
  : d.length <= 9 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`
  : `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`

/**
 * O primeiro passo do cartaz da portaria: "você já é cadastrado?"
 *
 * Já credenciada neste evento → a tela manda direto pro check-in, sem passar
 * pelo formulário de novo (é o "mostrar a etapa" que o autocredenciamento
 * pede pra quem já passou por aqui). Não achou → cai na escolha de setor que
 * já existia, levando o CPF digitado adiante pra não pedir de novo.
 */
export default function IdentificarPorCpf({ eventoId, setores }: { eventoId: string; setores: Setor[] }) {
  const router = useRouter()
  const [cpf, setCpf] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [naoEncontrado, setNaoEncontrado] = useState(false)

  const continuar = async () => {
    if (cpf.length !== 11 || carregando) return
    setCarregando(true)
    setErro(null)
    try {
      const r = await identificarNaPortaria(eventoId, cpf)
      if (r.qrToken) {
        router.push(`/credential/${r.qrToken}`)
        return // mantém "conferindo" até a navegação trocar a tela
      }
      if (r.naoEncontrado) {
        setNaoEncontrado(true)
        setCarregando(false)
      } else {
        setErro(r.error ?? 'Não foi possível conferir agora. Tente de novo.')
        setCarregando(false)
      }
    } catch {
      setErro('Não foi possível conferir agora. Tente de novo.')
      setCarregando(false)
    }
  }

  if (naoEncontrado) {
    return (
      <>
        <h2 className="text-slate-800 font-bold text-lg">Em qual setor você vai trabalhar?</h2>
        <p className="text-slate-500 text-sm mt-1 mb-4">
          Não achamos seu CPF neste evento — vamos te cadastrar. Escolha o seu setor; se
          não souber, pergunte a quem te chamou.
        </p>

        {/*
          * Um setor por linha, com alvo grande.
          *
          * A pessoa está de pé, no sol, com fila atrás e o celular numa mão
          * só. Grade de dois faria alvos pequenos e escolha errada — e
          * escolher errado aqui custa caro: ela cai no formulário de outro
          * setor e, depois de cadastrada, o sistema recusa trocar (a mesma
          * pessoa não pode estar em dois setores do mesmo evento).
          */}
        <div className="space-y-2.5">
          {setores.map(s => (
            <Link
              key={s.id}
              href={`/form/${s.token_formulario}?de=portaria&cpf=${cpf}`}
              className="flex items-center justify-between gap-3 bg-white rounded-2xl border border-slate-200
                         px-4 py-4 active:bg-slate-50 hover:border-brand-300 transition-colors"
            >
              <span className="text-slate-800 font-semibold text-base min-w-0 truncate">
                {s.nome.trim()}
              </span>
              <ArrowRight className="w-4 h-4 text-brand-500 shrink-0" />
            </Link>
          ))}
        </div>

        <p className="text-slate-400 text-xs text-center mt-6">
          Leva menos de dois minutos. No fim você recebe sua credencial com QR Code.
        </p>
      </>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <ShieldCheck className="w-8 h-8 text-brand-500 mx-auto" />
      <h2 className="text-slate-800 font-bold text-lg text-center mt-2">Qual é o seu CPF?</h2>
      <p className="text-slate-500 text-sm text-center mt-1 mb-4">
        Já se cadastrou antes neste evento? A gente confere e já te leva pro registro —
        sem preencher o formulário de novo.
      </p>
      <input
        autoFocus
        inputMode="numeric"
        value={mascara(cpf)}
        onChange={e => setCpf(soDigitos(e.target.value))}
        onKeyDown={e => { if (e.key === 'Enter') continuar() }}
        placeholder="000.000.000-00"
        className="w-full text-2xl tracking-wide tabular-nums text-center font-semibold
                   border border-slate-200 rounded-xl px-3 py-3 focus:border-brand-400 focus:outline-none"
      />
      {erro && <p className="text-red-500 text-xs text-center mt-2">{erro}</p>}
      <button
        onClick={continuar}
        disabled={cpf.length !== 11 || carregando}
        className="btn btn-primario btn-lg w-full mt-4 disabled:opacity-50"
      >
        {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
        {carregando ? 'Conferindo…' : 'Continuar'}
      </button>
    </div>
  )
}
