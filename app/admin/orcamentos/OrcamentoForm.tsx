'use client'
import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { TelefoneInput } from '@/components/inputs'
import DateTimePicker from '@/components/DateTimePicker'
import { Secao } from '@/components/ui/Superficie'
import { criarOrcamento, editarOrcamento, type ItemOrcamentoInput } from '@/lib/actions-orcamentos'
import { ROTULO_STATUS, STATUS_ORCAMENTO, type StatusOrcamento } from '@/lib/orcamentos-constantes'
import type { OrcamentoComItens } from '@/lib/orcamentos'
import PreviaOrcamento from './PreviaOrcamento'

type LinhaItem = ItemOrcamentoInput & { chave: string }

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
 * pedido ao usuário pra somar.
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
  const [observacoes, setObservacoes] = useState(orcamentoExistente?.observacoes ?? '')
  const [status, setStatus] = useState<StatusOrcamento>(orcamentoExistente?.status ?? 'rascunho')
  const [itens, setItens] = useState<LinhaItem[]>(
    (orcamentoExistente?.itens ?? []).map(i => ({ chave: novaChave(), descricao: i.descricao, valor: i.valor })),
  )

  const valorDia = paraNumero(valorDiaTexto)
  const valorFuncionario = paraNumero(valorFuncionarioTexto)
  const valorTecnico = paraNumero(valorTecnicoTexto)

  const total = useMemo(
    () => valorDia + valorFuncionario + valorTecnico + itens.reduce((s, i) => s + i.valor, 0),
    [valorDia, valorFuncionario, valorTecnico, itens],
  )

  const adicionarItem = () => setItens(prev => [...prev, { chave: novaChave(), descricao: '', valor: 0 }])
  const removerItem = (chave: string) => setItens(prev => prev.filter(i => i.chave !== chave))
  const mudarItem = (chave: string, campo: 'descricao' | 'valorTexto', valor: string) => {
    setItens(prev => prev.map(i => {
      if (i.chave !== chave) return i
      if (campo === 'descricao') return { ...i, descricao: valor }
      return { ...i, valor: paraNumero(valor) }
    }))
  }

  const salvar = () => {
    setErro(null)
    if (!nomeEvento.trim()) return setErro('Informe o nome do evento.')
    if (!responsavel.trim()) return setErro('Informe o responsável.')
    if (!telefone.trim()) return setErro('Informe o telefone.')
    if (!dataEvento.trim()) return setErro('Informe a data do evento.')

    const dados = {
      nomeEvento, responsavel, telefone, dataEvento,
      valorDia, valorFuncionario, valorTecnico,
      observacoes, status,
      itens: itens.map(({ descricao, valor }) => ({ descricao, valor })),
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
      itens={itens} observacoes={observacoes} total={total}
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

          <Secao titulo="Valores" corpoClassName="p-5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <ValorInput rotulo="Valor do dia" valor={valorDiaTexto} onChange={setValorDiaTexto} />
              <ValorInput rotulo="Valor por funcionário" valor={valorFuncionarioTexto} onChange={setValorFuncionarioTexto} />
              <ValorInput rotulo="Valor do técnico" valor={valorTecnicoTexto} onChange={setValorTecnicoTexto} />
            </div>
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
                    value={paraTexto(item.valor)} onChange={e => mudarItem(item.chave, 'valorTexto', e.target.value.replace(/[^\d,]/g, ''))}
                  />
                </div>
                <button onClick={() => removerItem(item.chave)} aria-label="Excluir" className="btn-press w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-600 hover:bg-slate-50 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
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
