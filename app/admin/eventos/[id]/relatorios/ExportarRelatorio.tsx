'use client'
import { useState, useTransition } from 'react'
import { FileSpreadsheet, Download, AlertTriangle, Building2, Users, CalendarRange, FolderArchive, UserCheck, UserX, LayoutGrid, FileText } from 'lucide-react'
import { LogoLoading } from '@/components/LogoLoading'
import { obterDadosRelatorioEvento, obterDadosRelatorioSetor, obterDadosRelatorioSubevento } from '@/lib/relatorios'
import type { Periodo } from '@/lib/relatorios'
import { gerarRelatorioCompleto, gerarRelatorioSetor, gerarRelatoriosPorSetorZip, gerarRelatorioAusentes, gerarRelatorioSubevento } from '@/lib/relatorio-excel'
import { mensagemAmigavel } from '@/lib/erros'
import SeletorLista from '@/components/SeletorLista'
import { Secao } from '@/components/ui/Superficie'
import SeletorDePeriodo from '@/components/SeletorDePeriodo'

/** `area` = o subgrupo do fornecedor — vai junto do nome na lista (há fornecedores com o mesmo nome em subgrupos diferentes). */
type Setor = { id: string; nome: string; area?: string | null }

/**
 * Os dois cartões de exportação — "relatório completo" e "relatório por
 * setor" — mais o filtro de período, que vale pros dois.
 *
 * O período é a melhoria central pedida: um evento tem dias de montagem,
 * o dia principal e desmontagem, e o gestor precisa conseguir analisar
 * qualquer recorte sem gerar relatório separado pra cada fase. Os campos de
 * data começam preenchidos com o período INTEIRO do evento — abrir a tela e
 * exportar sem tocar em nada continua funcionando exatamente como antes.
 *
 * Busca os dados e monta o .xlsx no clique: gerar antes disso gastaria
 * memória do navegador com um arquivo que a pessoa talvez nem baixe.
 */
