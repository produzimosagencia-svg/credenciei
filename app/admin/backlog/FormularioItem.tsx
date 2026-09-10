'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Save, AlertTriangle, Building2, CheckSquare, RefreshCw, Paperclip, FileText } from 'lucide-react'
import {
  criarItemBacklog, editarItemBacklog,
  anexosDoItem, anexarFotoBacklog, removerAnexoBacklog, type AnexoBacklog,
} from '@/lib/actions-backlog'
import { LogoLoading } from '@/components/LogoLoading'
import type { ItemBacklog } from '@/lib/backlog'
import {
  TIPOS, PRIORIDADES, ORIGENS_LEAD, COLUNAS, STATUS_INICIAL, type TipoItem,
} from '@/lib/backlog-constantes'
import { mensagemAmigavel } from '@/lib/erros'
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
  const [desatualizada, setDesatualizada] = useState(false)
  const [pendente, startTransition] = useTransition()

  const statusEfetivo = status || STATUS_INICIAL[tipo]

  // ── Fotos do item (como um card do Trello) ──────────────────────────────
  // Criação: seguram-se aqui e sobem depois que o item ganha id.
  // Edição: as que já existem carregam do servidor; novas sobem na hora.
  const [fotosNovas, setFotosNovas] = useState<File[]>([])
  const [anexos, setAnexos] = useState<AnexoBacklog[] | null>(editando ? null : [])
  const [subindoFotos, setSubindoFotos] = useState(false)
  const arquivoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editando && item) anexosDoItem(item.id).then(r => setAnexos(r.ok ? r.dados.anexos : []))
  }, [editando, item])

  const escolherFotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const novos = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!novos.length) return
    if (editando && item) {
      // Edição: sobe na hora, no item que já existe.
      setSubindoFotos(true)
      Promise.all(novos.map(f => {
        const fd = new FormData(); fd.set('arquivo', f)
        return anexarFotoBacklog(item.id, fd)
      })).then(rs => {
        const falhou = rs.find(r => !r.ok)
        if (falhou && !falhou.ok) setErro(falhou.erro)
        anexosDoItem(item.id).then(r => setAnexos(r.ok ? r.dados.anexos : []))
      }).finally(() => setSubindoFotos(false))
    } else {
      setFotosNovas(f => [...f, ...novos])
    }
  }

  const subirFotosPendentes = async (itemId: string) => {
    for (const f of fotosNovas) {
      const fd = new FormData(); fd.set('arquivo', f)
      await anexarFotoBacklog(itemId, fd)
    }
  }

  const salvar = (formData: FormData) => {
    setErro(null)
    formData.set('tipo', tipo)
    formData.set('prioridade', prioridade)
    formData.set('responsavel_id', responsavel)
    formData.set('evento_id', evento)
    formData.set('origem_lead', origem)
    formData.set('status', statusEfetivo)

    /*
     * O try/catch existe pra que uma falha AQUI não derrube a tela inteira.
     * Sem ele, uma rejeição dentro do `startTransition` sobe até o error
     * boundary da rota e o Backlog some, trocado por "Algo deu errado" — foi
     * o que o Juan viu ao tentar cadastrar (09/09/2026). As actions devolvem
     * erro em vez de lançar; o que sobra pro catch é a ida e a volta em si.
     */
    startTransition(async () => {
      try {
        const r = editando
          ? await editarItemBacklog(item!.id, formData)
          : await criarItemBacklog(formData)
        if (!r.ok) { setErro(r.erro); return }
        // Fotos escolhidas na criação sobem agora, no item recém-criado.
        const novoId = editando ? item!.id : ('id' in r ? r.id : undefined)
        if (!editando && novoId && fotosNovas.length) {
          setSubindoFotos(true)
          await subirFotosPendentes(novoId)
        }
        onFechar()
        router.refresh()
      } catch (e) {
        /*
         * Chegar aqui significa uma coisa só: a action NÃO RODOU.
         * `criarItemBacklog` embrulha o corpo inteiro num try/catch e sempre
         * devolve `{ ok, erro }` — ela não tem como lançar. O que sobra é a
         * ida e a volta: quase sempre a aba rodando o JavaScript de um deploy
         * anterior, chamando um id de Server Action que o servidor novo já não
         * conhece (Juan, 09/09/2026, testando enquanto subiam correções).
         *
         * Recarregar resolve — então em vez de escrever "aperte Ctrl+F5" e
         * deixar a pessoa se virar, o botão faz isso. `desatualizada` guarda o
         * texto digitado no aviso, porque recarregar perde o formulário e
         * ninguém quer redigitar sem saber por quê.
         */
        setErro(mensagemAmigavel(e))
        setDesatualizada(true)
      }
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
                placeholder="Interno"
                titulo="Evento relacionado"
                busca
                /*
                 * A opção vazia se chama INTERNO, não "Nenhum" (Juan,
                 * 09/09/2026) — e é a mesma palavra que o Financeiro usa pra
                 * despesa que não é de evento. "Nenhum" soa a campo que
                 * faltou preencher; "Interno" afirma o que a coisa é: tarefa
                 * da agência, não de um cliente. É o mesmo estado no banco
                 * (`evento_id` nulo), com o nome certo.
                 */
                opcoes={[
                  { valor: '', rotulo: 'Interno', detalhe: 'Da agência — não é de nenhum evento' },
                  ...opcoes.eventos.map(e => ({ valor: e.id, rotulo: e.nome })),
                ]}
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

          <Campo rotulo="Fotos">
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => arquivoRef.current?.click()}
                disabled={subindoFotos}
                className="btn btn-secundario btn-sm disabled:opacity-50"
              >
                {subindoFotos ? <LogoLoading tamanho={14} /> : <Paperclip className="w-3.5 h-3.5 shrink-0" />}
                {subindoFotos ? 'Enviando…' : 'Anexar foto'}
              </button>
              <input
                ref={arquivoRef}
                type="file"
                accept="image/*,application/pdf"
                multiple
                className="hidden"
                onChange={escolherFotos}
              />
              {!editando && !fotosNovas.length && (
                <p className="text-2xs text-slate-400">Print da conversa, proposta, logo do lead… entram junto quando você salvar.</p>
              )}

              {(anexos?.length || fotosNovas.length) ? (
                <div className="grid grid-cols-4 gap-2">
                  {(anexos ?? []).map(a => (
                    <div key={a.id} className="group relative rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
                      {a.ehImagem && a.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={a.url} alt={a.nome} className="h-16 w-full object-cover" />
                      ) : (
                        <div className="flex h-16 flex-col items-center justify-center p-1 text-center">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <span className="text-2xs text-slate-500 line-clamp-1 break-all">{a.nome}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removerAnexoBacklog(a.id).then(() => item && anexosDoItem(item.id).then(r => setAnexos(r.ok ? r.dados.anexos : [])))}
                        aria-label={`Remover ${a.nome}`}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md border border-slate-200 bg-white/90 text-slate-500 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {fotosNovas.map((f, i) => (
                    <div key={i} className="group relative rounded-lg border border-brand-200 overflow-hidden bg-brand-50">
                      {f.type.startsWith('image/') ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={URL.createObjectURL(f)} alt={f.name} className="h-16 w-full object-cover" />
                      ) : (
                        <div className="flex h-16 flex-col items-center justify-center p-1 text-center">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <span className="text-2xs text-slate-500 line-clamp-1 break-all">{f.name}</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => setFotosNovas(fs => fs.filter((_, j) => j !== i))}
                        aria-label={`Tirar ${f.name}`}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-md border border-slate-200 bg-white/90 text-slate-500 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </Campo>

          <Campo rotulo="Observações">
            <textarea
              name="observacoes" rows={2} defaultValue={item?.observacoes ?? ''}
              placeholder="Qualquer coisa que ajude quem for pegar isto" className="input resize-none"
            />
          </Campo>

          {erro && (
            <div className="space-y-2">
              <p className="flex items-start gap-1.5 text-red-600 text-xs">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
              </p>
              {desatualizada && (
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="btn btn-secundario btn-sm"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" /> Recarregar e tentar de novo
                </button>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={pendente || subindoFotos} className="btn btn-primario disabled:opacity-50">
              {(pendente || subindoFotos) ? <LogoLoading tamanho={14} /> : <Save className="w-3.5 h-3.5 shrink-0" />}
              {pendente ? 'Salvando…' : subindoFotos ? 'Enviando fotos…' : editando ? 'Salvar' : 'Adicionar'}
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
