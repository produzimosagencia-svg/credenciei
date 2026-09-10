'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Save, AlertTriangle, Building2, CheckSquare } from 'lucide-react'
import { criarItemBacklog, editarItemBacklog } from '@/lib/actions-backlog'
import type { ItemBacklog } from '@/lib/backlog'
import {
  TIPOS, PRIORIDADES, ORIGENS_LEAD, COLUNAS, STATUS_INICIAL, type TipoItem,
} from '@/lib/backlog-constantes'
import SeletorLista from '@/components/SeletorLista'
import DateTimePicker from '@/components/DateTimePicker'

export type Opcoes = {
  responsaveis: { id: string; nome: string }[]
  eventos: { id: string; nome: string }[]
  organizacoes: { id: string; nome: string }[]
}

/**
 * "+ Adicionar ao Backlog" — e a edição, que é o mesmo formulário.
 *
 * ─── OS CAMPOS MUDAM COM O TIPO ──────────────────────────────────────────────
 *
 * Pedido explícito: "não criar formulários gigantes; os campos devem mudar
 * conforme o tipo". Possível cliente pergunta contato, WhatsApp, evento
 * previsto, quantidade e retorno; tarefa pergunta descrição e prazo. O que os
 * dois compartilham (título, prioridade, responsável, evento, observação)
 * aparece uma vez só, no mesmo lugar, nos dois casos.
 *
 * A action recebe o `FormData` cru e decide quais colunas preencher — os
 * campos do outro tipo vão a `null` de propósito lá (ver `camposDoFormulario`
 * em lib/actions-backlog.ts), pra um WhatsApp não ficar pendurado numa tarefa
 * depois de alguém trocar o tipo.
 */
