'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, ShieldAlert, ShieldHalf, ShieldCheck, FileSpreadsheet, Save, Check, AlertCircle, Copy } from 'lucide-react'
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
 * Um setor, editável: cada dia vira um campo (vazio = livre, sem trava) — pedido do Juan, 08/10/2026: "seria bom a
 * gente editar os dias por aqui também, ser meio que um painel". Salva só este setor (`salvarTravasDoSetor`).
 *
 * Baixar o limite para menos do que já está aprovado é permitido (a decisão é de quem opera), mas avisa antes de
 * salvar: com a trava ligada, quem chegar depois que o dia encher é barrado na portaria.
 */
function LinhaTrava({ eventoId, linha, faseDe }: { eventoId: string; linha: LinhaRelatorioTrava; faseDe: Map<string, FaseDoDia> }) {
  const inicial = useMemo(
    () => Object.fromEntries(linha.porDia.map(d => [d.data, d.maximo == null ? '' : String(d.maximo)])),
    [linha.porDia],
  )
  const [valores, setValores] = useState<Record<string, string>>(inicial)
  const [erro, setErro] = useState<string | null>(null)
  const [salvo, setSalvo] = useState(false)
  const [pendente, startTransition] = useTransition()
  const router = useRouter()

  const mudou = linha.porDia.some(d => (valores[d.data] ?? '').trim() !== inicial[d.data])
  const abaixo = linha.porDia.filter(d => {
    const v = (valores[d.data] ?? '').trim()
    return v !== '' && Number(v) < d.aprovados
  })

  const alterar = (dia: string, v: string) => {
    setSalvo(false)
    setErro(null)
    setValores(a => ({ ...a, [dia]: v.replace(/\D/g, '') }))
  }

  // Atalho: o primeiro número preenchido vale pra todos os dias do setor (o caso comum — mesmo limite todo dia).
  const primeiro = linha.porDia.map(d => (valores[d.data] ?? '').trim()).find(v => v !== '')
  const repetirEmTodos = () => {
    if (!primeiro) return
    setSalvo(false)
    setValores(Object.fromEntries(linha.porDia.map(d => [d.data, primeiro])))
  }

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
      setSalvo(true)
      router.refresh()
    })
  }

  return (
    <Cartao padding="sm">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div className="min-w-0">
          <p className="text-slate-800 font-semibold text-sm truncate">{linha.nome}</p>
          <p className="text-slate-400 text-xs mt-0.5">
            {linha.supervisores.length ? linha.supervisores.join(', ') : 'sem supervisor cadastrado'}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 lg:justify-end">
          {linha.porDia.map(d => {
            const v = (valores[d.data] ?? '').trim()
            const estado = v === '' ? 'livre' : Number(v) < d.aprovados ? 'abaixo' : 'ok'
            return (
              <label
                key={d.data}
                className={`w-[68px] rounded-lg border px-1.5 py-1 text-center ${
                  estado === 'livre' ? 'border-amber-200 bg-amber-50'
                    : estado === 'abaixo' ? 'border-red-200 bg-red-50'
                      : 'border-slate-200 bg-white'
                }`}
              >
                <span className="block text-2xs text-slate-500 leading-tight">
                  {rotuloDia(d.data)} <span className="opacity-70">{NOME_FASE[faseDe.get(d.data) ?? 'evento']}</span>
                </span>
                <input
                  inputMode="numeric"
                  value={valores[d.data] ?? ''}
                  onChange={e => alterar(d.data, e.target.value)}
                  placeholder="livre"
                  aria-label={`Limite em ${rotuloDia(d.data)}`}
                  className="w-full bg-transparent text-center text-sm font-semibold tabular-nums text-slate-800 placeholder:text-amber-600 placeholder:font-medium focus:outline-none"
                />
                <span className="block text-2xs text-slate-400 tabular-nums">{d.aprovados} aprov.</span>
              </label>
            )
          })}
        </div>
      </div>

      {(mudou || salvo || erro || abaixo.length > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 lg:justify-end">
          {abaixo.length > 0 && (
            <p className="flex items-center gap-1 text-red-600 text-2xs mr-auto lg:mr-0">
              <AlertCircle className="w-3 h-3 shrink-0" />
              Abaixo dos aprovados em {abaixo.map(d => rotuloDia(d.data)).join(', ')} — quem chegar depois que o dia encher é barrado na portaria.
            </p>
          )}
          {erro && <p className="text-erro-600 text-2xs">{erro}</p>}
          {salvo && !mudou && (
            <span className="flex items-center gap-1 text-green-700 text-2xs font-semibold"><Check className="w-3 h-3" /> Salvo</span>
          )}
          {mudou && (
            <>
              {primeiro && (
                <button type="button" onClick={repetirEmTodos} className="btn btn-secundario btn-sm">
                  <Copy className="w-3 h-3 shrink-0" /> Repetir {primeiro} em todos
                </button>
              )}
              <button type="button" onClick={() => { setValores(inicial); setErro(null) }} className="btn btn-secundario btn-sm" disabled={pendente}>
                Desfazer
              </button>
              <button type="button" onClick={salvar} className="btn btn-primario btn-sm" disabled={pendente}>
                <Save className="w-3 h-3 shrink-0" /> {pendente ? 'Salvando…' : 'Salvar'}
              </button>
            </>
          )}
        </div>
      )}
      {!mudou && !salvo && primeiro && linha.porDia.some(d => (valores[d.data] ?? '').trim() === '') && (
        <div className="mt-2 flex lg:justify-end">
          <button type="button" onClick={repetirEmTodos} className="text-brand-600 text-2xs font-semibold hover:underline">
            Repetir {primeiro} em todos os dias
          </button>
        </div>
      )}
    </Cartao>
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
