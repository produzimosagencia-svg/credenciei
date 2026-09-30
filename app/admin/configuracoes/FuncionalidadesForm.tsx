'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { editarFuncionalidadesOrganizacao, type FuncionalidadesOrganizacao } from '@/lib/actions'
import { mensagemAmigavel } from '@/lib/erros'

/**
 * Dois interruptores, um cliente. Nasce tudo desligado (pedido do Vital,
 * 30/09/2026) — a maioria dos clientes nunca vai ver nada disto ligado.
 */
export default function FuncionalidadesForm({
  organizacaoId, funcionalidades,
}: {
  organizacaoId: string
  funcionalidades: FuncionalidadesOrganizacao
}) {
  const [isPending, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const router = useRouter()

  const salvar = (formData: FormData) => {
    setErro(null)
    startTransition(async () => {
      try {
        await editarFuncionalidadesOrganizacao(organizacaoId, formData)
        router.refresh()
      } catch (e) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <form action={salvar} className="space-y-3">
      <label className="block bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-brand-300 transition-colors">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            name="subeventos_habilitado"
            defaultChecked={funcionalidades.subeventosHabilitado}
            className="w-4 h-4 mt-0.5 rounded border-slate-300 text-brand-500 focus:ring-brand-400 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-slate-800 font-semibold text-sm">Subeventos</p>
            <p className="text-slate-600 text-xs mt-1">
              Evento mãe com subeventos (portões/categorias de acesso diferentes no mesmo
              evento — ex.: Camarote, Arquibancada, Geral). Cada fornecedor é escalado por
              subevento, com cota própria, e o operador do portão escolhe qual subevento vai
              ler. Liga a seção &quot;Subeventos&quot; dentro de cada evento desta organização.
            </p>
          </div>
        </div>
      </label>

      <label className="block bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-brand-300 transition-colors">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            name="trava_cota_habilitada"
            defaultChecked={funcionalidades.travaCotaHabilitada}
            className="w-4 h-4 mt-0.5 rounded border-slate-300 text-brand-500 focus:ring-brand-400 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-slate-800 font-semibold text-sm">Trava de cota</p>
            <p className="text-slate-600 text-xs mt-1">
              A cota máxima de pessoas (do fornecedor, ou da escala em cada subevento) passa a
              BLOQUEAR novo cadastro — por link e por planilha — em vez de só aparecer como
              referência. Quem tentar se cadastrar acima do limite vê: &quot;Seu setor está com o
              número máximo de pessoas. Contate seu supervisor.&quot;
            </p>
          </div>
        </div>
      </label>

      {erro && <p className="text-red-500 text-xs">{erro}</p>}

      <button type="submit" disabled={isPending} className="btn btn-primario btn-sm">
        {isPending ? 'Salvando...' : 'Salvar'}
      </button>
    </form>
  )
}
