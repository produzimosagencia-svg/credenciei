'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { Check, Repeat } from 'lucide-react'
import { trocarFuncao } from '@/lib/actions-funcoes'
import { ROLE_LABELS, type Role } from '@/lib/permissions'

type Funcao = { role: string; base?: boolean; chave?: string }
const chaveDe = (f: Funcao) => f.chave ?? f.role
/** Uma entrada por papel (a mesma função em duas organizações é UM perfil). */
export const perfisUnicos = (funcoes: Funcao[]) => funcoes.filter((f, i) => funcoes.findIndex(g => g.role === f.role) === i)

/**
 * Trocar de perfil — pra quem tem mais de uma função (supervisor e Gestor de
 * credenciamento, Encarregado e supervisor…). A pessoa escolhe com qual está
 * trabalhando agora; o sistema a trata como UMA função só, a escolhida.
 *
 * Depois de trocar, recarrega a página inteira (não só a rota): o menu, os
 * botões e as telas permitidas mudam com a função, e a casca certa (painel ou
 * área do Encarregado) precisa abrir de novo.
 */
export function ListaDePerfis({ funcoes, ativa, aoEscolher }: {
  funcoes: Funcao[]
  ativa: string
  aoEscolher?: () => void
}) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  // Um item por PERFIL: quem é Gestor de credenciamento em duas organizações vê "Operador de portão" uma vez
  // só e escolhe o EVENTO depois (seletor do topo) — nome de organização não aparece aqui.
  const perfis = perfisUnicos(funcoes)
  const roleAtiva = funcoes.find(f => chaveDe(f) === ativa)?.role ?? ativa

  const escolher = (role: string) => {
    if (role === roleAtiva || pendente) return
    setErro(null)
    iniciar(async () => {
      const r = await trocarFuncao(role)
      if ('erro' in r) { setErro(r.erro); return }
      aoEscolher?.()
      window.location.assign(r.destino)
    })
  }

  return (
    <div role="group" aria-label="Trocar de perfil">
      {perfis.map(f => {
        const atual = f.role === roleAtiva
        return (
          <button
            key={f.role} type="button" role="menuitemradio" aria-checked={atual} disabled={pendente}
            onClick={() => escolher(f.role)}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors disabled:opacity-60 ${
              atual ? 'text-brand-600 font-semibold bg-brand-50' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            {atual ? <Check className="w-4 h-4 shrink-0" /> : <span className="w-4 h-4 shrink-0" />}
            <span className="truncate">{ROLE_LABELS[f.role as Role] ?? f.role}</span>
            {pendente && !atual && <span className="ml-auto text-2xs text-slate-400">…</span>}
          </button>
        )
      })}
      {erro && <p role="alert" className="px-3 py-2 text-red-500 text-xs">{erro}</p>}
    </div>
  )
}

/** O botão compacto (ícone) com a lista num popover — pra casca enxuta do Encarregado, que não tem o menu do usuário. */
export default function MenuTrocarPerfil({ funcoes, ativa }: { funcoes: Funcao[]; ativa: string }) {
  const [aberto, setAberto] = useState(false)
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto) return
    const clique = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', clique)
    document.addEventListener('keydown', tecla)
    return () => { document.removeEventListener('mousedown', clique); document.removeEventListener('keydown', tecla) }
  }, [aberto])

  if (perfisUnicos(funcoes).length < 2) return null
  return (
    <div className="relative shrink-0" ref={caixa}>
      <button
        type="button" onClick={() => setAberto(v => !v)} aria-haspopup="menu" aria-expanded={aberto}
        aria-label="Trocar de perfil" title="Trocar de perfil"
        className="btn-press inline-flex items-center gap-1.5 rounded-xl border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-300 text-xs font-semibold px-2.5 h-9 transition-colors"
      >
        <Repeat className="w-4 h-4" />
        <span className="hidden sm:inline">Trocar perfil</span>
      </button>
      {aberto && (
        <div role="menu" className="modal-pop-in absolute right-0 top-full mt-2 w-56 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50">
          <p className="px-3 pt-2.5 pb-1 text-2xs uppercase tracking-wide font-semibold text-slate-400">Trocar de perfil</p>
          <ListaDePerfis funcoes={funcoes} ativa={ativa} aoEscolher={() => setAberto(false)} />
        </div>
      )}
    </div>
  )
}
