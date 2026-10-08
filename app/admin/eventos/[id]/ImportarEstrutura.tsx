'use client'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import { previaImportacaoEstrutura, importarEstruturaLote } from '@/lib/actions'
import { lerPlanilhaDeEstrutura } from '@/lib/planilha'
import { listarDias } from '@/lib/escala-regras'
import type { LinhaEstrutura, PlanoEstrutura, ResultadoLinhaEstrutura, DecisoesEstrutura } from '@/lib/estrutura-regras'
import { Badge } from '@/components/ui/Superficie'

/**
 * Importar a ESTRUTURA do evento por planilha — fornecedores dentro de cada
 * área (subgrupo), trava de pessoas por dia e o supervisor de cada um
 * (pedido do Juan, 06/10/2026, para montar o Vital de uma vez).
 *
 *   1. escolhe o arquivo      → lido aqui no navegador (CPF por código, nunca pela IA)
 *   2. PRÉVIA                 → nada gravado; contagens e erros por linha
 *   3. Confirmar importação   → grava em levas de 5 linhas, com andamento
 *   4. resumo                 → o que foi criado, atualizado e o que ficou de fora
 *
 * Repetir a importação é seguro: o que já existe é atualizado, não duplicado.
 */

const LEVA = 5

type Etapa =
  | { tipo: 'arquivo' }
  | { tipo: 'previa'; linhas: LinhaEstrutura[]; plano: PlanoEstrutura; decisoes: DecisoesEstrutura }
  | { tipo: 'gravando'; feitas: number; total: number }
  | { tipo: 'fim'; plano: PlanoEstrutura; resultados: ResultadoLinhaEstrutura[] }

export default function ImportarEstrutura({ eventoId }: { eventoId: string }) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className="btn btn-secundario">
        <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" /> Importar planilha de estrutura
      </button>
      {aberto && <Modal eventoId={eventoId} onFechar={() => setAberto(false)} />}
    </>
  )
}

