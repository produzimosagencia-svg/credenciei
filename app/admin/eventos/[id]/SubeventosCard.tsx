'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Plus, X, Pencil, Trash2, ArrowRight, CalendarRange, Merge, AlertTriangle } from 'lucide-react'
import { criarSubevento, editarSubevento, excluirSubevento, mesclarSubeventos } from '@/lib/actions'
import { mesmoNome, nomesParecem } from '@/lib/estrutura-regras'
import ConfirmModal from '@/components/ConfirmModal'
import { EmptyState } from '@/components/ui/Superficie'
import ImportarEstrutura from './ImportarEstrutura'

type Subevento = { id: string; nome: string }
type Contagem = { fornecedores: number; equipe: number }

/**
 * Subeventos do evento mãe (Vital, 30/09/2026) — portões/categorias de
 * acesso do MESMO evento (Camarote, Arquibancada, Geral…). Vira a visão
 * PRINCIPAL da página do evento quando ele liga "Este evento possui
 * subeventos" (correção 30/09/2026: Evento → Subevento → Fornecedor —
 * fornecedor não nasce mais direto no evento nesse caso, só dentro de um
 * subevento). `contagens` só vem preenchido nesse modo; sem ele, mostra a
 * lista enxuta de sempre (compatibilidade com o uso anterior, se algum dia
 * precisar de novo).
 */
