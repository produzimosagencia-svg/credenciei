'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ShieldAlert, ShieldHalf, ShieldCheck, FileSpreadsheet, Save, Check, AlertCircle, Copy, Pencil } from 'lucide-react'
import { Secao, Cartao, Badge, EmptyState } from '@/components/ui/Superficie'
import type { RelatorioTravas, LinhaRelatorioTrava } from '@/lib/escala'
import type { FaseDoDia } from '@/lib/janelas'
import { gerarPlanilhaTravas } from '@/lib/relatorio-travas-excel'
import { salvarTravasDoSetor } from '@/lib/actions'

const rotuloDia = (d: string) => { const [, m, dd] = d.split('-'); return `${dd}/${m}` }

const GRUPOS: { situacao: LinhaRelatorioTrava['situacao']; titulo: string; icone: React.ReactNode; tom: 'aviso' | 'neutro' | 'sucesso' }[] = [
  { situacao: 'sem_trava', titulo: 'Sem trava nenhuma', icone: <ShieldAlert className="w-3.5 h-3.5" />, tom: 'aviso' },
  { situacao: 'parcial', titulo: 'Trava parcial (só alguns dias)', icone: <ShieldHalf className="w-3.5 h-3.5" />, tom: 'neutro' },
  { situacao: 'completa', titulo: 'Trava completa (todos os dias)', icone: <ShieldCheck className="w-3.5 h-3.5" />, tom: 'sucesso' },
]

const NOME_FASE: Record<FaseDoDia, string> = { montagem: 'montagem', evento: 'evento', desmontagem: 'desmont.' }

/**
 * Um setor: os limites de cada dia em leitura, e "Editar limites" abre o modal (pedido do Juan, 08/10/2026:
 * "prefiro que abra um modal, algo mais natural" — os campos soltos na linha não pareciam editáveis).
 */
