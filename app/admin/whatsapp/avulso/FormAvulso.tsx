'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import {
  AlertCircle, CheckCircle2, FileSpreadsheet, Loader2, RefreshCw, Send, Upload, Users, XCircle,
} from 'lucide-react'
import { dispararEmMassa, statusDoDisparo, type StatusDisparo } from '@/lib/actions-whatsapp'
import { lerPlanilhaDeContatos, type ContatoPlanilha } from '@/lib/planilha'

/*
 * Envio avulso: uma lista de contatos numa planilha, um template, e o
 * acompanhamento do que aconteceu com AQUELE envio.
 *
 * Existe separado de "Novo disparo" porque o público é outro. O disparo normal
 * fala com a equipe cadastrada de um evento, filtrando por setor. Aqui a lista
 * vem de fora e não tem nada a ver com a base: é o envio esporádico, pra uma
 * relação que alguém montou numa planilha.
 *
 * A diferença que mais importa é o depois. A Visão geral responde "quantas
 * saíram hoje", somando com todos os avisos automáticos do sistema. Esta tela
 * responde "o meu, aquele de agora, chegou?" — e mostra o motivo de cada falha.
 */

type Evento = { id: string; nome: string }
type Numero = { id: string; numero: string; nome: string; status: string }
type Template = { nome: string; variaveis: number; corpo: string; categoria: string }

const INTERVALO_MS = 4000

