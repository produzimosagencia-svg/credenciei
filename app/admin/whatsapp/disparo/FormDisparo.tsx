'use client'

import { useMemo, useRef, useState, useTransition } from 'react'
import {
  AlertCircle, ArrowLeft, ArrowRight, Check, CheckCircle2, CircleDollarSign,
  Database, FileSpreadsheet, FileText, Phone, Search, Send, ShieldX, Upload, UserRoundCheck, Users,
} from 'lucide-react'
import {
  dispararEmMassa, previaDisparo, type ContatoDisparo, type PreviaDisparo,
} from '@/lib/actions-whatsapp'

type Evento = { id: string; nome: string; ativo: boolean }
type Setor = { id: string; nome: string; eventoId: string }
type Template = { nome: string; variaveis: number; corpo: string; categoria: string; idioma: string }
type Numero = { id: string; numero: string; nome: string; qualidade: string; status: string; configurado: boolean }
type FiltroCategoria = 'TODOS' | 'UTILITY' | 'MARKETING'

const PASSOS = [
  { n: 1, label: 'Número', icon: Phone },
  { n: 2, label: 'Template', icon: FileText },
  { n: 3, label: 'Contatos', icon: Users },
  { n: 4, label: 'Enviar', icon: Send },
] as const

const SOCIOS_TESTE: ContatoDisparo[] = [
  { nome: 'Guilherme', telefone: '5527996528524' },
  { nome: 'Juan', telefone: '5527999255959' },
  { nome: 'Valiati', telefone: '5527998869852' },
]

function normalizarTelefone(valor: string): string {
  let digitos = String(valor ?? '').replace(/\D/g, '')
  if (digitos.length === 10 || digitos.length === 11) digitos = `55${digitos}`
  return digitos.length === 12 || digitos.length === 13 ? digitos : ''
}

function contatosUnicos(contatos: ContatoDisparo[]): ContatoDisparo[] {
  const porNumero = new Map<string, ContatoDisparo>()
  for (const contato of contatos) {
    const telefone = normalizarTelefone(contato.telefone)
    if (!telefone) continue
    const nome = contato.nome.trim() || 'Cliente'
    const atual = porNumero.get(telefone)
    if (!atual || atual.nome === 'Cliente') porNumero.set(telefone, { nome, telefone })
  }
  return [...porNumero.values()]
}

function lerContatosCsv(texto: string): ContatoDisparo[] {
  const linhas = texto.split(/\r?\n/).filter(l => l.trim())
  if (!linhas.length) return []
  const separar = (linha: string) => linha.split(/[,;\t]/).map(p => p.trim().replace(/^"|"$/g, ''))
  const cabecalho = separar(linhas[0]).map(v => v.toLowerCase())
  const indiceTelefone = cabecalho.findIndex(v => /telefone|whatsapp|celular|phone/.test(v))
  const indiceNome = cabecalho.findIndex(v => /nome|name/.test(v))
  const temCabecalho = indiceTelefone >= 0 || indiceNome >= 0

  return contatosUnicos(linhas.slice(temCabecalho ? 1 : 0).map((linha, indice) => {
    const partes = separar(linha)
    const posTelefone = indiceTelefone >= 0 ? indiceTelefone : (partes.length >= 2 ? 1 : 0)
    const posNome = indiceNome >= 0 ? indiceNome : (posTelefone === 0 ? -1 : 0)
    return {
      nome: posNome >= 0 ? partes[posNome] : `Contato ${indice + 1}`,
      telefone: partes[posTelefone] ?? '',
    }
  }))
}

function categoriaLabel(categoria: string) {
  if (categoria === 'UTILITY') return 'Utilidade'
  if (categoria === 'MARKETING') return 'Marketing'
  return categoria
}