function LinhaTrava({ eventoId, linha, faseDe }: { eventoId: string; linha: LinhaRelatorioTrava; faseDe: Map<string, FaseDoDia> }) {
  const [aberto, setAberto] = useState(false)
  const [salvo, setSalvo] = useState(false)
  return (
    <Cartao padding="sm">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-slate-800 font-semibold text-sm truncate">{linha.nome}</p>
          <p className="text-slate-400 text-xs mt-0.5">
            {linha.supervisores.length ? linha.supervisores.join(', ') : 'sem supervisor cadastrado'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
          {linha.porDia.map(d => (
            <span
              key={d.data}
              className={`rounded-lg px-2 py-1 text-2xs font-medium tabular-nums ${
                d.maximo == null ? 'bg-amber-50 text-amber-700'
                  : d.aprovados > d.maximo ? 'bg-red-50 text-red-700'
                    : 'bg-slate-50 text-slate-600'
              }`}
            >
              {rotuloDia(d.data)}: {d.maximo == null ? 'livre' : `${d.aprovados}/${d.maximo}`}
            </span>
          ))}
          {salvo && <span className="flex items-center gap-1 text-green-700 text-2xs font-semibold"><Check className="w-3 h-3" /> Salvo</span>}
          <button type="button" onClick={() => { setSalvo(false); setAberto(true) }} className="btn btn-primario btn-sm ml-1">
            <Pencil className="w-3 h-3 shrink-0" /> Editar limites
          </button>
        </div>
      </div>
      {aberto && (
        <ModalTravas
          eventoId={eventoId} linha={linha} faseDe={faseDe}
          onFechar={() => setAberto(false)}
          onSalvo={() => { setAberto(false); setSalvo(true) }}
        />
      )}
    </Cartao>
  )
}

/**
 * O modal de edição: um campo por dia (vazio = livre), atalho para repetir o mesmo número em todos os dias, e aviso
 * quando o limite fica abaixo de quem já está aprovado — permitido (a decisão é de quem opera), mas com a trava
 * ligada, quem chegar depois que o dia encher é barrado na portaria. Salva só este setor (`salvarTravasDoSetor`).
 */
function ModalTravas({ eventoId, linha, faseDe, onFechar, onSalvo }: {
  eventoId: string; linha: LinhaRelatorioTrava; faseDe: Map<string, FaseDoDia>; onFechar: () => void; onSalvo: () => void
}) {
  const inicial = useMemo(
    () => Object.fromEntries(linha.porDia.map(d => [d.data, d.maximo == null ? '' : String(d.maximo)])),
    [linha.porDia],
  )
  const [valores, setValores] = useState<Record<string, string>>(inicial)
  const [todos, setTodos] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const mudou = linha.porDia.some(d => (valores[d.data] ?? '').trim() !== inicial[d.data])
  const abaixo = linha.porDia.filter(d => {
    const v = (valores[d.data] ?? '').trim()
    return v !== '' && Number(v) < d.aprovados
  })

  const salvar = () => {
    setErro(null)
    const porDia: Record<string, number | null> = {}
    for (const d of linha.porDia) {
      const v = (valores[d.data] ?? '').trim()
      if (v === inicial[d.data]) continue
      porDia[d.data] = v === '' ? null : Number(v)
    }
    startTransition(async () => {
      const r = await salvarTravasDoSetor(eventoId, linha.fornecedorId, porDia)
      if (!r.ok) { setErro(r.erro); return }
      onSalvo()
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !pendente && onFechar()}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div
        className="modal-pop-in relative bg-white rounded-3xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-label={`Limite por dia — ${linha.nome}`}
      >
        <div className="px-5 pt-5 pb-3 border-b border-slate-100">
          <p className="text-slate-800 font-bold text-base">{linha.nome}</p>
          <p className="text-slate-500 text-xs mt-0.5">Limite de pessoas em cada dia. Deixe vazio para &quot;livre&quot; (sem limite).</p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-end gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
            <label className="flex-1 min-w-0">
              <span className="block text-xs font-medium text-slate-600 mb-1">Mesmo limite em todos os dias</span>
              <input
                inputMode="numeric" value={todos} onChange={e => setTodos(e.target.value.replace(/\D/g, ''))}
                placeholder="Ex.: 10" className="input text-sm w-full"
              />
            </label>
            <button
              type="button" disabled={!todos}
              onClick={() => setValores(Object.fromEntries(linha.porDia.map(d => [d.data, todos])))}
              className="btn btn-secundario"
            >
              <Copy className="w-3.5 h-3.5 shrink-0" /> Aplicar
            </button>
          </div>

          <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl">
            {linha.porDia.map(d => {
              const v = (valores[d.data] ?? '').trim()
              const estado = v === '' ? 'livre' : Number(v) < d.aprovados ? 'abaixo' : 'ok'
              return (
                <label key={d.data} className="flex items-center gap-3 px-3 py-2.5 cursor-text">
                  <span className="w-24 shrink-0">
                    <span className="block text-sm font-semibold text-slate-800 tabular-nums">{rotuloDia(d.data)}</span>
                    <span className="block text-2xs text-slate-400">{NOME_FASE[faseDe.get(d.data) ?? 'evento']}</span>
                  </span>
                  <input
                    inputMode="numeric" value={valores[d.data] ?? ''}
                    onChange={e => setValores(a => ({ ...a, [d.data]: e.target.value.replace(/\D/g, '') }))}
                    placeholder="livre" aria-label={`Limite em ${rotuloDia(d.data)}`}
                    className={`input text-sm w-24 text-center tabular-nums placeholder:text-amber-600 ${
                      estado === 'abaixo' ? 'border-red-300' : estado === 'livre' ? 'border-amber-300' : ''
                    }`}
                  />
                  <span className={`text-xs tabular-nums ${estado === 'abaixo' ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                    {d.aprovados} aprovado(s)
                  </span>
                </label>
              )
            })}
          </div>

          {abaixo.length > 0 && (
            <p className="flex items-start gap-1.5 text-red-600 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
              Abaixo dos aprovados em {abaixo.map(d => rotuloDia(d.data)).join(', ')} — quem chegar depois que o dia encher é barrado na portaria.
            </p>
          )}
          {erro && <p className="flex items-start gap-1.5 text-erro-600 text-xs"><AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 bg-slate-50">
          <button type="button" onClick={onFechar} disabled={pendente} className="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2">
            Cancelar
          </button>
          <button type="button" onClick={salvar} disabled={pendente || !mudou} className="btn btn-primario">
            <Save className="w-3.5 h-3.5 shrink-0" /> {pendente ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * O painel "Limite por dia": fornecedores agrupados por situação, com busca, edição e planilha — pedido do Juan,
 * 08/10/2026. `relatorio` vem pronto do servidor (`obterRelatorioTravas`); depois de salvar um setor, a tela
 * recarrega os dados e o setor muda de grupo se for o caso.
 */
export default function RelatorioTravasView({ eventoId, relatorio, eventoNome }: { eventoId: string; relatorio: RelatorioTravas; eventoNome: string }) {
  const [busca, setBusca] = useState('')
  const [baixando, setBaixando] = useState(false)
  const [erroPlanilha, setErroPlanilha] = useState<string | null>(null)

  const baixar = async () => {
    setErroPlanilha(null)
    setBaixando(true)
    try {
      await gerarPlanilhaTravas(relatorio, eventoNome)
    } catch (e) {
      console.error('[travas] planilha', e)
      setErroPlanilha('Não consegui gerar a planilha. Tente de novo.')
    } finally {
      setBaixando(false)
    }
  }

  const porSituacao = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const filtradas = !termo
      ? relatorio.linhas
      : relatorio.linhas.filter(l =>
          l.nome.toLowerCase().includes(termo) || l.supervisores.some(s => s.toLowerCase().includes(termo)))
    const mapa = new Map<LinhaRelatorioTrava['situacao'], LinhaRelatorioTrava[]>()
    for (const l of filtradas) mapa.set(l.situacao, [...(mapa.get(l.situacao) ?? []), l])
    return mapa
  }, [relatorio.linhas, busca])

  if (!relatorio.dias.length) {
    return (
      <EmptyState
        icone={<ShieldAlert className="w-7 h-7" />}
        titulo="Este evento não tem dias de trabalho configurados"
        descricao="A trava por dia depende dos dias do evento (Editar evento → Dias de trabalho)."
      />
    )
  }

  const contagem = (s: LinhaRelatorioTrava['situacao']) => relatorio.linhas.filter(l => l.situacao === s).length
  const faseDe = new Map(relatorio.dias.map(d => [d.data, d.fase]))

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tom="atencao">{contagem('sem_trava')} sem trava</Badge>
          <Badge tom="neutro">{contagem('parcial')} parcial</Badge>
          <Badge tom="positivo">{contagem('completa')} completa</Badge>
        </div>
        <button type="button" onClick={baixar} disabled={baixando} className="btn btn-secundario sm:ml-auto shrink-0">
          <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" /> {baixando ? 'Gerando…' : 'Baixar planilha'}
        </button>
        <div className="relative sm:max-w-xs w-full">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por setor ou supervisor…"
            className="input pl-8 text-sm w-full"
          />
        </div>
      </div>

      {erroPlanilha && <p className="text-erro-600 text-xs">{erroPlanilha}</p>}

      <p className="flex items-center gap-1.5 text-slate-600 text-xs bg-white border border-slate-200 rounded-xl px-3 py-2">
        <Pencil className="w-3.5 h-3.5 text-brand-500 shrink-0" />
        Para mudar o limite de um setor, clique em <strong className="font-semibold">Editar limites</strong> no setor.
      </p>

      {GRUPOS.map(g => {
        const linhas = porSituacao.get(g.situacao) ?? []
        if (!linhas.length) return null
        return (
          <Secao key={g.situacao} titulo={g.titulo} descricao={`${linhas.length} setor(es)`} icone={g.icone} tom={g.tom}>
            <div className="space-y-2">
              {linhas.map(l => (
                /* A chave muda quando os limites salvos mudam: depois do refresh, a linha remonta com os valores novos. */
                <LinhaTrava
                  key={`${l.fornecedorId}:${l.porDia.map(d => d.maximo ?? '').join(',')}`}
                  eventoId={eventoId} linha={l} faseDe={faseDe}
                />
              ))}
            </div>
          </Secao>
        )
      })}

      {[...porSituacao.values()].every(l => l.length === 0) && (
        <EmptyState icone={<Search className="w-7 h-7" />} titulo="Ninguém encontrado para essa busca." />
      )}
    </div>
  )
}