function Modal({ eventoId, onFechar }: { eventoId: string; onFechar: () => void }) {
  const router = useRouter()
  const arquivoRef = useRef<HTMLInputElement>(null)
  const [etapa, setEtapa] = useState<Etapa>({ tipo: 'arquivo' })
  const [erro, setErro] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [soErros, setSoErros] = useState(false)

  const ler = async (arquivo: File) => {
    setErro(null)
    setLendo(true)
    try {
      const { linhas, faltando } = await lerPlanilhaDeEstrutura(arquivo)
      if (faltando.length) {
        setErro(`Não achei ${faltando.length === 1 ? 'a coluna' : 'as colunas'} ${faltando.join(', ')}. Use o modelo (botão acima) ou renomeie o cabeçalho.`)
        return
      }
      if (!linhas.length) { setErro('A planilha não tem nenhuma linha preenchida.'); return }
      const r = await previaImportacaoEstrutura(eventoId, linhas)
      if (!r.ok) { setErro(r.error); return }
      setEtapa({ tipo: 'previa', linhas, plano: r.plano, decisoes: {} })
    } catch {
      setErro('Não consegui ler este arquivo. Confira se é uma planilha .xlsx, .xls ou .csv.')
    } finally {
      setLendo(false)
      if (arquivoRef.current) arquivoRef.current.value = ''
    }
  }

  /** A pessoa trocou "usar a existente" por "criar área nova" (ou o contrário): refaz a prévia com a escolha. */
  const decidir = async (linhas: LinhaEstrutura[], decisoes: DecisoesEstrutura) => {
    setErro(null)
    setLendo(true)
    try {
      const r = await previaImportacaoEstrutura(eventoId, linhas, decisoes)
      if (!r.ok) { setErro(r.error); return }
      setEtapa({ tipo: 'previa', linhas, plano: r.plano, decisoes })
    } catch {
      setErro('Não consegui atualizar a prévia — confira a internet e tente de novo.')
    } finally {
      setLendo(false)
    }
  }

  const confirmar = async (linhas: LinhaEstrutura[], plano: PlanoEstrutura, decisoes: DecisoesEstrutura) => {
    const aGravar = plano.linhas.filter(l => l.acao !== 'erro').map(l => l.linha)
    const resultados: ResultadoLinhaEstrutura[] = plano.linhas
      .filter(l => l.acao === 'erro').map(l => ({ linha: l.linha, acao: 'erro' as const, erro: l.erros.join(' ') }))
    setErro(null)
    setEtapa({ tipo: 'gravando', feitas: 0, total: aGravar.length })
    for (let i = 0; i < aGravar.length; i += LEVA) {
      try {
        const r = await importarEstruturaLote(eventoId, linhas, aGravar.slice(i, i + LEVA), decisoes)
        if (!r.ok) {
          resultados.push(...aGravar.slice(i, i + LEVA).map(linha => ({ linha, acao: 'erro' as const, erro: r.error })))
        } else resultados.push(...r.resultados)
      } catch {
        resultados.push(...aGravar.slice(i, i + LEVA).map(linha => ({
          linha, acao: 'erro' as const, erro: 'A conexão caiu nesta leva — importe a planilha de novo; o que já entrou não duplica.',
        })))
      }
      setEtapa({ tipo: 'gravando', feitas: Math.min(i + LEVA, aGravar.length), total: aGravar.length })
    }
    setEtapa({ tipo: 'fim', plano, resultados: resultados.sort((a, b) => a.linha - b.linha) })
    router.refresh()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={() => etapa.tipo !== 'gravando' && onFechar()}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div
        className="modal-pop-in relative bg-white rounded-t-2xl sm:rounded-2xl shadow-xl w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto p-5 text-left space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-50 flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-brand-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-800">Importar planilha de estrutura</h3>
            <p className="text-slate-500 text-sm">Fornecedores por área (subgrupo), trava por dia e supervisores</p>
          </div>
          {etapa.tipo !== 'gravando' && (
            <button type="button" onClick={onFechar} className="text-slate-400 hover:text-slate-600" aria-label="Fechar">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {etapa.tipo === 'arquivo' && (
          <div className="space-y-3">
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
              <p>Colunas: <strong>Fornecedor · Subgrupo · Trava do setor por dia · Nome Supervisor · CPF Supervisor · Telefone Supervisor</strong>.</p>
              <p>Trava: &quot;Sábado: 10 / Domingo: 8&quot;, &quot;Sáb 10, Dom 8&quot;, &quot;10/10: 15&quot; ou só &quot;10&quot; (todos os dias). Em branco = sem número. A trava está desligada: o número é só uma referência e não impede ninguém de se cadastrar nem de entrar.</p>
              <p>Subgrupo que não existir é criado. O mesmo CPF em várias linhas = um supervisor só, com um acesso.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input ref={arquivoRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) ler(f) }} />
              <button type="button" onClick={() => arquivoRef.current?.click()} disabled={lendo} className="btn btn-primario">
                <Upload className="w-4 h-4 shrink-0" /> {lendo ? 'Lendo e conferindo...' : 'Escolher planilha'}
              </button>
              <button type="button" onClick={baixarModelo} className="btn btn-secundario">
                <Download className="w-4 h-4 shrink-0" /> Baixar modelo
              </button>
            </div>
          </div>
        )}

        {etapa.tipo === 'previa' && (
          <Previa
            plano={etapa.plano} soErros={soErros} onSoErros={setSoErros} ocupado={lendo}
            onVoltar={() => setEtapa({ tipo: 'arquivo' })}
            onDecidir={(chave, decisao) => decidir(etapa.linhas, { ...etapa.decisoes, [chave]: decisao })}
            onConfirmar={() => confirmar(etapa.linhas, etapa.plano, etapa.decisoes)}
          />
        )}

        {etapa.tipo === 'gravando' && (
          <div className="py-6 text-center space-y-3">
            <p className="text-slate-700 text-sm font-semibold">Importando {etapa.feitas} de {etapa.total} linhas...</p>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${etapa.total ? (etapa.feitas / etapa.total) * 100 : 100}%` }} />
            </div>
            <p className="text-slate-400 text-xs">Não feche esta janela. Se cair, é só importar de novo — nada duplica.</p>
          </div>
        )}

        {etapa.tipo === 'fim' && <Resumo plano={etapa.plano} resultados={etapa.resultados} onFechar={onFechar} />}

        {erro && (
          <p className="flex items-start gap-1.5 text-erro-600 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {erro}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Numero({ rotulo, valor, tom = 'text-slate-800' }: { rotulo: string; valor: number; tom?: string }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
      <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">{rotulo}</p>
      <p className={`text-xl font-extrabold tabular-nums mt-0.5 ${tom}`}>{valor}</p>
    </div>
  )
}

function Previa({ plano, soErros, onSoErros, ocupado, onVoltar, onDecidir, onConfirmar }: {
  plano: PlanoEstrutura; soErros: boolean; onSoErros: (v: boolean) => void; ocupado: boolean
  onVoltar: () => void; onDecidir: (chave: string, decisao: 'usar' | 'novo') => void; onConfirmar: () => void
}) {
  const c = plano.contagens
  const validas = plano.linhas.length - c.linhasComErro
  const visiveis = soErros ? plano.linhas.filter(l => l.acao === 'erro') : plano.linhas
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Numero rotulo="Fornecedores novos" valor={c.fornecedoresCriar} tom="text-brand-600" />
        <Numero rotulo="Já existem (atualizar)" valor={c.fornecedoresAtualizar} />
        <Numero rotulo="Subgrupos novos" valor={c.subgruposCriar} tom="text-brand-600" />
        <Numero rotulo="Linhas com erro" valor={c.linhasComErro} tom={c.linhasComErro ? 'text-red-600' : 'text-slate-800'} />
        <Numero rotulo="Supervisores novos" valor={c.supervisoresNovos} tom="text-brand-600" />
        <Numero rotulo="Supervisores existentes" valor={c.supervisoresExistentes} />
        <Numero rotulo="Com vários setores" valor={c.supervisoresMultiplos} />
      </div>

      {/* Nomes de área que o sistema entendeu sozinho — nada a decidir, só a transparência. */}
      {plano.reconhecidos.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800 space-y-1">
          <p className="font-semibold">Reconheci áreas escritas de outro jeito — não vou criar duplicadas:</p>
          {plano.reconhecidos.map(n => (
            <p key={n.nomeNaPlanilha}>&quot;{n.nomeNaPlanilha}&quot; → <strong>{n.nomeUsado}</strong></p>
          ))}
        </div>
      )}

      {/* Nome PARECIDO (provável erro de digitação): sugere a existente, a pessoa decide. */}
      {plano.parecidos.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-900 space-y-2.5">
          <p className="font-semibold">Estes nomes são parecidos com áreas que já existem — confira:</p>
          {plano.parecidos.map(n => (
            <div key={n.chave} className="space-y-1.5">
              <p>&quot;{n.nomeNaPlanilha}&quot; parece <strong>{n.existenteNome}</strong> <span className="opacity-70">({n.linhas.length} linha{n.linhas.length === 1 ? '' : 's'})</span></p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button" disabled={ocupado} onClick={() => onDecidir(n.chave, 'usar')}
                  className={`rounded-lg border px-2.5 py-1 font-semibold disabled:opacity-60 ${n.decisao === 'usar' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-amber-300 text-amber-800'}`}
                >
                  Usar &quot;{n.existenteNome}&quot;
                </button>
                <button
                  type="button" disabled={ocupado} onClick={() => onDecidir(n.chave, 'novo')}
                  className={`rounded-lg border px-2.5 py-1 font-semibold disabled:opacity-60 ${n.decisao === 'novo' ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white border-amber-300 text-amber-800'}`}
                >
                  Criar área nova &quot;{n.nomeNaPlanilha}&quot;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {plano.multiplos.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 space-y-1">
          <p className="font-semibold text-slate-700">Supervisores com mais de um setor — um acesso só para cada:</p>
          {plano.multiplos.map(m => <p key={m.cpf}><strong>{m.nome}</strong>: {m.setores.join(' · ')}</p>)}
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-slate-500 text-xs">{plano.linhas.length} linhas na planilha</p>
        {c.linhasComErro > 0 && (
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={soErros} onChange={e => onSoErros(e.target.checked)} className="accent-brand-500" />
            Só as linhas com erro
          </label>
        )}
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="tabela">
          <thead>
            <tr><th>Linha</th><th>Subgrupo</th><th>Fornecedor</th><th>Trava</th><th>Supervisor</th><th>Situação</th></tr>
          </thead>
          <tbody>
            {visiveis.map(l => (
              <tr key={l.linha}>
                <td className="tabular-nums text-slate-400 text-2xs">{l.linha}</td>
                <td className="text-xs">
                  {l.subgrupoUsado || l.subgrupo || '—'}
                  {l.subgrupoNovo && l.acao !== 'erro' && <span className="block text-brand-600 text-2xs">novo</span>}
                  {!l.subgrupoNovo && l.subgrupoUsado && l.subgrupoUsado !== l.subgrupo && (
                    <span className="block text-green-700 text-2xs">escrito &quot;{l.subgrupo}&quot;</span>
                  )}
                </td>
                <td className="text-xs font-medium text-slate-700">{l.fornecedor || '—'}</td>
                <td className="text-2xs text-slate-500">
                  {Object.keys(l.travaPorDia).length
                    ? Object.entries(l.travaPorDia).map(([d, n]) => `${listarDias([d])}: ${n}`).join(' · ')
                    : '—'}
                </td>
                <td className="text-xs">
                  {l.supervisor.nome || '—'}
                  {l.supervisor.nome && <span className="block text-2xs text-slate-400">{l.supervisor.existente ? 'já tem acesso' : 'acesso novo'}</span>}
                </td>
                <td className="text-xs max-w-[16rem]">
                  {l.acao === 'erro'
                    ? <><Badge tom="negativo">Erro</Badge><span className="block text-red-600 text-2xs mt-0.5">{l.erros.join(' ')}</span></>
                    : <Badge tom={l.acao === 'criar' ? 'marca' : 'neutro'}>{l.acao === 'criar' ? 'Criar' : 'Atualizar'}</Badge>}
                  {l.avisos.map(a => <span key={a} className="block text-amber-700 text-2xs mt-0.5">{a}</span>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <button type="button" onClick={onConfirmar} disabled={!validas} className="flex-1 btn btn-primario">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          Confirmar importação ({validas} linha{validas === 1 ? '' : 's'})
        </button>
        <button type="button" onClick={onVoltar} className="btn btn-secundario">Escolher outra planilha</button>
      </div>
      {c.linhasComErro > 0 && validas > 0 && (
        <p className="text-slate-500 text-xs">As {c.linhasComErro} linhas com erro ficam de fora — corrija na planilha e importe de novo depois; o que já entrou não duplica.</p>
      )}
    </div>
  )
}

function Resumo({ plano, resultados, onFechar }: { plano: PlanoEstrutura; resultados: ResultadoLinhaEstrutura[]; onFechar: () => void }) {
  const criados = resultados.filter(r => r.acao === 'criado').length
  const atualizados = resultados.filter(r => r.acao === 'atualizado').length
  const comErro = resultados.filter(r => r.acao === 'erro')
  const avisos = resultados.filter(r => r.aviso)
  const entraram = criados + atualizados
  // O título diz o que de fato aconteceu: com todas as linhas falhando, "concluída" enganava.
  const titulo = entraram === 0 ? 'Nada foi importado' : comErro.length ? 'Importação concluída com erros' : 'Importação concluída'
  const cor = entraram === 0 ? 'text-red-600' : comErro.length ? 'text-amber-600' : 'text-green-700'
  return (
    <div className="space-y-4">
      <p className={`flex items-center gap-2 font-bold ${cor}`}>
        {entraram === 0 || comErro.length ? <AlertCircle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />} {titulo}
        {comErro.length > 0 && <span className="text-sm font-medium opacity-80">· {comErro.length} linha{comErro.length === 1 ? '' : 's'} com erro</span>}
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        <Numero rotulo="Fornecedores criados" valor={criados} tom="text-brand-600" />
        <Numero rotulo="Registros atualizados" valor={atualizados} />
        <Numero rotulo="Subgrupos criados" valor={plano.contagens.subgruposCriar} />
        {/* Os três abaixo vêm da PRÉVIA (o que a planilha previa), não do que gravou. */}
        <Numero rotulo="Supervisores previstos novos" valor={plano.contagens.supervisoresNovos} />
        <Numero rotulo="Supervisores existentes" valor={plano.contagens.supervisoresExistentes} />
        <Numero rotulo="Com vários setores" valor={plano.contagens.supervisoresMultiplos} />
      </div>
      {(comErro.length > 0 || avisos.length > 0) && (
        <div className="border border-slate-200 rounded-xl p-3 space-y-1 max-h-48 overflow-y-auto text-xs">
          {comErro.map(r => <p key={`e${r.linha}`} className="text-red-600">Linha {r.linha}: {r.erro}</p>)}
          {avisos.map(r => <p key={`a${r.linha}`} className="text-amber-700">Linha {r.linha}: {r.aviso}</p>)}
        </div>
      )}
      {entraram > 0 && (
        <p className="text-slate-500 text-xs">
          Cada supervisor novo recebe no WhatsApp UM link de acesso — quem tem vários setores vê todos ao entrar.
        </p>
      )}
      {comErro.length > 0 && (
        <p className="text-slate-500 text-xs">
          Corrija o que está nas linhas com erro e importe a MESMA planilha de novo: o que já entrou não duplica.
        </p>
      )}
      <button type="button" onClick={onFechar} className="w-full btn btn-primario">Fechar</button>
    </div>
  )
}

/** O modelo, gerado na hora — sem arquivo pra ficar desatualizado em /public. */
async function baixarModelo() {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([
    ['Fornecedor', 'Subgrupo', 'Trava do setor por dia', 'Nome Supervisor', 'CPF Supervisor', 'Telefone Supervisor'],
    ['Credenciais', 'Camarote', 'Sábado: 10 / Domingo: 8', 'João Silva', '000.000.000-00', '(27) 99999-0000'],
    ['Bar', 'Arquibancada', 'Sábado: 15 / Domingo: 12', 'Maria Santos', '000.000.000-00', '(27) 99999-0000'],
  ])
  ws['!cols'] = [{ wch: 18 }, { wch: 18 }, { wch: 26 }, { wch: 22 }, { wch: 16 }, { wch: 18 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Estrutura')
  XLSX.writeFile(wb, 'modelo-estrutura-evento.xlsx')
}
