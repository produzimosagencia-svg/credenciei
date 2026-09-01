'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, ChevronDown, Loader2 } from 'lucide-react'
import { trocarSetorAtivo } from '@/lib/actions'
import { mensagemAmigavel } from '@/lib/erros'

type Setor = { id: string; nome: string; evento_id: string }

/**
 * O seletor de setor do supervisor que cobre mais de um.
 *
 * Só aparece com dois ou mais: com um só ele seria um menu de uma opção,
 * ocupando espaço para não oferecer escolha nenhuma.
 *
 * Trocar aqui muda o setor ATIVO do perfil (ver `trocarSetorAtivo`), e é isso
 * que faz o resto do sistema — scanner, pendências, registro assistido,
 * "minha equipe" — seguir junto sem precisar saber que existe mais de um.
 */
export default function TrocarSetor({ setores, atualId }: { setores: Setor[]; atualId: string }) {
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (setores.length < 2) return null

  const atual = setores.find(s => s.id === atualId)

  const trocar = (setor: Setor) => {
    if (setor.id === atualId) { setAberto(false); return }
    setErro(null)
    startTransition(async () => {
      /*
       * NAVEGA PRIMEIRO, marca depois.
       *
       * A página do setor já aceita qualquer setor vinculado, então a
       * navegação não depende da escrita — e é ela que o supervisor está
       * esperando ver. `trocarSetorAtivo` continua sendo chamada porque as
       * OUTRAS telas (pendências, atividades, "minha equipe" no scanner)
       * ainda seguem o setor ativo; falhando, o pior que acontece é elas
       * continuarem no setor anterior, e não a troca não acontecer.
       */
      router.push(`/admin/eventos/${setor.evento_id}/fornecedor/${setor.id}`)
      setAberto(false)
      try {
        await trocarSetorAtivo(setor.id)
        router.refresh()
      } catch (e: any) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAberto(a => !a)}
        disabled={isPending}
        className="btn btn-secundario btn-sm disabled:opacity-50"
      >
        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
        <span className="truncate max-w-[10rem]">{atual?.nome ?? 'Trocar setor'}</span>
        <ChevronDown className="w-3 h-3 opacity-60" />
      </button>

      {aberto && (
        <>
          {/* Fecha ao clicar fora, sem prender o foco numa camada modal. */}
          <div className="fixed inset-0 z-40" onClick={() => setAberto(false)} />
          <div className="absolute right-0 mt-1 z-50 w-60 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <p className="text-slate-400 text-2xs uppercase tracking-wide font-semibold px-3 pt-2.5 pb-1">
              Seus setores ({setores.length})
            </p>
            {setores.map(s => (
              <button
                key={s.id}
                onClick={() => trocar(s)}
                disabled={isPending}
                className="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <span className="truncate flex-1">{s.nome}</span>
                {s.id === atualId && <Check className="w-3.5 h-3.5 text-brand-500 shrink-0" />}
              </button>
            ))}
          </div>
        </>
      )}

      {erro && <p className="text-red-500 text-2xs mt-1 absolute right-0 whitespace-nowrap">{erro}</p>}
    </div>
  )
}