export default function FormAvulso({ eventos, numeros, templates }: {
  eventos: Evento[]; numeros: Numero[]; templates: Template[]
}) {
  const [eventoId, setEventoId] = useState(eventos[0]?.id ?? '')
  const [numeroId, setNumeroId] = useState(numeros.find(n => n.status === 'CONNECTED')?.id ?? '')
  const [templateNome, setTemplateNome] = useState('')
  const [parametros, setParametros] = useState<string[]>([])
  const [contatos, setContatos] = useState<ContatoPlanilha[]>([])
  const [resumoArquivo, setResumoArquivo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [campanhaId, setCampanhaId] = useState<string | null>(null)
  const [status, setStatus] = useState<StatusDisparo | null>(null)
  const [enviando, iniciar] = useTransition()
  const arquivoRef = useRef<HTMLInputElement>(null)

  const template = templates.find(t => t.nome === templateNome)

  // A variável {{1}} é sempre o nome de cada contato, preenchida linha a linha
  // pelo servidor. Só da {{2}} em diante é que alguém precisa escrever algo.
  const extras = template ? Math.max(0, template.variaveis - 1) : 0

  async function aoEscolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return
    setErro(null)
    try {
      const { contatos: lidos, descartadas, duplicados } = await lerPlanilhaDeContatos(arquivo)
      setContatos(lidos)
      if (!lidos.length) {
        setErro('Nenhum telefone válido na planilha. Confira se existe uma coluna Telefone e se os números têm DDD.')
        setResumoArquivo(null)
        return
      }
      const partes = [`${lidos.length} contato${lidos.length === 1 ? '' : 's'}`]
      if (duplicados) partes.push(`${duplicados} repetido${duplicados === 1 ? '' : 's'} removido${duplicados === 1 ? '' : 's'}`)
      if (descartadas) partes.push(`${descartadas} sem telefone utilizável`)
      setResumoArquivo(`${arquivo.name}: ${partes.join(', ')}.`)
    } catch {
      setErro('Não consegui ler o arquivo. Vale .xlsx, .xls ou .csv, com colunas Nome e Telefone.')
    }
  }

  function enviar() {
    setErro(null)
    if (!eventoId) { setErro('Escolha o evento: é ele que identifica o disparo depois.'); return }
    if (!numeroId) { setErro('Escolha o número que vai enviar.'); return }
    if (!template) { setErro('Escolha o template aprovado.'); return }
    if (!contatos.length) { setErro('Suba a planilha de contatos.'); return }
    for (let i = 0; i < extras; i++) {
      if (!String(parametros[i + 1] ?? '').trim()) {
        setErro(`Preencha o valor da variável {{${i + 2}}}: ela é igual para todos os contatos.`)
        return
      }
    }

    iniciar(async () => {
      try {
        const r = await dispararEmMassa({
          alvo: { eventoId, somenteAtivos: false },
          origem: 'csv',
          contatosImportados: contatos,
          phoneNumberId: numeroId,
          template: template.nome,
          parametros,
        })
        setCampanhaId(r.campanhaId)
        setStatus(null)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não consegui iniciar o disparo.')
      }
    })
  }

  // Enquanto houver gente esperando a vez, relê sozinho. Parar ao concluir
  // evita bater no banco pra sempre numa aba esquecida aberta.
  useEffect(() => {
    if (!campanhaId) return
    let vivo = true
    const ler = async () => {
      try {
        const s = await statusDoDisparo(campanhaId)
        if (!vivo) return
        setStatus(s)
        if (!s.concluido) setTimeout(ler, INTERVALO_MS)
      } catch { /* silencioso: a próxima leitura tenta de novo */ }
    }
    ler()
    return () => { vivo = false }
  }, [campanhaId])

  if (campanhaId) {
    return (
      <PainelStatus
        status={status}
        onNovo={() => {
          setCampanhaId(null); setStatus(null); setContatos([]); setResumoArquivo(null)
          if (arquivoRef.current) arquivoRef.current.value = ''
        }}
        onAtualizar={async () => setStatus(await statusDoDisparo(campanhaId))}
      />
    )
  }

  return (
    <div className="space-y-5">
      <section className="secao space-y-4">
        <h2 className="text-base font-bold">1. Para onde vai</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Evento</span>
            <select className="input" value={eventoId} onChange={e => setEventoId(e.target.value)}>
              {eventos.map(ev => <option key={ev.id} value={ev.id}>{ev.nome}</option>)}
            </select>
            <span className="text-xs opacity-60">Só identifica o disparo no histórico. A lista vem da planilha.</span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Número que envia</span>
            <select className="input" value={numeroId} onChange={e => setNumeroId(e.target.value)}>
              <option value="">Escolha</option>
              {numeros.map(n => (
                <option key={n.id} value={n.id} disabled={n.status !== 'CONNECTED'}>
                  {n.numero} {n.status !== 'CONNECTED' ? '(indisponível)' : ''}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="secao space-y-4">
        <h2 className="text-base font-bold">2. Quem recebe</h2>
        <input ref={arquivoRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={aoEscolherArquivo} />
        <button type="button" onClick={() => arquivoRef.current?.click()}
          className="w-full rounded-xl border-2 border-dashed p-8 text-center transition-colors"
          style={{ borderColor: 'var(--vidro-borda)' }}>
          <Upload className="mx-auto h-7 w-7 opacity-50" />
          <span className="mt-2 block text-sm font-semibold">Selecionar planilha</span>
          <span className="mt-1 block text-xs opacity-60">.xlsx, .xls ou .csv, com as colunas Nome e Telefone. Até 5.000 contatos.</span>
        </button>
        {resumoArquivo && (
          <p className="flex items-center gap-2 text-sm">
            <FileSpreadsheet size={15} /> {resumoArquivo}
          </p>
        )}
        {contatos.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer opacity-70">Ver os 10 primeiros</summary>
            <ul className="mt-2 space-y-1 opacity-70">
              {contatos.slice(0, 10).map(c => <li key={c.telefone}>{c.nome} · {c.telefone}</li>)}
            </ul>
          </details>
        )}
      </section>

      <section className="secao space-y-4">
        <h2 className="text-base font-bold">3. O que vai ser enviado</h2>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Template aprovado</span>
          <select className="input" value={templateNome}
            onChange={e => { setTemplateNome(e.target.value); setParametros([]) }}>
            <option value="">Escolha</option>
            {templates.map(t => (
              <option key={t.nome} value={t.nome}>
                {t.nome} ({t.categoria === 'MARKETING' ? 'Marketing' : 'Utilidade'}, {t.variaveis} variáveis)
              </option>
            ))}
          </select>
        </label>

        {template && (
          <>
            <p className="secao secao-info whitespace-pre-wrap text-sm">{template.corpo}</p>
            {template.variaveis > 0 && (
              <p className="text-xs opacity-60">
                {'A variável {{1}} recebe o nome de cada contato da planilha, automaticamente.'}
              </p>
            )}
            {extras > 0 && (
              <div className="grid gap-2 md:grid-cols-2">
                {Array.from({ length: extras }, (_, i) => (
                  <label key={i} className="flex items-center gap-2">
                    <span className="w-12 text-sm font-semibold opacity-70">{`{{${i + 2}}}`}</span>
                    <input className="input" value={parametros[i + 1] ?? ''}
                      placeholder="Mesmo valor para todos"
                      onChange={e => setParametros(a => { const c = [...a]; c[i + 1] = e.target.value; return c })} />
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {erro && (
        <p className="secao secao-erro flex items-start gap-2 text-sm">
          <AlertCircle size={16} className="mt-0.5 shrink-0" /> {erro}
        </p>
      )}

      <div className="linha-acao">
        <button className="btn btn-primario btn-grande" onClick={enviar} disabled={enviando}>
          {enviando ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          {enviando ? 'Enfileirando...' : `Enviar para ${contatos.length} contato${contatos.length === 1 ? '' : 's'}`}
        </button>
      </div>
      <p className="text-xs opacity-60">
        Mensagem enviada não volta. Confira o número, o template e a planilha antes.
      </p>
    </div>
  )
}

function PainelStatus({ status, onNovo, onAtualizar }: {
  status: StatusDisparo | null
  onNovo: () => void
  onAtualizar: () => Promise<void>
}) {
  if (!status) {
    return (
      <section className="secao flex items-center gap-3">
        <Loader2 size={18} className="animate-spin" />
        <span className="text-sm">Lendo o status do disparo...</span>
      </section>
    )
  }

  const naFila = status.pendentes + status.enviando

  return (
    <div className="space-y-4">
      <section className={`secao ${status.concluido ? 'secao-sucesso' : 'secao-acento'} space-y-3`}>
        <div className="flex items-center gap-2">
          {status.concluido ? <CheckCircle2 size={18} /> : <Loader2 size={18} className="animate-spin" />}
          <h2 className="text-base font-bold">
            {status.concluido ? 'Disparo concluído' : 'Enviando...'}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Numero rotulo="Total" valor={status.total} icone={<Users size={15} />} />
          <Numero rotulo="Entregues ao WhatsApp" valor={status.enviadas} icone={<CheckCircle2 size={15} />} />
          <Numero rotulo="Falharam" valor={status.falhas} icone={<XCircle size={15} />} />
          <Numero rotulo="Na fila" valor={naFila} icone={<Loader2 size={15} />} />
        </div>
        {status.canceladas > 0 && (
          <p className="text-xs opacity-70">{status.canceladas} cancelada(s) pelo sistema, normalmente por telefone inválido.</p>
        )}
      </section>

      {status.erros.length > 0 && (
        <section className="secao secao-erro space-y-2">
          <h3 className="text-sm font-bold">Por que estas não chegaram</h3>
          <ul className="space-y-1 text-sm">
            {status.erros.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono opacity-70">{e.telefone}</span>
                <span className="opacity-80">{e.motivo}</span>
              </li>
            ))}
          </ul>
          {status.falhas > status.erros.length && (
            <p className="text-xs opacity-60">Mostrando {status.erros.length} de {status.falhas} falhas.</p>
          )}
        </section>
      )}

      <div className="linha-acao">
        <button className="btn btn-secundario" onClick={() => void onAtualizar()}>
          <RefreshCw size={16} /> Atualizar agora
        </button>
        <button className="btn btn-fantasma" onClick={onNovo}>Fazer outro envio</button>
      </div>
    </div>
  )
}

function Numero({ rotulo, valor, icone }: { rotulo: string; valor: number; icone: React.ReactNode }) {
  return (
    <div className="indicador">
      <span className="flex items-center gap-1.5 text-xs opacity-70">{icone} {rotulo}</span>
      <strong className="text-2xl font-extrabold">{valor}</strong>
    </div>
  )
}