export default function FormularioItem({
  item, tipoInicial, statusInicial, opcoes, onFechar,
}: {
  /** Preenchido = edição; vazio = criação. */
  item?: ItemBacklog | null
  tipoInicial?: TipoItem
  statusInicial?: string
  opcoes: Opcoes
  onFechar: () => void
}) {
  const router = useRouter()
  const editando = !!item
  const [tipo, setTipo] = useState<TipoItem>(item?.tipo ?? tipoInicial ?? 'cliente')
  const [prioridade, setPrioridade] = useState(item?.prioridade ?? 'media')
  const [responsavel, setResponsavel] = useState(item?.responsavelId ?? '')
  const [evento, setEvento] = useState(item?.eventoId ?? '')
  const [origem, setOrigem] = useState(item?.origemLead ?? '')
  const [status, setStatus] = useState(item?.status ?? statusInicial ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, startTransition] = useTransition()

  const statusEfetivo = status || STATUS_INICIAL[tipo]

  const salvar = (formData: FormData) => {
    setErro(null)
    formData.set('tipo', tipo)
    formData.set('prioridade', prioridade)
    formData.set('responsavel_id', responsavel)
    formData.set('evento_id', evento)
    formData.set('origem_lead', origem)
    formData.set('status', statusEfetivo)

    startTransition(async () => {
      const r = editando
        ? await editarItemBacklog(item!.id, formData)
        : await criarItemBacklog(formData)
      if (!r.ok) { setErro(r.erro); return }
      onFechar()
      router.refresh()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => !pendente && onFechar()}>
      <div className="overlay-fade-in absolute inset-0 bg-black/45" />
      <div
        className="modal-pop-in relative bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-slate-800 font-bold flex items-center gap-2">
            {tipo === 'cliente'
              ? <Building2 className="w-4 h-4 text-brand-500" />
              : <CheckSquare className="w-4 h-4 text-brand-500" />}
            {editando ? 'Editar item' : 'Adicionar ao Backlog'}
          </h2>
          <button onClick={onFechar} disabled={pendente} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form action={salvar} className="p-6 space-y-4">
          <Campo rotulo="Tipo *">
            <div className="grid grid-cols-2 gap-2">
              {TIPOS.map(t => (
                <button
                  key={t.valor}
                  type="button"
                  onClick={() => { setTipo(t.valor); setStatus('') }}
                  className={`text-left rounded-xl border px-3.5 py-2.5 transition-colors ${
                    tipo === t.valor ? 'border-brand-300 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <span className={`block text-sm font-semibold ${tipo === t.valor ? 'text-brand-700' : 'text-slate-700'}`}>{t.rotulo}</span>
                  <span className="block text-slate-500 text-xs mt-0.5">{t.descricao}</span>
                </button>
              ))}
            </div>
          </Campo>

          <Campo rotulo={tipo === 'cliente' ? 'Nome da empresa ou cliente *' : 'Título da tarefa *'}>
            <input
              name="titulo" required defaultValue={item?.titulo ?? ''} className="input" autoFocus
              placeholder={tipo === 'cliente' ? 'Ex.: Produtora XYZ' : 'Ex.: Enviar proposta para a Produtora XYZ'}
            />
          </Campo>

          <div className="grid sm:grid-cols-2 gap-3">
            <Campo rotulo="Status">
              <SeletorLista
                valor={statusEfetivo}
                onChange={setStatus}
                titulo="Status do item"
                opcoes={COLUNAS[tipo].map(c => ({ valor: c.valor, rotulo: c.rotulo }))}
              />
            </Campo>
            <Campo rotulo="Prioridade">
              <SeletorLista
                valor={prioridade}
                onChange={v => setPrioridade(v as typeof prioridade)}
                titulo="Prioridade"
                opcoes={PRIORIDADES.map(p => ({ valor: p.valor, rotulo: p.rotulo }))}
              />
            </Campo>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <Campo rotulo="Responsável">
              <SeletorLista
                valor={responsavel}
                onChange={setResponsavel}
                placeholder="Ninguém ainda"
                titulo="Quem cuida disto"
                busca={opcoes.responsaveis.length > 8}
                opcoes={[{ valor: '', rotulo: 'Ninguém ainda' }, ...opcoes.responsaveis.map(r => ({ valor: r.id, rotulo: r.nome }))]}
              />
            </Campo>
            <Campo rotulo="Evento relacionado">
              <SeletorLista
                valor={evento}
                onChange={setEvento}
                placeholder="Nenhum"
                titulo="Evento já cadastrado"
                busca
                opcoes={[{ valor: '', rotulo: 'Nenhum' }, ...opcoes.eventos.map(e => ({ valor: e.id, rotulo: e.nome }))]}
              />
            </Campo>
          </div>

          {tipo === 'cliente' ? (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <Campo rotulo="Nome do contato">
                  <input name="contato_nome" defaultValue={item?.contatoNome ?? ''} placeholder="Com quem a gente fala" className="input" />
                </Campo>
                <Campo rotulo="WhatsApp">
                  <input name="whatsapp" defaultValue={item?.whatsapp ?? ''} placeholder="(00) 00000-0000" className="input" />
                </Campo>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Campo rotulo="E-mail">
                  <input name="email" type="email" defaultValue={item?.email ?? ''} placeholder="contato@empresa.com" className="input" />
                </Campo>
                <Campo rotulo="Origem do lead">
                  <SeletorLista
                    valor={origem}
                    onChange={setOrigem}
                    placeholder="De onde veio"
                    titulo="Origem do lead"
                    opcoes={[{ valor: '', rotulo: 'Não informado' }, ...ORIGENS_LEAD.map(o => ({ valor: o, rotulo: o }))]}
                  />
                </Campo>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Campo rotulo="Evento previsto">
                  <input
                    name="evento_previsto_nome" defaultValue={item?.eventoPrevistoNome ?? ''}
                    placeholder="Ex.: Festival XYZ 2027" className="input"
                  />
                </Campo>
                <Campo rotulo="Data prevista do evento">
                  <DateTimePicker modo="data" name="data_evento_prevista" defaultValue={item?.dataEventoPrevista ?? ''} />
                </Campo>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <Campo rotulo="Quantidade estimada de pessoas">
                  <input
                    name="quantidade_estimada" type="number" min="0" step="1"
                    defaultValue={item?.quantidadeEstimada ?? ''} placeholder="Ex.: 1500" className="input tabular-nums"
                  />
                </Campo>
                <Campo rotulo="Data do próximo contato">
                  <DateTimePicker modo="data" name="proximo_contato_data" defaultValue={item?.proximoContatoData ?? ''} />
                </Campo>
              </div>
              <Campo rotulo="Serviço / interesse">
                <input
                  name="servico_interesse" defaultValue={item?.servicoInteresse ?? ''}
                  placeholder="Ex.: credenciamento + controle de ponto" className="input"
                />
              </Campo>
            </>
          ) : (
            <>
              <Campo rotulo="Descrição">
                <textarea
                  name="descricao" rows={3} defaultValue={item?.descricao ?? ''}
                  placeholder="O que precisa ser feito" className="input resize-none"
                />
              </Campo>
              <Campo rotulo="Prazo">
                <DateTimePicker modo="data" name="prazo" defaultValue={item?.prazo ?? ''} />
              </Campo>
            </>
          )}

          <Campo rotulo="Observações">
            <textarea
              name="observacoes" rows={2} defaultValue={item?.observacoes ?? ''}
              placeholder="Qualquer coisa que ajude quem for pegar isto" className="input resize-none"
            />
          </Campo>

          {erro && (
            <p className="flex items-start gap-1.5 text-red-600 text-xs">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={pendente} className="btn btn-primario disabled:opacity-50">
              <Save className="w-3.5 h-3.5 shrink-0" /> {pendente ? 'Salvando…' : editando ? 'Salvar' : 'Adicionar'}
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

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{rotulo}</label>
      {children}
    </div>
  )
}
