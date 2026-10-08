'use client'
import { useState, useTransition } from 'react'
import { Check } from 'lucide-react'
import { editarFuncionalidadesOrganizacao, type FuncionalidadesOrganizacao } from '@/lib/actions'
import { mensagemAmigavel } from '@/lib/erros'

/**
 * Interruptores por cliente. Nasce tudo desligado (pedido do Vital,
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
  const [salvo, setSalvo] = useState(false)

  /*
   * Sem `router.refresh()` depois: a action já chama `revalidatePath`, e a
   * resposta dela traz a página atualizada. O refresh extra renderizava a
   * tela inteira de novo — era a maior parte da demora ao salvar.
   */
  const salvar = (formData: FormData) => {
    setErro(null)
    setSalvo(false)
    startTransition(async () => {
      try {
        await editarFuncionalidadesOrganizacao(organizacaoId, formData)
        setSalvo(true)
      } catch (e) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  return (
    <form action={salvar} onChange={() => setSalvo(false)} className="space-y-3">
      <label className="block bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-brand-300 transition-colors">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            name="subeventos_habilitado"
            defaultChecked={funcionalidades.subeventosHabilitado}
            className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-brand-500 shrink-0"
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
            className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-brand-500 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-slate-800 font-semibold text-sm">Trava de cota</p>
            <p className="text-slate-600 text-xs mt-1">
              A cota máxima de pessoas (do fornecedor, ou da escala em cada subevento) passa a
              BLOQUEAR novo cadastro — por link e por planilha — em vez de só aparecer como
              referência. Quem tentar se cadastrar acima do limite vê: &quot;Seu fornecedor está com o
              número máximo de pessoas. Contate seu supervisor.&quot;
            </p>
          </div>
        </div>
      </label>

      <label className="block bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-brand-300 transition-colors">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            name="aviso_uniforme_habilitado"
            defaultChecked={funcionalidades.avisoUniformeHabilitado}
            className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-brand-500 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-slate-800 font-semibold text-sm">Aviso de uniforme/identificação</p>
            <p className="text-slate-600 text-xs mt-1">
              Libera, em Editar evento, um campo de texto fixo sobre a obrigação de uniforme ou
              identificação — aparece como um banner permanente na credencial de cada pessoa da
              equipe (diferente dos avisos comuns, que somem depois de vistos).
            </p>
          </div>
        </div>
      </label>

      <label className="block bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-brand-300 transition-colors">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            name="escala_por_dia_habilitada"
            defaultChecked={funcionalidades.escalaPorDiaHabilitada}
            className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-brand-500 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-slate-800 font-semibold text-sm">Dias de trabalho escolhidos pelo funcionário</p>
            <p className="text-slate-600 text-xs mt-1">
              No formulário de cadastro, a pessoa marca em quais dias do evento vai trabalhar
              (montagem, evento, desmontagem — os dias configurados em Editar evento). O supervisor
              confirma ou ajusta os dias na aprovação, e o QR Code só libera a entrada nos dias
              aprovados. Por enquanto vale só para eventos com subeventos.
            </p>
          </div>
        </div>
      </label>

      <label className="block bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-brand-300 transition-colors">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            name="encarregados_habilitado"
            defaultChecked={funcionalidades.encarregadosHabilitado}
            className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-brand-500 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-slate-800 font-semibold text-sm">Permitir criação de Encarregados</p>
            <p className="text-slate-600 text-xs mt-1">
              O supervisor passa a ter, no menu, &quot;Criar Encarregado&quot;: ele escolhe alguém que já está na
              equipe do setor e libera para essa pessoa um acesso de CONSULTA — ela vê só a equipe daquele
              setor, sem nenhuma ação operacional. Desligar esconde a opção e impede novos Encarregados;
              quem já foi designado continua com o acesso.
            </p>
          </div>
        </div>
      </label>

      <label className="block bg-white rounded-2xl border border-slate-200 p-4 cursor-pointer hover:border-brand-300 transition-colors">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            name="area_no_scanner_habilitada"
            defaultChecked={funcionalidades.areaNoScannerHabilitada}
            className="w-4 h-4 mt-0.5 rounded border-slate-300 accent-brand-500 shrink-0"
          />
          <div className="min-w-0">
            <p className="text-slate-800 font-semibold text-sm">Selecionar a área no leitor de QR Code</p>
            <p className="text-slate-600 text-xs mt-1">
              Ligado: ao abrir o leitor, o operador escolhe em qual área (subevento) vai atuar, e a
              credencial de outra área é recusada com &quot;ÁREA DIFERENTE&quot;. Desligado (padrão): o leitor
              só abre a câmera e registra quem está entrando, sem perguntar área e sem recusar por área.
              Use ligado nos dias com mais de uma entrada.
            </p>
          </div>
        </div>
      </label>

      {erro && <p className="text-red-500 text-xs">{erro}</p>}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={isPending} className="btn btn-primario btn-sm">
          {isPending ? 'Salvando...' : 'Salvar'}
        </button>
        {salvo && (
          <span className="flex items-center gap-1 text-green-600 text-xs font-semibold">
            <Check className="w-3.5 h-3.5" /> Salvo
          </span>
        )}
      </div>
    </form>
  )
}
