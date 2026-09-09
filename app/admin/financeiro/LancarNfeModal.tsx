'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, X, Save, Paperclip, AlertTriangle, Check } from 'lucide-react'
import { criarCusto, salvarFaturamento } from '@/lib/actions-financeiro'
import { CATEGORIAS_CUSTO, EVENTO_INTERNO } from '@/lib/financeiro-categorias'
import { mensagemAmigavel } from '@/lib/erros'
import SeletorLista from '@/components/SeletorLista'
import DateTimePicker from '@/components/DateTimePicker'

const hoje = () => new Date().toISOString().slice(0, 10)

/**
 * Atalho do dashboard: lançar uma NFe sem entrar no evento primeiro.
 *
 * A mesma NFe pode representar duas coisas bem diferentes, e é isso que o
 * "tipo" pergunta antes de qualquer outro campo:
 *
 *   · NOTA DE CUSTO — o que ALGUÉM cobrou da gente (fornecedor, prestador).
 *     Vira um lançamento em `custos_evento`, com a NFe como comprovante.
 *     Cada evento pode ter várias.
 *
 *   · NOTA DE FATURAMENTO — o que A GENTE cobrou do cliente por aquele
 *     evento. Define o faturamento do evento em `financeiro_eventos`, com a
 *     NFe anexada. Só existe UMA por evento (o mesmo campo que se edita na
 *     página do evento) — lançar de novo aqui SUBSTITUI o valor anterior,
 *     e o aviso abaixo do campo diz isso antes do envio.
 *
 * Não é uma tabela nova: é a MESMA ação de sempre (`criarCusto` ou
 * `salvarFaturamento`), só que iniciada de um lugar que não pede pra achar
 * o evento primeiro.
 */
export default function LancarNfeModal({
  eventos,
}: {
  eventos: { id: string; nome: string }[]
}) {
  const [aberto, setAberto] = useState(false)
  return (
    <>
      <button onClick={() => setAberto(true)} className="btn btn-primario">
        <FileText className="w-3.5 h-3.5 shrink-0" /> Lançar NFe
      </button>
      {aberto && <Formulario eventos={eventos} onFechar={() => setAberto(false)} />}
    </>
  )
}

type Tipo = 'custo' | 'faturamento'