export default function ExportarRelatorio({
  eventoId, periodoCompleto, setores, totalFuncionarios, subgrupos = [],
}: {
  eventoId: string
  periodoCompleto: Periodo
  setores: Setor[]
  totalFuncionarios: number
  /** Os subgrupos do evento — o cartão "Relatório por subgrupo" só aparece com eles (quem gerencia o evento inteiro). */
  subgrupos?: { id: string; nome: string; fornecedores: number }[]
}) {
  const [periodo, setPeriodo] = useState<Periodo>(periodoCompleto)
  /*
   * Quem a planilha lista. O relatório sempre mostrou só quem tem batida —
   * "quem faltou" só se descobria subtraindo a planilha da lista da equipe
   * na mão (pedido do Juan, 03/09/2026). Vale pros três botões: um recorte
   * de gente, não um tipo de arquivo.
   */
  const [quem, setQuem] = useState<'credenciados' | 'ausentes'>('credenciados')
  const ausentes = quem === 'ausentes'
  const [setorId, setSetorId] = useState(setores[0]?.id ?? '')
  const [erroCompleto, setErroCompleto] = useState<string | null>(null)
  const [erroSetor, setErroSetor] = useState<string | null>(null)
  const [gerandoCompleto, startCompleto] = useTransition()
  const [gerandoSetor, startSetor] = useTransition()
  const [erroTodos, setErroTodos] = useState<string | null>(null)
  const [gerandoTodos, startTodos] = useTransition()
  /*
   * FECHAMENTO DO TURNO em PDF, no padrão novo (docs/modelo de relatorio .pdf, Juan, 12/10/2026): por equipe, quem
   * entrou e quem está sem saída no dia. Abre numa aba própria, com "Baixar PDF".
   */
  const diasDoPeriodo = (() => {
    const lista: string[] = []
    for (let d = new Date(`${periodoCompleto.de}T12:00:00Z`); d <= new Date(`${periodoCompleto.ate}T12:00:00Z`) && lista.length < 62; d.setUTCDate(d.getUTCDate() + 1)) {
      lista.push(d.toISOString().slice(0, 10))
    }
    return lista
  })()
  // O dia de hoje (Brasília) se estiver no período; senão, o último dia do período. "De" e "até" começam nele (um turno).
  const [turnoDe, setTurnoDe] = useState(() => {
    const hojeBRT = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    return diasDoPeriodo.includes(hojeBRT) ? hojeBRT : (diasDoPeriodo.at(-1) ?? hojeBRT)
  })
  /* Vários dias no mesmo PDF (Juan, 13/10/2026: "preciso poder filtrar mais dias, por exemplo dia 10/10 a 12/10"). */
  const [turnoAte, setTurnoAte] = useState(turnoDe)
  const rotuloDia = (d: string) => {
    const semana = new Date(`${d}T12:00:00-03:00`).toLocaleDateString('pt-BR', { weekday: 'short', timeZone: 'America/Sao_Paulo' }).replace('.', '')
    return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)} · ${semana}`
  }
  const opcoesDia = diasDoPeriodo.map(d => ({ valor: d, rotulo: rotuloDia(d) }))
  const [soPagas, setSoPagas] = useState(true)
  // Presença em PDF (completo ou de um fornecedor), no mesmo período e no mesmo recorte de "quem entra".
  const abrirPresencaPdf = (setor?: string) => {
    const q = new URLSearchParams({ de: periodo.de, ate: periodo.ate })
    if (setor) q.set('setor', setor)
    if (ausentes) q.set('quem', 'ausentes')
    window.open(`/relatorios-pdf/${eventoId}/presenca?${q.toString()}`, '_blank', 'noopener')
  }
  const abrirFechamento = () => {
    window.open(`/relatorios-pdf/${eventoId}/turno?de=${turnoDe}&ate=${turnoAte}${soPagas ? '' : '&escopo=todas'}`, '_blank', 'noopener')
  }
  const [subgrupoId, setSubgrupoId] = useState(subgrupos[0]?.id ?? '')
  const [erroSubgrupo, setErroSubgrupo] = useState<string | null>(null)
  const [gerandoSubgrupo, startSubgrupo] = useTransition()

  // O relatório do subgrupo parte da EQUIPE (todo mundo, com a situação de cada um) — mesmo de dentro da tela do subgrupo.
  const exportarSubgrupo = () => {
    if (!subgrupoId) return
    setErroSubgrupo(null)
    startSubgrupo(async () => {
      try {
        const r = await obterDadosRelatorioSubevento(eventoId, subgrupoId, periodo)
        if ('erro' in r) { setErroSubgrupo(r.erro); return }
        await gerarRelatorioSubevento(r.dados)
      } catch (e: unknown) {
        setErroSubgrupo(mensagemAmigavel(e))
      }
    })
  }

  const periodoValido = periodo.de <= periodo.ate

  const exportarCompleto = () => {
    setErroCompleto(null)
    startCompleto(async () => {
      try {
        const r = await obterDadosRelatorioEvento(eventoId, periodo)
        if ('erro' in r) { setErroCompleto(r.erro); return }
        if (ausentes) await gerarRelatorioAusentes(r.dados)
        else await gerarRelatorioCompleto(r.dados)
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
        const r = await obterDadosRelatorioSetor(eventoId, setorId, periodo)
        if ('erro' in r) { setErroSetor(r.erro); return }
        if (ausentes) await gerarRelatorioAusentes(r.dados)
        else await gerarRelatorioSetor(r.dados)
      } catch (e: unknown) {
        setErroSetor(mensagemAmigavel(e))
      }
    })
  }

  /*
   * Todos os setores, um arquivo por setor, num .zip. Usa os dados do
   * relatório completo (uma busca só) e quebra no navegador — sem 43 idas
   * ao servidor. A permissão é a do relatório completo: quem só vê o
   * próprio setor recebe o erro da action, não um zip com um arquivo.
   */
  const exportarTodosSeparados = () => {
    setErroTodos(null)
    startTodos(async () => {
      try {
        const r = await obterDadosRelatorioEvento(eventoId, periodo)
        if ('erro' in r) { setErroTodos(r.erro); return }
        await gerarRelatoriosPorSetorZip(r.dados, quem)
      } catch (e: unknown) {
        setErroTodos(mensagemAmigavel(e))
      }
    })
  }

  return (
    <div className="space-y-5">
      {/*
        * Um filtro só, usado pelos dois cartões — em vez de repetir os
        * campos de data dentro de cada um. "Quantos dias tem o evento" é
        * uma pergunta, não duas.
        */}
      <Secao icone={<CalendarRange className="w-3.5 h-3.5" />} titulo="Período e quem entra" corpoClassName="p-5 space-y-4">
        <SeletorDePeriodo value={periodo} onChange={setPeriodo} periodoCompleto={periodoCompleto} className="w-64" />
        {!periodoValido && (
          <p className="text-red-500 text-xs">A data inicial precisa vir antes (ou no mesmo dia) da data final.</p>
        )}

        <div>
          <label className="text-slate-500 text-xs font-medium block mb-1.5">Quem entra na planilha</label>
          <div className="inline-flex p-1 bg-slate-100 rounded-xl gap-1">
            <button
              type="button" onClick={() => setQuem('credenciados')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                !ausentes ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <UserCheck className="w-3.5 h-3.5" /> Quem credenciou
            </button>
            <button
              type="button" onClick={() => setQuem('ausentes')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                ausentes ? 'bg-white text-brand-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <UserX className="w-3.5 h-3.5" /> Quem NÃO credenciou
            </button>
          </div>
          <p className="text-slate-400 text-xs mt-2">
            {ausentes
              ? 'A planilha lista quem está na equipe e não bateu nenhuma batida no período — sem data, entrada ou saída, porque não existem.'
              : 'A planilha lista quem bateu ponto no período, dia a dia, com entrada e saída.'}
          </p>
        </div>
      </Secao>

      {/* FECHAMENTO DO TURNO — PDF no padrão novo (o do modelo). */}
      <Secao
        tom="acento"
        icone={<FileText className="w-3.5 h-3.5" />}
        titulo="Fechamento do turno · PDF"
        descricao="Por equipe: quem entrou e quem ainda está sem saída — num dia ou em vários — no padrão novo dos relatórios"
        corpoClassName="p-5 space-y-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-slate-500 text-xs font-medium block mb-1.5">De</label>
            <SeletorLista
              valor={turnoDe}
              onChange={d => { setTurnoDe(d); if (d > turnoAte) setTurnoAte(d) }}
              titulo="Primeiro dia"
              opcoes={opcoesDia}
            />
          </div>
          <div>
            <label className="text-slate-500 text-xs font-medium block mb-1.5">Até</label>
            <SeletorLista
              valor={turnoAte}
              onChange={d => { setTurnoAte(d); if (d < turnoDe) setTurnoDe(d) }}
              titulo="Último dia"
              opcoes={opcoesDia}
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 pb-2">
            <input type="checkbox" checked={soPagas} onChange={e => setSoPagas(e.target.checked)} className="w-4 h-4 accent-brand-500" />
            Só equipes pagas por pessoa (as que pedem o meio)
          </label>
        </div>
        <button onClick={abrirFechamento} className="btn btn-primario w-full sm:w-auto">
          <FileText className="w-4 h-4" /> Abrir PDF do fechamento
        </button>
      </Secao>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* RELATÓRIO COMPLETO — só existe se houver mais de um setor visível;
            com um setor só, "completo" e "por setor" seriam o mesmo arquivo. */}
        {setores.length > 1 && (
          <Secao
            tom="acento"
            icone={<FileSpreadsheet className="w-3.5 h-3.5" />}
            titulo="Relatório completo"
            descricao="Todos os fornecedores, numa planilha só — uma aba por fornecedor"
            corpoClassName="p-5 space-y-4"
          >
            <div className="flex items-center gap-4 text-sm text-slate-600">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-slate-400" />
                {setores.length} fornecedores
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-400" />
                {totalFuncionarios.toLocaleString('pt-BR')} funcionários
              </span>
            </div>
            {erroCompleto && (
              <p className="flex items-start gap-1.5 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                {erroCompleto}
              </p>
            )}
            <button
              onClick={exportarCompleto}
              disabled={gerandoCompleto || !periodoValido}
              className="btn btn-primario w-full disabled:opacity-60"
            >
              {gerandoCompleto
                ? <><LogoLoading tamanho="xs" /> Gerando planilha...</>
                : <><Download className="w-4 h-4" /> {ausentes ? 'Exportar quem NÃO credenciou' : 'Exportar relatório completo'}</>}
            </button>
            {/* O PDF no padrão novo — a versão resumida (as planilhas continuam). */}
            <button onClick={() => abrirPresencaPdf()} disabled={!periodoValido} className="btn btn-secundario w-full disabled:opacity-60">
              <FileText className="w-4 h-4" /> {ausentes ? 'PDF de quem NÃO credenciou' : 'PDF resumido (entrada, meio, saída, horas, fora do local)'}
            </button>
          </Secao>
        )}

        {/* RELATÓRIO POR SETOR */}
        {!!setores.length && (
          <Secao
            icone={<Building2 className="w-3.5 h-3.5" />}
            titulo="Relatório por fornecedor"
            descricao="Uma planilha só com a equipe do fornecedor escolhido"
            corpoClassName="p-5 space-y-4"
          >
            <div>
              <label className="text-slate-500 text-xs font-medium block mb-1.5">Selecione o fornecedor</label>
              <SeletorLista
                valor={setorId}
                onChange={setSetorId}
                titulo="Escolha o fornecedor"
                busca
                opcoes={setores.map(s => ({ valor: s.id, rotulo: s.area ? `${s.nome} · ${s.area}` : s.nome }))}
              />
            </div>
            {erroSetor && (
              <p className="flex items-start gap-1.5 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                {erroSetor}
              </p>
            )}
            <button
              onClick={exportarSetor}
              disabled={gerandoSetor || !setorId || !periodoValido}
              className="btn btn-secundario w-full disabled:opacity-60"
            >
              {gerandoSetor
                ? <><LogoLoading tamanho="xs" /> Gerando planilha...</>
                : <><Download className="w-4 h-4" /> {ausentes ? 'Exportar quem NÃO credenciou' : 'Exportar fornecedor'}</>}
            </button>
            <button onClick={() => abrirPresencaPdf(setorId)} disabled={!setorId || !periodoValido} className="btn btn-secundario w-full disabled:opacity-60">
              <FileText className="w-4 h-4" /> {ausentes ? 'PDF de quem NÃO credenciou' : 'PDF resumido do fornecedor'}
            </button>

            {setores.length > 1 && (
              <div className="border-t border-slate-100 pt-4">
                <p className="text-slate-500 text-xs mb-2">
                  Ou baixe <strong className="text-slate-700">todos os {setores.length} fornecedores</strong> de uma vez, um arquivo por fornecedor, num .zip — pronto pra mandar cada planilha pro seu fornecedor.
                </p>
                {erroTodos && (
                  <p className="flex items-start gap-1.5 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    {erroTodos}
                  </p>
                )}
                <button
                  onClick={exportarTodosSeparados}
                  disabled={gerandoTodos || !periodoValido}
                  className="btn btn-secundario w-full disabled:opacity-60"
                >
                  {gerandoTodos
                    ? <><LogoLoading tamanho="xs" /> Gerando {setores.length} planilhas...</>
                    : <><FolderArchive className="w-4 h-4" /> Exportar todos os fornecedores em arquivos separados</>}
                </button>
              </div>
            )}
          </Secao>
        )}

        {/* RELATÓRIO POR SUBGRUPO (pedido do Juan, 11/10/2026) */}
        {subgrupos.length > 0 && (
          <Secao
            icone={<LayoutGrid className="w-3.5 h-3.5" />}
            titulo="Relatório por subgrupo"
            descricao="Todos os fornecedores do subgrupo numa planilha só: equipe, situação de cada um, dias, batidas e supervisores"
            corpoClassName="p-5 space-y-4"
          >
            <div>
              <label className="text-slate-500 text-xs font-medium block mb-1.5">Selecione o subgrupo</label>
              <SeletorLista
                valor={subgrupoId}
                onChange={setSubgrupoId}
                titulo="Escolha o subgrupo"
                opcoes={subgrupos.map(sg => ({ valor: sg.id, rotulo: `${sg.nome} · ${sg.fornecedores} fornecedor${sg.fornecedores === 1 ? '' : 'es'}` }))}
              />
            </div>
            {ausentes && (
              <p className="text-slate-400 text-xs">O relatório do subgrupo já traz a equipe inteira, com quem bateu e quem não bateu — o recorte “quem NÃO credenciou” não muda ele.</p>
            )}
            {erroSubgrupo && (
              <p className="flex items-start gap-1.5 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                {erroSubgrupo}
              </p>
            )}
            <button
              onClick={exportarSubgrupo}
              disabled={gerandoSubgrupo || !subgrupoId || !periodoValido}
              className="btn btn-secundario w-full disabled:opacity-60"
            >
              {gerandoSubgrupo
                ? <><LogoLoading tamanho="xs" /> Gerando planilha...</>
                : <><Download className="w-4 h-4" /> Exportar subgrupo</>}
            </button>
            <button
              onClick={() => window.open(`/relatorios-pdf/${eventoId}/subgrupo/${subgrupoId}?de=${periodo.de}&ate=${periodo.ate}`, '_blank', 'noopener')}
              disabled={!subgrupoId || !periodoValido}
              className="btn btn-secundario w-full disabled:opacity-60"
            >
              <FileText className="w-4 h-4" /> PDF do subgrupo
            </button>
          </Secao>
        )}

        {!setores.length && (
          <p className="text-slate-400 text-sm lg:col-span-2">
            Ainda não há fornecedores com equipe cadastrada neste evento para gerar relatório.
          </p>
        )}
      </div>
    </div>
  )
}
