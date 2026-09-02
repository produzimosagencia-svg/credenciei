'use client'
import { useState, useTransition } from 'react'
import { FileSpreadsheet, Download, Loader2, AlertTriangle, Building2, Users } from 'lucide-react'
import { obterDadosRelatorioEvento, obterDadosRelatorioSetor } from '@/lib/relatorios'
import { gerarRelatorioCompleto, gerarRelatorioSetor } from '@/lib/relatorio-excel'
import { mensagemAmigavel } from '@/lib/erros'
import { formatarBR } from '@/lib/tz'
import { Secao } from '@/components/ui/Superficie'

type Setor = { id: string; nome: string }

/**
 * Os dois cartões de exportação — "relatório completo" e "relatório por
 * setor" (seção 15 do pedido). Busca os dados e monta o .xlsx no clique:
 * gerar antes disso gastaria memória do navegador com um arquivo que a
 * pessoa talvez nem baixe.
 *
 * Um cartão só aparece se houver setor pra mostrar: supervisor chega aqui
 * com os próprios setores (via `meusSetores`, do lado do servidor) e nunca
 * vê "relatório completo" — a lista vem vazia de setores de fora do seu
 * acesso, não porque o botão foi escondido, mas porque o servidor nunca
 * devolveria os dados de qualquer forma (ver `exigirAcessoAoEvento`).
 */
export default function ExportarRelatorio({
  eventoId, dataInicioISO, dataFimISO, setores, totalFuncionarios,
}: {
  eventoId: string
  dataInicioISO: string
  dataFimISO: string
  setores: Setor[]
  totalFuncionarios: number
}) {
  const [setorId, setSetorId] = useState(setores[0]?.id ?? '')
  const [erroCompleto, setErroCompleto] = useState<string | null>(null)
  const [erroSetor, setErroSetor] = useState<string | null>(null)
  const [gerandoCompleto, startCompleto] = useTransition()
  const [gerandoSetor, startSetor] = useTransition()

  const exportarCompleto = () => {
    setErroCompleto(null)
    startCompleto(async () => {
      try {
        const r = await obterDadosRelatorioEvento(eventoId)
        if ('erro' in r) { setErroCompleto(r.erro); return }
        await gerarRelatorioCompleto(r.dados)
      } catch (e: unknown) {
        setErroCompleto(mensagemAmigavel(e))
      }
    })
  }

  const exportarSetor = () => {
    if (!setorId) return
    setErroSetor(null)
    startSetor(async () => {
      try {
        const r = await obterDadosRelatorioSetor(eventoId, setorId)
        if ('erro' in r) { setErroSetor(r.erro); return }
        await gerarRelatorioSetor(r.dados)
      } catch (e: unknown) {
        setErroSetor(mensagemAmigavel(e))
      }
    })
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* RELATÓRIO COMPLETO — só existe se houver mais de um setor visível;
          com um setor só, "completo" e "por setor" seriam o mesmo arquivo. */}
      {setores.length > 1 && (
        <Secao
          tom="acento"
          icone={<FileSpreadsheet className="w-3.5 h-3.5" />}
          titulo="Relatório completo"
          descricao="Todos os setores, numa planilha só — uma aba por setor"
          corpoClassName="p-5 space-y-4"
        >
          <div className="flex items-center gap-4 text-sm text-slate-600">
            <span className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-slate-400" />
              {setores.length} setores
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-slate-400" />
              {totalFuncionarios.toLocaleString('pt-BR')} funcionários
            </span>
          </div>
          <p className="text-slate-400 text-xs">
            Período: {formatarBR(dataInicioISO, 'data')} → {formatarBR(dataFimISO, 'data')}
          </p>
          {erroCompleto && (
            <p className="flex items-start gap-1.5 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              {erroCompleto}
            </p>
          )}
          <button onClick={exportarCompleto} disabled={gerandoCompleto} className="btn btn-primario w-full disabled:opacity-60">
            {gerandoCompleto
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando planilha...</>
              : <><Download className="w-4 h-4" /> Exportar relatório completo</>}
          </button>
        </Secao>
      )}

      {/* RELATÓRIO POR SETOR */}
      {!!setores.length && (
        <Secao
          icone={<Building2 className="w-3.5 h-3.5" />}
          titulo="Relatório por setor"
          descricao="Uma planilha só com a equipe do setor escolhido"
          corpoClassName="p-5 space-y-4"
        >
          <div>
            <label className="text-slate-500 text-xs font-medium block mb-1.5">Selecione o setor</label>
            <select value={setorId} onChange={e => setSetorId(e.target.value)} className="input">
              {setores.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </div>
          {erroSetor && (
            <p className="flex items-start gap-1.5 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
              {erroSetor}
            </p>
          )}
          <button onClick={exportarSetor} disabled={gerandoSetor || !setorId} className="btn btn-secundario w-full disabled:opacity-60">
            {gerandoSetor
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando planilha...</>
              : <><Download className="w-4 h-4" /> Exportar setor</>}
          </button>
        </Secao>
      )}

      {!setores.length && (
        <p className="text-slate-400 text-sm lg:col-span-2">
          Ainda não há setores com equipe cadastrada neste evento para gerar relatório.
        </p>
      )}
    </div>
  )
}