function Formulario({
  eventos, onFechar,
}: {
  eventos: { id: string; nome: string }[]
  onFechar: () => void
}) {
  const router = useRouter()
  const [eventoId, setEventoId] = useState('')
  const [tipo, setTipo] = useState<Tipo>('custo')
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_CUSTO[0])
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [feito, setFeito] = useState(false)
  const [pendente, startTransition] = useTransition()

  const interno = eventoId === EVENTO_INTERNO
  const eventoNome = interno ? 'despesas internas' : eventos.find(e => e.id === eventoId)?.nome ?? ''
  // Interno não é evento — não existe "faturamento de despesa interna".
  // Trava o tipo em custo assim que a pessoa escolhe Interno, mesmo se ela
  // tinha marcado Faturamento antes de trocar o evento.
  const tipoEfetivo: Tipo = interno ? 'custo' : tipo

  const salvar = (formData: FormData) => {
    setErro(null)
    if (!eventoId) { setErro('Escolha o evento.'); return }
    if (!nomeArquivo) { setErro('Anexe o arquivo da NFe.'); return }

    startTransition(async () => {
      try {
        if (tipoEfetivo === 'custo') {
          formData.set('categoria', categoria)
          // O input de arquivo chama "nfe" nesta tela (é o rótulo que a
          // pessoa entende); a action de custo espera "comprovante".
          const arquivo = formData.get('nfe')
          formData.delete('nfe')
          if (arquivo) formData.set('comprovante', arquivo)
          await criarCusto(interno ? null : eventoId, formData)
        } else {
          await salvarFaturamento(eventoId, formData)
        }
        setFeito(true)
        router.refresh()
      } catch (e) {
        setErro(mensagemAmigavel(e))
      }
    })
  }

  if (feito) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onFechar}>
        <div className="overlay-fade-in absolute inset-0 bg-black/45" />
        <div className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
          <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto">
            <Check className="w-6 h-6 text-green-600" />
          </div>
          <p className="text-slate-800 font-semibold mt-3">NFe lançada</p>
          <p className="text-slate-500 text-sm mt-1">
            {tipoEfetivo === 'custo' ? `Entrou como custo de ${eventoNome}.` : `Faturamento de ${eventoNome} atualizado.`}
          </p>
          <div className="flex gap-2 mt-5">
            <button onClick={onFechar} className="btn btn-secundario flex-1 justify-center">Fechar</button>
            <button
              onClick={() => { setFeito(false); setEventoId(''); setNomeArquivo(null) }}
              className="btn btn-primario flex-1 justify-center"
            >
              Lançar outra
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !pendente && onFechar()}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div
        className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-slate-800 font-bold flex items-center gap-2">
            <FileText className="w-4 h-4 text-brand-500" /> Lançar NFe
          </h2>
          <button onClick={onFechar} disabled={pendente} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form action={salvar} className="p-6 space-y-4">
          <Field label="Evento *">
            <SeletorLista
              valor={eventoId}
              onChange={setEventoId}
              placeholder="Pra qual evento é essa nota?"
              titulo="Escolha o evento"
              busca
              opcoes={[
                { valor: EVENTO_INTERNO, rotulo: 'Interno — despesas da empresa', detalhe: 'Salário, serviço contratado — não é de nenhum evento' },
                ...eventos.map(e => ({ valor: e.id, rotulo: e.nome })),
              ]}
            />
          </Field>

          <Field label="Essa nota é de *">
            <div className="grid grid-cols-2 gap-2">
              <BotaoTipo ativo={tipoEfetivo === 'custo'} onClick={() => setTipo('custo')} titulo="Custo" descricao="O que cobraram da gente" />
              <BotaoTipo
                ativo={tipoEfetivo === 'faturamento'}
                onClick={() => !interno && setTipo('faturamento')}
                desabilitado={interno}
                titulo="Faturamento"
                descricao={interno ? 'Não existe pra despesa interna' : 'O que a gente cobrou do cliente'}
              />
            </div>
          </Field>

          {tipoEfetivo === 'custo' ? (
            <>
              <Field label="Descrição do gasto *">
                <input name="descricao" required placeholder="Ex.: Serviço de som, diária dos seguranças…" className="input" />
              </Field>
              <div className="grid sm:grid-cols-2 gap-3">
                <Field label="Categoria *">
                  <SeletorLista valor={categoria} onChange={setCategoria} titulo="Categoria do custo" opcoes={CATEGORIAS_CUSTO.map(c => ({ valor: c, rotulo: c }))} />
                </Field>
                <Field label="Valor (R$) *">
                  <input name="valor" type="number" min="0" step="0.01" required placeholder="0,00" className="input tabular-nums" />
                </Field>
              </div>
              <Field label="Data do gasto *">
                <DateTimePicker modo="data" name="data" defaultValue={hoje()} required />
              </Field>
              <Field label="Observação">
                <textarea name="observacao" rows={2} placeholder="Detalhe opcional" className="input resize-none" />
              </Field>
            </>
          ) : (
            <>
              <Field label="Valor faturado (R$) *">
                <input name="faturamento" type="number" min="0" step="0.01" required placeholder="0,00" className="input tabular-nums" />
              </Field>
              <p className="flex items-start gap-1.5 text-amber-700 text-xs bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                Isto substitui o faturamento atual do evento — não soma. Se já existe um valor
                lançado, confira no Financeiro do evento antes de continuar.
              </p>
            </>
          )}

          <Field label="Arquivo da NFe *">
            <label className="btn btn-secundario w-full cursor-pointer justify-center">
              <Paperclip className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{nomeArquivo || 'Anexar PDF ou imagem'}</span>
              <input
                type="file" name="nfe" accept=".pdf,image/*" required className="hidden"
                onChange={e => setNomeArquivo(e.target.files?.[0]?.name ?? null)}
              />
            </label>
          </Field>

          {erro && (
            <p className="flex items-start gap-1.5 text-red-600 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={pendente} className="btn btn-primario disabled:opacity-50">
              <Save className="w-3.5 h-3.5 shrink-0" /> {pendente ? 'Salvando…' : 'Lançar NFe'}
            </button>
            <button type="button" onClick={onFechar} disabled={pendente} className="btn btn-secundario">
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BotaoTipo({
  ativo, onClick, titulo, descricao, desabilitado,
}: {
  ativo: boolean
  onClick: () => void
  titulo: string
  descricao: string
  desabilitado?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={desabilitado}
      className={`text-left rounded-xl border px-3.5 py-2.5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        ativo ? 'border-brand-300 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <span className={`block text-sm font-semibold ${ativo ? 'text-brand-700' : 'text-slate-700'}`}>{titulo}</span>
      <span className="block text-slate-500 text-xs mt-0.5">{descricao}</span>
    </button>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  )
}