export default function FormDisparo({ eventos, setores, templates, numeros }: {
  eventos: Evento[]
  setores: Setor[]
  templates: Template[]
  numeros: Numero[]
}) {
  const [passo, setPasso] = useState(1)
  const [phoneNumberId, setPhoneNumberId] = useState(numeros.find(n => n.configurado)?.id ?? numeros[0]?.id ?? '')
  const [templateNome, setTemplateNome] = useState('')
  const [parametros, setParametros] = useState<string[]>([])
  const [origem, setOrigem] = useState<'equipe' | 'csv' | 'socios'>('equipe')
  const [eventoId, setEventoId] = useState(eventos[0]?.id ?? '')
  const [setorId, setSetorId] = useState('')
  const [somenteAtivos, setSomenteAtivos] = useState(true)
  const [previa, setPrevia] = useState<PreviaDisparo | null>(null)
  const [csv, setCsv] = useState<ContatoDisparo[]>([])
  const [sociosSelecionados, setSociosSelecionados] = useState(() => new Set(SOCIOS_TESTE.map(c => c.telefone)))
  const [exclusoes, setExclusoes] = useState<ContatoDisparo[]>([])
  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState<FiltroCategoria>('TODOS')
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()
  const csvRef = useRef<HTMLInputElement>(null)
  const exclusaoRef = useRef<HTMLInputElement>(null)

  const template = templates.find(t => t.nome === templateNome)
  const numero = numeros.find(n => n.id === phoneNumberId)
  const setoresDoEvento = useMemo(() => setores.filter(s => s.eventoId === eventoId), [setores, eventoId])
  const contatosOrigem = useMemo(
    () => origem === 'equipe'
      ? (previa?.contatos ?? [])
      : origem === 'socios'
        ? SOCIOS_TESTE.filter(c => sociosSelecionados.has(c.telefone))
        : csv,
    [origem, previa, csv, sociosSelecionados],
  )
  const numerosExcluidos = useMemo(() => new Set(exclusoes.map(c => normalizarTelefone(c.telefone))), [exclusoes])
  const contatosFinais = useMemo(
    () => contatosOrigem.filter(c => !numerosExcluidos.has(normalizarTelefone(c.telefone))),
    [contatosOrigem, numerosExcluidos],
  )
  const removidos = contatosOrigem.length - contatosFinais.length
  const custoUnitario = template?.categoria === 'MARKETING' ? 0.3217 : 0.035
  const templatesFiltrados = useMemo(() => templates.filter(t => {
    const bateCategoria = filtroCategoria === 'TODOS' || t.categoria === filtroCategoria
    const bateBusca = `${t.nome} ${t.corpo}`.toLowerCase().includes(busca.toLowerCase())
    return bateCategoria && bateBusca
  }), [busca, filtroCategoria, templates])
  const textoPrevia = template?.corpo.replace(/\{\{(\d+)\}\}/g, (_, numeroVariavel: string) => {
    const posicao = Number(numeroVariavel) - 1
    if (posicao === 0) return 'Nome do contato'
    return parametros[posicao]?.trim() || `{{${numeroVariavel}}}`
  })

  const invalidarPublico = () => {
    setPrevia(null)
    setFeito(null)
    setErro(null)
  }

  const carregarEquipe = () => {
    setErro(null)
    startTransition(async () => {
      try {
        setPrevia(await previaDisparo({ eventoId, fornecedorId: setorId || undefined, somenteAtivos }))
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível carregar o público.')
      }
    })
  }

  const importar = (arquivo: File | undefined, destino: 'publico' | 'exclusao') => {
    if (!arquivo) return
    const leitor = new FileReader()
    leitor.onload = () => {
      const contatos = lerContatosCsv(String(leitor.result ?? ''))
      if (destino === 'publico') setCsv(contatos)
      else setExclusoes(contatos)
      setErro(contatos.length ? null : 'Nenhum telefone válido foi encontrado no arquivo.')
      setFeito(null)
    }
    leitor.onerror = () => setErro('Não foi possível ler o arquivo.')
    leitor.readAsText(arquivo)
  }

  const podeAvancar = (n: number) => {
    if (n === 1) return !!phoneNumberId
    if (n === 2) return !!template && parametros.slice(1, template.variaveis).every(v => v?.trim())
    if (n === 3) return !!eventoId && contatosFinais.length > 0
    return false
  }

  const enviar = () => {
    if (!template || !numero || !podeAvancar(3)) return
    setErro(null)
    setFeito(null)
    startTransition(async () => {
      try {
        const r = await dispararEmMassa({
          alvo: { eventoId, fornecedorId: origem === 'equipe' && setorId ? setorId : undefined, somenteAtivos },
          origem,
          contatosImportados: origem === 'equipe' ? undefined : contatosOrigem,
          excluirTelefones: exclusoes.map(c => c.telefone),
          phoneNumberId,
          template: template.nome,
          parametros: Array.from({ length: template.variaveis }, (_, i) => parametros[i] ?? ''),
        })
        const detalhes = [
          r.semTelefone ? `${r.semTelefone} sem telefone válido` : '',
          r.excluidas ? `${r.excluidas} excluído(s)` : '',
        ].filter(Boolean).join(' · ')
        setFeito(`${r.enfileiradas} mensagem(ns) entraram na fila.${detalhes ? ` ${detalhes}.` : ''}`)
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : 'Não foi possível iniciar o disparo.')
      }
    })
  }

  return (
    <div className="space-y-5">
      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Etapas do novo disparo">
        {PASSOS.map(({ n, label, icon: Icon }) => {
          const ativo = passo === n
          const concluido = n < passo && podeAvancar(n)
          return (
            <li key={n}>
              <button type="button" onClick={() => concluido && setPasso(n)} disabled={!concluido && !ativo}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                  ativo ? 'border-brand-400 bg-brand-50 text-brand-700' : concluido ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white text-slate-400'
                }`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ativo ? 'bg-brand-500 text-white' : concluido ? 'bg-green-600 text-white' : 'bg-slate-100'}`}>
                  {concluido ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </span>
                <span><span className="block text-2xs font-semibold uppercase tracking-wide">Etapa {n}</span><span className="text-sm font-semibold">{label}</span></span>
              </button>
            </li>
          )
        })}
      </ol>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        {passo === 1 && (
          <div className="space-y-4">
            <div><h2 className="text-lg font-semibold text-slate-900">Selecione o número de envio</h2><p className="mt-1 text-sm text-slate-500">Números conectados à conta oficial da Meta.</p></div>
            <div className="grid gap-3 lg:grid-cols-2">
              {numeros.map(n => {
                const selecionado = n.id === phoneNumberId
                return (
                  <button type="button" key={n.id} onClick={() => { setPhoneNumberId(n.id); setFeito(null) }}
                    className={`flex items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors ${selecionado ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 hover:border-brand-300'}`}>
                    <div><p className="font-semibold text-slate-900">{n.numero}</p><p className="mt-1 text-xs text-slate-500">{n.nome}{n.configurado ? ' · padrão atual' : ''}</p></div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${n.status === 'CONNECTED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>● {n.status === 'CONNECTED' ? 'Online' : n.status}</span>
                  </button>
                )
              })}
            </div>
            {!numeros.length && <p className="text-sm text-erro-600">Nenhum número foi encontrado na conta da Meta.</p>}
            <div className="flex justify-end"><button type="button" onClick={() => setPasso(2)} disabled={!podeAvancar(1)} className="btn btn-primario">Próximo <ArrowRight className="h-4 w-4" /></button></div>
          </div>
        )}

        {passo === 2 && (
          <div className="space-y-4">
            <div><h2 className="text-lg font-semibold text-slate-900">Escolha o template</h2><p className="mt-1 text-sm text-slate-500">Somente modelos aprovados para campanhas e avisos comuns.</p></div>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                    {([
                      ['TODOS', 'Todos'], ['UTILITY', 'Utilidade'], ['MARKETING', 'Marketing'],
                    ] as const).map(([valor, rotulo]) => (
                      <button
                        type="button"
                        key={valor}
                        onClick={() => setFiltroCategoria(valor)}
                        className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${filtroCategoria === valor ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        {rotulo}
                      </button>
                    ))}
                  </div>
                  <div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar template…" className="input pl-9" /></div>
                </div>
                <div className="grid max-h-[430px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                  {templatesFiltrados.map(t => {
                    const selecionado = t.nome === templateNome
                    return (
                      <button type="button" key={t.nome} onClick={() => { setTemplateNome(t.nome); setParametros([]); setFeito(null) }}
                        className={`rounded-xl border p-4 text-left transition-colors ${selecionado ? 'border-brand-400 bg-brand-50 ring-2 ring-brand-100' : 'border-slate-200 hover:border-brand-300'}`}>
                        <div className="flex items-start justify-between gap-3"><p className="min-w-0 truncate font-semibold text-slate-900">{t.nome}</p><span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-2xs font-semibold text-slate-600">{categoriaLabel(t.categoria)}</span></div>
                        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs leading-5 text-slate-500">{t.corpo || 'Template sem texto de prévia.'}</p>
                        <p className="mt-2 text-2xs text-slate-400">{t.variaveis} variável(is) · {t.idioma.toUpperCase()}</p>
                      </button>
                    )
                  })}
                  {!templatesFiltrados.length && <p className="col-span-full py-10 text-center text-sm text-slate-400">Nenhum template neste filtro.</p>}
                </div>
              </div>

              <aside className="lg:sticky lg:top-4 lg:self-start">
                <p className="mb-2 text-center text-2xs font-semibold uppercase tracking-wide text-slate-400">Prévia no celular</p>
                <div className="mx-auto w-full max-w-[290px] rounded-[2.4rem] border-[7px] border-slate-900 bg-slate-900 p-1 shadow-xl">
                  <div className="relative min-h-[500px] overflow-hidden rounded-[1.9rem] bg-[#efeae2]">
                    <div className="absolute left-1/2 top-1.5 z-10 h-5 w-20 -translate-x-1/2 rounded-full bg-slate-900" />
                    <div className="flex items-center gap-2 bg-[#075e54] px-3 pb-3 pt-9 text-white">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">P</span>
                      <div><p className="text-xs font-semibold">Produzimos</p><p className="text-2xs text-white/70">conta comercial</p></div>
                    </div>
                    <div className="p-3">
                      {template ? (
                        <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
                          <p className="whitespace-pre-wrap break-words text-[11px] leading-[1.55] text-slate-700">{textoPrevia || 'Template sem texto de prévia.'}</p>
                          <p className="mt-1 text-right text-[9px] text-slate-400">Agora</p>
                        </div>
                      ) : (
                        <div className="mt-28 px-4 text-center">
                          <Phone className="mx-auto h-7 w-7 text-slate-300" />
                          <p className="mt-2 text-xs font-medium text-slate-500">Escolha um template</p>
                          <p className="mt-1 text-2xs leading-4 text-slate-400">A mensagem aparecerá aqui como o contato vai receber.</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </aside>
            </div>
            {template && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-2xs font-semibold uppercase tracking-wide text-slate-500">Personalização</p>
                {!template.variaveis ? <p className="mt-2 text-sm text-slate-600">Este template não possui variáveis.</p> : (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2"><span className="w-12 font-mono text-xs text-green-700">{'{{1}}'}</span><span className="text-sm text-green-800">Nome de cada contato (automático)</span></div>
                    {Array.from({ length: Math.max(0, template.variaveis - 1) }, (_, indice) => {
                      const posicao = indice + 1
                      return <label key={posicao} className="flex items-center gap-3"><span className="w-12 font-mono text-xs text-slate-500">{`{{${posicao + 1}}}`}</span><input value={parametros[posicao] ?? ''} onChange={e => { const copia = [...parametros]; copia[posicao] = e.target.value; setParametros(copia) }} className="input" placeholder={`Valor fixo de {{${posicao + 1}}}`} /></label>
                    })}
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-between"><button type="button" onClick={() => setPasso(1)} className="btn btn-secundario"><ArrowLeft className="h-4 w-4" /> Voltar</button><button type="button" onClick={() => setPasso(3)} disabled={!podeAvancar(2)} className="btn btn-primario">Próximo <ArrowRight className="h-4 w-4" /></button></div>
          </div>
        )}

        {passo === 3 && (
          <div className="space-y-4">
            <div><h2 className="text-lg font-semibold text-slate-900">Escolha os contatos</h2><p className="mt-1 text-sm text-slate-500">Use as equipes, a base dos sócios para teste ou importe uma lista externa.</p></div>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              <button type="button" onClick={() => { setOrigem('equipe'); setFeito(null) }} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${origem === 'equipe' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}><Database className="h-4 w-4" /> Equipes</button>
              <button type="button" onClick={() => { setOrigem('socios'); setFeito(null) }} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${origem === 'socios' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}><UserRoundCheck className="h-4 w-4" /> Sócios para teste</button>
              <button type="button" onClick={() => { setOrigem('csv'); setFeito(null) }} className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${origem === 'csv' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}><FileSpreadsheet className="h-4 w-4" /> Importar CSV</button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="text-xs text-slate-500">Evento de referência</span><select value={eventoId} onChange={e => { setEventoId(e.target.value); setSetorId(''); invalidarPublico() }} className="input mt-1">{eventos.map(e => <option key={e.id} value={e.id}>{e.nome}{e.ativo ? '' : ' · encerrado'}</option>)}</select></label>
              {origem === 'equipe' && <label><span className="text-xs text-slate-500">Setor</span><select value={setorId} onChange={e => { setSetorId(e.target.value); invalidarPublico() }} className="input mt-1"><option value="">Todos os setores</option>{setoresDoEvento.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>}
            </div>

            {origem === 'equipe' ? (
              <div className="space-y-3">
                <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3"><input type="checkbox" checked={somenteAtivos} onChange={e => { setSomenteAtivos(e.target.checked); invalidarPublico() }} className="mt-0.5 h-4 w-4 accent-brand-500" /><span className="text-xs text-slate-600">Incluir somente pessoas ativadas para trabalhar neste evento.</span></label>
                <button type="button" onClick={carregarEquipe} disabled={pendente || !eventoId} className="btn btn-secundario"><Users className="h-4 w-4" /> {pendente ? 'Carregando…' : 'Carregar público selecionado'}</button>
              </div>
            ) : origem === 'socios' ? (
              <div className="grid gap-3 sm:grid-cols-3">
                {SOCIOS_TESTE.map(socio => {
                  const marcado = sociosSelecionados.has(socio.telefone)
                  return (
                    <label key={socio.telefone} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${marcado ? 'border-brand-300 bg-brand-50' : 'border-slate-200 bg-white'}`}>
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() => setSociosSelecionados(atual => {
                          const proximo = new Set(atual)
                          if (proximo.has(socio.telefone)) proximo.delete(socio.telefone)
                          else proximo.add(socio.telefone)
                          return proximo
                        })}
                        className="mt-0.5 h-4 w-4 accent-brand-500"
                      />
                      <span className="min-w-0"><span className="block text-sm font-semibold text-slate-800">{socio.nome}</span><span className="mt-1 block font-mono text-2xs text-slate-500">{socio.telefone}</span></span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <button type="button" onClick={() => csvRef.current?.click()} className="w-full rounded-xl border-2 border-dashed border-slate-300 p-8 text-center transition-colors hover:border-brand-400 hover:bg-brand-50">
                <Upload className="mx-auto h-8 w-8 text-slate-400" /><span className="mt-2 block text-sm font-semibold text-slate-700">Selecionar arquivo CSV</span><span className="mt-1 block text-xs text-slate-500">Colunas Nome e Telefone; até 5.000 contatos</span>
                <input ref={csvRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => { importar(e.target.files?.[0], 'publico'); e.target.value = '' }} />
              </button>
            )}

            <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-start gap-3"><ShieldX className="mt-0.5 h-5 w-5 text-red-500" /><div><p className="text-sm font-semibold text-red-900">Lista de exclusão</p><p className="mt-1 text-xs text-red-700">Opcional: importe telefones que não devem receber este disparo.</p></div></div><button type="button" onClick={() => exclusaoRef.current?.click()} className="btn btn-secundario"><Upload className="h-4 w-4" /> Importar exclusão</button></div>
              <input ref={exclusaoRef} type="file" accept=".csv,.txt" className="hidden" onChange={e => { importar(e.target.files?.[0], 'exclusao'); e.target.value = '' }} />
              {!!exclusoes.length && <div className="mt-3 flex items-center justify-between border-t border-red-200 pt-3 text-xs text-red-800"><span>{exclusoes.length} telefone(s) na lista · {removidos} removido(s) deste público</span><button type="button" onClick={() => setExclusoes([])} className="font-semibold underline">Limpar</button></div>}
            </div>

            {!!contatosOrigem.length && (
              <div className="rounded-xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><p className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Users className="h-4 w-4 text-brand-500" /> {contatosFinais.length} destinatário(s) final(is)</p>{removidos > 0 && <span className="text-xs text-red-600">{removidos} excluído(s)</span>}</div>
                <div className="max-h-48 overflow-y-auto px-4 py-2">{contatosFinais.slice(0, 50).map(c => <div key={c.telefone} className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-xs"><span className="truncate text-slate-700">{c.nome}</span><span className="font-mono text-slate-500">{c.telefone}</span></div>)}{contatosFinais.length > 50 && <p className="py-2 text-center text-xs text-slate-400">… e mais {contatosFinais.length - 50}</p>}</div>
              </div>
            )}
            {previa?.semTelefone ? <p className="text-xs text-amber-700">{previa.semTelefone} cadastro(s) sem telefone válido ficaram de fora.</p> : null}
            <div className="flex justify-between"><button type="button" onClick={() => setPasso(2)} className="btn btn-secundario"><ArrowLeft className="h-4 w-4" /> Voltar</button><button type="button" onClick={() => setPasso(4)} disabled={!podeAvancar(3)} className="btn btn-primario">Próximo <ArrowRight className="h-4 w-4" /></button></div>
          </div>
        )}

        {passo === 4 && template && numero && (
          <div className="space-y-4">
            <div><h2 className="text-lg font-semibold text-slate-900">Revisar e enviar</h2><p className="mt-1 text-sm text-slate-500">Confira tudo antes de colocar as mensagens na fila.</p></div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-slate-200 p-4"><Phone className="h-5 w-5 text-green-600" /><p className="mt-3 text-2xs uppercase tracking-wide text-slate-400">Número</p><p className="mt-1 text-sm font-semibold text-slate-800">{numero.numero}</p></div>
              <div className="rounded-xl border border-slate-200 p-4"><FileText className="h-5 w-5 text-brand-500" /><p className="mt-3 text-2xs uppercase tracking-wide text-slate-400">Template</p><p className="mt-1 truncate text-sm font-semibold text-slate-800">{template.nome}</p></div>
              <div className="rounded-xl border border-slate-200 p-4"><Users className="h-5 w-5 text-blue-500" /><p className="mt-3 text-2xs uppercase tracking-wide text-slate-400">Contatos</p><p className="mt-1 text-sm font-semibold text-slate-800">{contatosFinais.length.toLocaleString('pt-BR')}</p></div>
              <div className="rounded-xl border border-slate-200 p-4"><CircleDollarSign className="h-5 w-5 text-amber-500" /><p className="mt-3 text-2xs uppercase tracking-wide text-slate-400">Estimativa</p><p className="mt-1 text-sm font-semibold text-slate-800">{(contatosFinais.length * custoUnitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p><p className="mt-1 text-2xs text-slate-400">estimativa operacional</p></div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Atenção antes de disparar</p><p className="mt-1 text-xs leading-5">As mensagens usarão a API oficial da Meta e entrarão na fila segura do Credenciei, com espaçamento e tentativas controladas. Não clique novamente enquanto o resultado estiver sendo processado.</p></div>
            {erro && <p className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-erro-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {erro}</p>}
            {feito && <p className="flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {feito}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between"><button type="button" onClick={() => setPasso(3)} disabled={pendente} className="btn btn-secundario"><ArrowLeft className="h-4 w-4" /> Voltar</button><button type="button" onClick={enviar} disabled={pendente || !!feito} className="btn btn-primario btn-lg"><Send className="h-4 w-4" /> {pendente ? 'Enfileirando…' : `Disparar ${contatosFinais.length} mensagens`}</button></div>
          </div>
        )}

        {erro && passo !== 4 && <p className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-erro-600"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {erro}</p>}
      </section>
    </div>
  )
}