export default function SubeventosCard({
  eventoId, subeventos, contagens,
}: {
  eventoId: string
  subeventos: Subevento[]
  contagens?: Record<string, Contagem>
}) {
  if (!contagens) {
    // Modo lista enxuta (não usado na visão principal atual, mantido por
    // segurança caso o componente volte a ser embutido como seção pequena).
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3 mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-slate-800 font-bold text-sm">Subeventos</p>
            <p className="text-slate-500 text-xs mt-0.5">Portões/categorias de acesso deste evento</p>
          </div>
          <SubeventoModal mode="criar" eventoId={eventoId} />
        </div>
        {subeventos.length === 0 ? (
          <p className="text-slate-400 text-xs">Nenhum subevento ainda — crie o primeiro acima.</p>
        ) : (
          <ul className="divide-y divide-slate-100 -mb-1">
            {subeventos.map(s => (
              <li key={s.id} className="flex items-center justify-between py-1.5">
                <span className="text-slate-700 text-sm">{s.nome}</span>
                <div className="flex items-center gap-0.5">
                  <SubeventoModal mode="editar" eventoId={eventoId} subeventoId={s.id} nome={s.nome} />
                  <ExcluirSubeventoButton eventoId={eventoId} subeventoId={s.id} nome={s.nome} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/*
        * `relative z-10`: a aura laranja do cartão "ao vivo" logo abaixo é
        * um `box-shadow` (globals.css, @keyframes aura), que NÃO respeita
        * o `overflow:hidden` do próprio cartão — ele pinta por cima de
        * quem estiver depois dele na pilha de empilhamento, mais espaço ou
        * menos. Só mais `space-y` (tentativa anterior) reduzia o tingimento
        * sem eliminar; com stacking próprio o botão fica garantidamente
        * por cima, não importa a distância (reportado pelo Juan, 01/10/2026,
        * persistindo mesmo depois do espaçamento maior).
        */}
      <div className="relative z-10 flex flex-wrap items-center justify-end gap-2">
        {/* Monta fornecedores, travas e supervisores de todas as áreas de uma vez. */}
        <ImportarEstrutura eventoId={eventoId} />
        <SubeventoModal mode="criar" eventoId={eventoId} />
      </div>

      {subeventos.length === 0 ? (
        <EmptyState
          icone={<CalendarRange className="w-7 h-7" />}
          titulo="Nenhum subevento ainda"
          descricao="Crie o primeiro subevento (ex.: Camarote, Arquibancada, Pista) pra começar a escalar fornecedores."
        />
      ) : (
        /*
         * Mesmo cartão "ao vivo" da lista de eventos (app/admin/page.tsx,
         * `EventoAoVivo`) — pedido do Juan (30/09/2026): dentro de um evento
         * com subeventos, cada subevento usa o MESMO template visual do
         * painel de eventos. Reaproveita as classes globais `.evento-vivo`/
         * `.evento-vivo-selo`/`.ponto-vivo` (app/globals.css), não duplica CSS.
         */
        <div className={`grid gap-4 ${subeventos.length > 1 ? 'lg:grid-cols-2' : ''}`}>
          {subeventos.map(s => {
            const c = contagens[s.id] ?? { fornecedores: 0, equipe: 0 }
            // Áreas que provavelmente são a MESMA (nome escrito de outro jeito ou com erro de digitação).
            const duplicadaDe = subeventos.filter(o => o.id !== s.id && (mesmoNome(o.nome, s.nome) || nomesParecem(o.nome, s.nome)))
            return (
              <div key={s.id} className="evento-vivo flex flex-col">
                <span className="evento-vivo-selo">
                  <span className="ponto-vivo" aria-hidden="true" />
                  Ao vivo
                </span>
                <Link href={`/admin/eventos/${eventoId}/subevento/${s.id}`} className="block mt-2.5">
                  <h3 className="text-white text-[22px] md:text-[26px] leading-[1.1] hover:text-brand-300 transition-colors">
                    {s.nome}
                  </h3>
                </Link>

                {duplicadaDe.length > 0 && (
                  <p className="flex items-start gap-1.5 mt-2.5 text-amber-400 text-xs leading-snug">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
                    Parece a mesma área de {duplicadaDe.map(o => `“${o.nome}”`).join(' e ')} — use Mesclar para juntar.
                  </p>
                )}

                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 mt-4 text-[13px]">
                  <dt className="text-slate-500">Equipe</dt>
                  <dd className="text-slate-800 tabular-nums">
                    {c.fornecedores} fornecedor{c.fornecedores !== 1 ? 'es' : ''} · {c.equipe} funcionário{c.equipe !== 1 ? 's' : ''}
                  </dd>
                </dl>

                <div className="flex items-center gap-2 mt-5">
                  <Link href={`/admin/eventos/${eventoId}/subevento/${s.id}`} className="btn btn-primario flex-1 sm:flex-none sm:min-w-[170px] justify-start">
                    Abrir subevento
                    <ArrowRight className="w-3.5 h-3.5 ml-auto" />
                  </Link>
                  <div className="acoes-no-escuro shrink-0 flex items-center gap-0.5 justify-center rounded-[10px] bg-white/[.06] border border-white/[.12] px-1">
                    <SubeventoModal mode="editar" eventoId={eventoId} subeventoId={s.id} nome={s.nome} />
                    {subeventos.length > 1 && (
                      <MesclarSubeventoButton
                        eventoId={eventoId} origem={s} contagem={c}
                        candidatas={subeventos.filter(o => o.id !== s.id)}
                        sugeridaId={duplicadaDe[0]?.id}
                      />
                    )}
                    <ExcluirSubeventoButton eventoId={eventoId} subeventoId={s.id} nome={s.nome} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SubeventoModal(
  props: { mode: 'criar'; eventoId: string } | { mode: 'editar'; eventoId: string; subeventoId: string; nome: string },
) {
  const [open, setOpen] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const isEditar = props.mode === 'editar'

  const handleAction = (formData: FormData) => {
    setErro(null)
    startTransition(async () => {
      const r = isEditar
        ? await editarSubevento(props.subeventoId, props.eventoId, formData)
        : await criarSubevento(props.eventoId, formData)
      if (r?.error) { setErro(r.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      {isEditar ? (
        <button
          onClick={() => setOpen(true)}
          className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
          title={`Editar ${props.nome}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button onClick={() => setOpen(true)} className="btn btn-primario btn-sm shrink-0">
          <Plus className="w-3.5 h-3.5 shrink-0" />
          <span className="hidden sm:inline">Novo subevento</span>
          <span className="sm:hidden">Novo</span>
        </button>
      )}
      {open && (
        <div className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setOpen(false)}>
          <div className="modal-pop-in bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm max-h-[85vh] overflow-y-auto shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-800 font-bold text-base">{isEditar ? 'Editar subevento' : 'Novo subevento'}</h3>
              <button onClick={() => setOpen(false)} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form action={handleAction} className="space-y-4">
              <div>
                <label className="text-sm font-medium text-slate-700 block mb-1.5">Nome *</label>
                <input name="nome" required defaultValue={isEditar ? props.nome : ''} placeholder="Ex: Camarote Navista" className="input" />
              </div>
              {erro && <p className="text-red-500 text-xs">{erro}</p>}
              <button type="submit" disabled={isPending} className="btn btn-primario w-full">
                {isPending ? 'Salvando...' : (isEditar ? 'Salvar alterações' : 'Criar subevento')}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function ExcluirSubeventoButton({ eventoId, subeventoId, nome }: { eventoId: string; subeventoId: string; nome: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const confirmar = () => {
    setErro(null)
    startTransition(async () => {
      const r = await excluirSubevento(subeventoId, eventoId)
      if (r?.error) { setConfirmOpen(false); setErro(r.error); return }
      setConfirmOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        disabled={isPending}
        className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-erro-600 hover:bg-erro-50 disabled:opacity-50"
        title={`Excluir ${nome}`}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
      <ConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmar}
        isPending={isPending}
        mensagem={`Excluir o subevento "${nome}"?`}
      />
      {erro && <p className="text-red-500 text-2xs mt-1">{erro}</p>}
    </>
  )
}

/**
 * "Mesclar": junta esta área em outra — os fornecedores e as pessoas passam pra
 * escolhida e esta, já vazia, é apagada. Pra desfazer áreas duplicadas
 * ("Camarote Na Vista" / "CAMAROTE NAVISTA"). Pede confirmação dizendo o que
 * vai se mover; não dá pra desfazer depois.
 */
function MesclarSubeventoButton({ eventoId, origem, contagem, candidatas, sugeridaId }: {
  eventoId: string
  origem: Subevento
  contagem: Contagem
  candidatas: Subevento[]
  /** A área que parece ser a mesma (pré-selecionada). */
  sugeridaId?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [destinoId, setDestinoId] = useState(sugeridaId ?? '')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  const mesclar = () => {
    setErro(null)
    startTransition(async () => {
      const r = await mesclarSubeventos(eventoId, origem.id, destinoId)
      if (!r.ok) { setErro(r.error); return }
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <>
      <button
        onClick={() => { setDestinoId(sugeridaId ?? ''); setErro(null); setAberto(true) }}
        className="btn-press w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50"
        title={`Mesclar ${origem.nome} em outra área`}
      >
        <Merge className="w-3.5 h-3.5" />
      </button>
      {aberto && (
        <div className="overlay-fade-in fixed inset-0 bg-black/45 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => !isPending && setAberto(false)}>
          <div className="modal-pop-in bg-white border border-slate-200 rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-slate-800 font-bold text-base">Mesclar subevento</h3>
              <button onClick={() => setAberto(false)} disabled={isPending} className="btn-press w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-600 text-sm">
              Juntar <strong>{origem.nome}</strong> em qual área? Os{' '}
              <strong>{contagem.fornecedores} fornecedor{contagem.fornecedores !== 1 ? 'es' : ''}</strong> e as{' '}
              <strong>{contagem.equipe} pessoa{contagem.equipe !== 1 ? 's' : ''}</strong> daqui passam para a área escolhida, e
              &quot;{origem.nome}&quot; é apagada.
            </p>
            <select value={destinoId} onChange={e => setDestinoId(e.target.value)} className="input w-full">
              <option value="">Escolha a área que fica…</option>
              {candidatas.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
            <p className="text-slate-400 text-xs">Não dá para desfazer. Fornecedores com o mesmo nome nas duas áreas continuam como setores separados.</p>
            {erro && <p className="text-red-500 text-xs">{erro}</p>}
            <div className="flex gap-2">
              <button onClick={mesclar} disabled={isPending || !destinoId} className="flex-1 btn btn-primario disabled:opacity-50">
                {isPending ? 'Mesclando…' : 'Mesclar'}
              </button>
              <button onClick={() => setAberto(false)} disabled={isPending} className="btn btn-secundario">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
