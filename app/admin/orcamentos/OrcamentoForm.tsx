'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Minus, AlertTriangle } from 'lucide-react'
import { TelefoneInput } from '@/components/inputs'
import DateTimePicker from '@/components/DateTimePicker'
import { Secao } from '@/components/ui/Superficie'
import { criarOrcamento, editarOrcamento } from '@/lib/actions-orcamentos'
import { ROTULO_STATUS, STATUS_ORCAMENTO, type StatusOrcamento } from '@/lib/orcamentos-constantes'
import type { OrcamentoComItens } from '@/lib/orcamentos'
import PreviaOrcamento from './PreviaOrcamento'

/**
 * Um item guarda o TEXTO digitado do valor, não o número — o valor final
 * (`paraNumero`) só é calculado quando alguém precisa dele (total, prévia,
 * submit). Formatar de volta a cada tecla (ex.: `paraTexto(paraNumero(v))`
 * como `value` do input) trava a digitação: o campo reformata sozinho no
 * meio da digitação e não dá pra teclar um segundo dígito. Foi exatamente
 * esse bug que prendia "Valores adicionais" em R$ 1,00.
 */
type LinhaItem = { chave: string; descricao: string; valorTexto: string }

function paraNumero(texto: string): number {
  const n = parseFloat(texto.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function paraTexto(n: number): string {
  return n > 0 ? n.toFixed(2).replace('.', ',') : ''
}

let contador = 0
const novaChave = () => `item-${Date.now()}-${contador++}`

/**
 * Um único formulário pra criar e editar — os campos são idênticos, só muda
 * o valor inicial e qual Server Action é chamada ao salvar.
 *
 * Itens adicionais vivem em estado local (array), sem persistência
 * intermediária: adicionar/remover só grava de verdade quando o orçamento
 * inteiro é salvo. O total é recalculado a cada tecla (`useMemo`), nunca
 * pedido ao usuário pra somar: (dia + funcionário + técnico) × dias + itens
 * − desconto, sem deixar o total ficar negativo.
 */
export default function OrcamentoForm({ orcamentoExistente }: { orcamentoExistente?: OrcamentoComItens }) {
  const router = useRouter()
  const [pendente, startTransition] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const [aba, setAba] = useState<'form' | 'previa'>('form')

  const [nomeEvento, setNomeEvento] = useState(orcamentoExistente?.nomeEvento ?? '')
  const [responsavel, setResponsavel] = useState(orcamentoExistente?.responsavel ?? '')
  const [telefone, setTelefone] = useState(orcamentoExistente?.telefone ?? '')
  const [dataEvento, setDataEvento] = useState(orcamentoExistente?.dataEvento ?? '')
  const [valorDiaTexto, setValorDiaTexto] = useState(paraTexto(orcamentoExistente?.valorDia ?? 0))
  const [valorFuncionarioTexto, setValorFuncionarioTexto] = useState(paraTexto(orcamentoExistente?.valorFuncionario ?? 0))
  const [valorTecnicoTexto, setValorTecnicoTexto] = useState(paraTexto(orcamentoExistente?.valorTecnico ?? 0))
  const [dias, setDias] = useState(orcamentoExistente?.dias ?? 1)
  const [descontoTexto, setDescontoTexto] = useState(paraTexto(orcamentoExistente?.desconto ?? 0))
  const [observacoes, setObservacoes] = useState(orcamentoExistente?.observacoes ?? '')
  const [status, setStatus] = useState<StatusOrcamento>(orcamentoExistente?.status ?? 'rascunho')
  const [itens, setItens] = useState<LinhaItem[]>(
    (orcamentoExistente?.itens ?? []).map(i => ({ chave: novaChave(), descricao: i.descricao, valorTexto: paraTexto(i.valor) })),
  )

  const valorDia = paraNumero(valorDiaTexto)
  const valorFuncionario = paraNumero(valorFuncionarioTexto)
  const valorTecnico = paraNumero(valorTecnicoTexto)
  const desconto = paraNumero(descontoTexto)

  const itensNumericos = useMemo(
    () => itens.map(i => ({ descricao: i.descricao, valor: paraNumero(i.valorTexto) })),
    [itens],
  )

  const subtotal = useMemo(
    () => (valorDia + valorFuncionario + valorTecnico) * dias + itensNumericos.reduce((s, i) => s + i.valor, 0),
    [valorDia, valorFuncionario, valorTecnico, dias, itensNumericos],
  )
  const total = Math.max(0, subtotal - desconto)

  const adicionarItem = () => setItens(prev => [...prev, { chave: novaChave(), descricao: '', valorTexto: '' }])
  const removerItem = (chave: string) => setItens(prev => prev.filter(i => i.chave !== chave))
  const mudarItem = (chave: string, campo: 'descricao' | 'valorTexto', valor: string) =>
    setItens(prev => prev.map(i => (i.chave === chave ? { ...i, [campo]: valor } : i)))

  const salvar = () => {
    setErro(null)
    if (!nomeEvento.trim()) return setErro('Informe o nome do evento.')
    if (!responsavel.trim()) return setErro('Informe o responsável.')
    if (!telefone.trim()) return setErro('Informe o telefone.')
    if (!dataEvento.trim()) return setErro('Informe a data do evento.')

    const dados = {
      nomeEvento, responsavel, telefone, dataEvento,
      valorDia, valorFuncionario, valorTecnico, dias, desconto,
      observacoes, status,
      itens: itensNumericos,
    }

    startTransition(async () => {
      const r = orcamentoExistente
        ? await editarOrcamento(orcamentoExistente.id, dados)
        : await criarOrcamento(dados)
      if (!r.ok) { setErro(r.erro); return }
      const id = r.id ?? orcamentoExistente?.id
      if (id) window.open(`/api/orcamentos/${id}/pdf`, '_blank', 'noopener,noreferrer')
      router.push('/admin/orcamentos')
      router.refresh()
    })
  }

  const previa = (
    <PreviaOrcamento
      numero={orcamentoExistente?.numero}
      nomeEvento={nomeEvento} responsavel={responsavel} telefone={telefone} dataEvento={dataEvento}
      valorDia={valorDia} valorFuncionario={valorFuncionario} valorTecnico={valorTecnico}
      dias={dias} desconto={desconto}
      itens={itensNumericos} observacoes={observacoes} total={total}
    />
  )

  return (
    <div className="space-y-4">
      {/* Toggle só em telas estreitas — desktop mostra os dois lado a lado */}
      <div className="flex lg:hidden gap-2">
        <button onClick={() => setAba('form')} className={`btn btn-sm flex-1 ${aba === 'form' ? 'btn-primario' : 'btn-secundario'}`}>Formulário</button>
        <button onClick={() => setAba('previa')} className={`btn btn-sm flex-1 ${aba === 'previa' ? 'btn-primario' : 'btn-secundario'}`}>Prévia</button>
      </div>

      <div className="grid lg:grid-cols-2 gap-5 items-start">
        <div className={`space-y-4 ${aba === 'previa' ? 'hidden lg:block' : ''}`}>
          <Secao titulo="Dados do evento" corpoClassName="p-5 space-y-3">
            <Campo rotulo="Nome do evento" obrigatorio>
              <input className="input" value={nomeEvento} onChange={e => setNomeEvento(e.target.value)} placeholder="Festival de Verão 2026" />
            </Campo>
            <Campo rotulo="Responsável" obrigatorio>
              <input className="input" value={responsavel} onChange={e => setResponsavel(e.target.value)} placeholder="Nome de quem fala com o Credenciei" />
            </Campo>
            <div className="grid grid-cols-2 gap-3">
              <Campo rotulo="Telefone" obrigatorio>
                <TelefoneInput className="input" defaultValue={telefone} onValueChange={setTelefone} placeholder="(00) 00000-0000" />
              </Campo>
              <Campo rotulo="Data do evento" obrigatorio>
                <DateTimePicker modo="data" value={dataEvento} onChange={setDataEvento} placeholder="DD/MM/AAAA" className="w-full" />
              </Campo>
            </div>
          </Secao>

          <Secao
            titulo="Valores" corpoClassName="p-5 space-y-3"
            acoes={<DiasStepper dias={dias} onChange={setDias} />}
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ValorInput rotulo="Valor do dia" valor={valorDiaTexto} onChange={setValorDiaTexto} />
              <ValorInput rotulo="Valor por funcionário" valor={valorFuncionarioTexto} onChange={setValorFuncionarioTexto} />
              <ValorInput rotulo="Valor do técnico" valor={valorTecnicoTexto} onChange={setValorTecnicoTexto} />
            </div>
            {dias > 1 && (
              <p className="text-slate-400 text-xs">
                Os 3 valores acima são multiplicados por {dias} dias no total e no PDF.
              </p>
            )}
          </Secao>

          <Secao
            titulo="Valores adicionais" corpoClassName="p-5 space-y-2.5"
            acoes={<button onClick={adicionarItem} className="btn btn-secundario btn-sm"><Plus className="w-3.5 h-3.5" /> Adicionar valor</button>}
          >
            {itens.length === 0 && <p className="text-slate-400 text-sm">Nenhum valor adicional. Ex.: combustível, hospedagem, hora extra.</p>}
            {itens.map(item => (
              <div key={item.chave} className="flex items-center gap-2">
                <input
                  className="input flex-1" placeholder="Descrição (ex.: Combustível)"
                  value={item.descricao} onChange={e => mudarItem(item.chave, 'descricao', e.target.value)}
                />
                <div className="relative w-36 shrink-0">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                  <input
                    className="input tabular-nums" style={{ paddingLeft: 34 }} inputMode="decimal" placeholder="0,00"
                    value={item.valorTexto} onChange={e => mudarItem(item.chave, 'valorTexto', e.target.value.replace(/[^\d,]/g, ''))}
                  />
                </div>
                <button onClick={() => removerItem(item.chave)} aria-label="Excluir" className="btn-press w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-50 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </Secao>

          <Secao titulo="Desconto" corpoClassName="p-5 space-y-1.5">
            <div className="max-w-xs">
              <ValorInput rotulo="Valor do desconto" valor={descontoTexto} onChange={setDescontoTexto} />
            </div>
            <p className="text-slate-400 text-xs">Abatido do total. Aparece como uma linha própria no PDF.</p>
          </Secao>

          <Secao titulo="Observações" corpoClassName="p-5">
            <textarea
              className="input min-h-24 resize-y" placeholder="Ex.: o orçamento contempla equipe de 5 profissionais durante o período contratado."
              value={observacoes} onChange={e => setObservacoes(e.target.value)}
            />
          </Secao>

          {orcamentoExistente && (
            <Secao titulo="Status" corpoClassName="p-5">
              <select className="input" value={status} onChange={e => setStatus(e.target.value as StatusOrcamento)}>
                {STATUS_ORCAMENTO.map(s => <option key={s} value={s}>{ROTULO_STATUS[s]}</option>)}
              </select>
            </Secao>
          )}
        </div>

        <div className={`space-y-4 ${aba === 'form' ? 'hidden lg:block' : ''}`}>
          <div className="lg:sticky lg:top-4 space-y-4">
            {previa}
          </div>
        </div>
      </div>

      {erro && (
        <p className="flex items-start gap-1.5 text-red-600 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-px" /> {erro}
        </p>
      )}

      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-slate-200 -mx-4 sm:mx-0 px-4 sm:px-0 py-3 sm:py-0 sm:border-0 sm:bg-transparent flex items-center justify-between gap-3">
        <div>
          <p className="text-slate-400 text-2xs uppercase tracking-wide font-semibold">Total</p>
          <p className="text-xl font-extrabold text-slate-800 tabular-nums">{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/admin/orcamentos')} className="btn btn-secundario" disabled={pendente}>Cancelar</button>
          <button onClick={salvar} className="btn btn-primario" disabled={pendente}>
            {pendente ? 'Gerando…' : 'Gerar orçamento'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Campo({ rotulo, obrigatorio, children }: { rotulo: string; obrigatorio?: boolean; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-slate-500 text-xs font-medium">{rotulo}{obrigatorio && <span className="text-red-500"> *</span>}</span>
      {children}
    </label>
  )
}

function ValorInput({ rotulo, valor, onChange }: { rotulo: string; valor: string; onChange: (v: string) => void }) {
  return (
    <Campo rotulo={rotulo}>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
        <input
          className="input tabular-nums" style={{ paddingLeft: 34 }} inputMode="decimal" placeholder="0,00"
          value={valor} onChange={e => onChange(e.target.value.replace(/[^\d,]/g, ''))}
        />
      </div>
    </Campo>
  )
}

/** O "botão do lado dos valores" — evento de mais de um dia multiplica dia/funcionário/técnico juntos. */
function DiasStepper({ dias, onChange }: { dias: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-slate-400 text-xs font-medium hidden sm:inline">Dias do evento</span>
      <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
        <button
          type="button" onClick={() => onChange(Math.max(1, dias - 1))} disabled={dias <= 1}
          className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <span className="w-8 text-center text-sm font-semibold tabular-nums text-slate-800">{dias}</span>
        <button
          type="button" onClick={() => onChange(dias + 1)}
          className="w-7 h-7 flex items-center justify-center text-slate-500 hover:bg-slate-50"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
