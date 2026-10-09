'use client'
import { useState, useTransition } from 'react'
import { AlertCircle, CalendarDays, Check, X } from 'lucide-react'
import { aprovarCredenciamento, negarCredenciamento, ajustarEscalaDoFuncionario } from '@/lib/actions'
import { formatarBR } from '@/lib/tz'
import { listarDias } from '@/lib/escala-regras'
import type { DetalheCredenciamento } from '@/lib/escala'
import SeletorDiasEscala, { LegendaFases } from '@/components/SeletorDiasEscala'

/**
 * Os dias de trabalho de uma pessoa + a decisão do supervisor, num bloco só —
 * o miolo do modal que abre pelo NOME em "Aguardando aprovação" e na equipe
 * do fornecedor (pedido do Juan, 06/10/2026).
 *
 * A grade já abre marcada com o que vale hoje (aprovado) ou, na primeira
 * decisão, com o que a pessoa pediu: o caso comum é confirmar como veio, e o
 * supervisor só acrescenta ou tira um dia. O ponto em cada chip (ver
 * `SeletorDiasEscala`) mostra o que foi PEDIDO, para a diferença ficar à vista.
 *
 *   pendente → Aprovar com estes dias / Negar
 *   aprovado → Salvar dias (só quando mudou alguma coisa)
 *   negado   → só leitura
 *
 * O QR passa a respeitar os dias salvos na leitura seguinte — sem mensagem
 * nova: a credencial mostra os dias sozinha (pedido do Juan, 06/10/2026).
 */
export default function AprovacaoComDias({
  funcionarioId, fornecedorId, eventoId, detalhe, onConcluido,
}: {
  funcionarioId: string
  fornecedorId: string
  eventoId: string
  detalhe: DetalheCredenciamento
  /** Depois de aprovar, negar ou salvar — quem chama recarrega/fecha. */
  onConcluido: () => void
}) {
  const pedidos = (detalhe.escala?.dias ?? []).filter(d => d.selecionado).map(d => d.data)
  const aprovados = (detalhe.escala?.dias ?? []).filter(d => d.aprovado).map(d => d.data)
  const escalaAprovada = detalhe.escala?.status === 'aprovada'

  const [marcados, setMarcados] = useState<string[]>(() => (escalaAprovada ? aprovados : pedidos))
  const [negando, setNegando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const alternar = (dia: string) =>
    setMarcados(atual => atual.includes(dia) ? atual.filter(d => d !== dia) : [...atual, dia].sort())

  const executar = (acao: () => Promise<{ ok?: boolean; error?: string }>) => {
    setErro(null)
    startTransition(async () => {
      try {
        const r = await acao()
        if (!r.ok) { setErro(r.error ?? 'Não foi possível salvar.'); return }
        onConcluido()
      } catch {
        setErro('Não consegui salvar — confira a internet e tente de novo.')
      }
    })
  }

  /*
   * SEMPRE exige pelo menos 1 dia quando o evento usa escala (pedido do Juan, 08/10/2026: "os dias precisa ser
   * algo obrigatório ... trava, manda mensagem de erro"). Antes, cadastro sem `escala.status` (planilha, ou
   * evento que ligou a escala depois) podia ser aprovado com ZERO dias marcados — "QR vale todo dia", o oposto
   * do que se quer agora. O mesmo vale pra `salvarDias`, que já recusava lista vazia.
   *
   * EXCETO supervisor (`detalhe.ehSupervisor`, pedido do Juan, 08/10/2026, depois de liberar manualmente os do
   * VITAL): sai aprovado para todos os dias sozinho — o servidor força isso (`aprovarCredenciamento`), a grade
   * nem aparece pra marcar nada.
   */
  const exigeDias = detalhe.usaEscala && !detalhe.ehSupervisor
  const aprovar = () => {
    if (exigeDias && !marcados.length) { setErro('Marque pelo menos um dia de trabalho.'); return }
    executar(async () => {
      const r = await aprovarCredenciamento(funcionarioId, fornecedorId, eventoId, exigeDias ? marcados : undefined)
      // Cadastro anterior ao recurso (sem dias escolhidos): se o supervisor
      // marcou dias, eles passam a valer a partir daqui.
      if (r.ok && detalhe.usaEscala && !detalhe.ehSupervisor && !detalhe.escala?.status && marcados.length) {
        return ajustarEscalaDoFuncionario(funcionarioId, fornecedorId, eventoId, marcados)
      }
      return r
    })
  }
  const negar = () => executar(() => negarCredenciamento(funcionarioId, fornecedorId, eventoId, motivo))
  const salvarDias = () => {
    if (!marcados.length) { setErro('Marque pelo menos um dia. Para tirar a pessoa do evento, use Desativar ou Descredenciar.'); return }
    executar(() => ajustarEscalaDoFuncionario(funcionarioId, fornecedorId, eventoId, marcados, motivo))
  }

  const mudou = escalaAprovada
    ? marcados.join() !== [...aprovados].sort().join()
    : marcados.length > 0
  const naoPedidos = marcados.filter(d => !pedidos.includes(d))
  const recusados = pedidos.filter(d => !marcados.includes(d))

  return (
    <div className="space-y-4">
      {detalhe.usaEscala && (
        <div className="space-y-2.5">
          <p className="flex items-center gap-1.5 text-slate-400 text-xs font-semibold uppercase tracking-wide">
            <CalendarDays className="w-3.5 h-3.5" /> Dias de trabalho
          </p>

          {detalhe.ehSupervisor ? (
            <p className="text-emerald-700 text-xs">
              Supervisor — liberado automaticamente para todos os dias do evento ({listarDias(detalhe.diasDoEvento.map(d => d.data))}).
            </p>
          ) : escalaAprovada ? (
            <div className="text-xs space-y-0.5">
              <p className="text-green-700 font-semibold">QR válido em: {listarDias(aprovados)}</p>
              {detalhe.escala?.decididaPor && (
                <p className="text-slate-400">
                  Aprovado por {detalhe.escala.decididaPor}
                  {detalhe.escala.decididaEm ? ` em ${formatarBR(detalhe.escala.decididaEm, 'curto')}` : ''}
                </p>
              )}
            </div>
          ) : pedidos.length ? (
            <p className="text-amber-700 text-xs">
              Pediu para trabalhar em <strong>{listarDias(pedidos)}</strong>. Confirme, acrescente ou tire dias antes de aprovar.
            </p>
          ) : (
            <p className="text-amber-700 text-xs">
              Nenhum dia escolhido ainda — marque pelo menos um antes de aprovar ou salvar.
            </p>
          )}

          {!detalhe.ehSupervisor && (
            <>
              <SeletorDiasEscala
                dias={detalhe.diasDoEvento} marcados={marcados} onAlternar={alternar}
                pedidos={pedidos} lotados={detalhe.lotados} desabilitado={isPending || detalhe.status === 'negado'}
              />
              <LegendaFases comPedido={pedidos.length > 0} />

              {(recusados.length > 0 || naoPedidos.length > 0) && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-600 space-y-0.5">
                  {recusados.length > 0 && <p>Pedidos que <strong>não</strong> vão valer: {listarDias(recusados)}</p>}
                  {naoPedidos.length > 0 && <p>Acrescentados pelo supervisor: {listarDias(naoPedidos)}</p>}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {erro && (
        <p className="flex items-start gap-1.5 text-erro-600 text-xs">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}
        </p>
      )}

      {detalhe.status === 'pendente' && !negando && (
        <div className="flex flex-col sm:flex-row gap-2">
          <button type="button" onClick={aprovar} disabled={isPending} className="flex-1 btn btn-primario">
            <Check className="w-4 h-4 shrink-0" />
            {isPending ? 'Aprovando...' : detalhe.usaEscala && marcados.length ? 'Aprovar com estes dias' : 'Aprovar'}
          </button>
          <button type="button" onClick={() => setNegando(true)} disabled={isPending} className="btn btn-secundario text-red-600">
            <X className="w-4 h-4 shrink-0" /> Negar
          </button>
        </div>
      )}

      {detalhe.status === 'pendente' && negando && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 space-y-2.5">
          <p className="text-red-700 text-xs">A pessoa vai ser avisada de que o acesso não foi autorizado.</p>
          <textarea
            value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Motivo da negativa (opcional)" rows={2}
            className="input w-full text-sm resize-none"
          />
          <div className="flex gap-2">
            <button type="button" onClick={negar} disabled={isPending} className="btn btn-primario btn-sm">
              {isPending ? 'Negando...' : 'Negar credenciamento'}
            </button>
            <button type="button" onClick={() => setNegando(false)} disabled={isPending} className="btn btn-secundario btn-sm">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {detalhe.status === 'aprovado' && detalhe.usaEscala && !detalhe.ehSupervisor && mudou && (
        <div className="space-y-2">
          <input
            value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Motivo da alteração (opcional)"
            className="input w-full text-sm"
          />
          <button type="button" onClick={salvarDias} disabled={isPending} className="w-full btn btn-primario">
            <CalendarDays className="w-4 h-4 shrink-0" /> {isPending ? 'Salvando...' : 'Salvar dias de trabalho'}
          </button>
        </div>
      )}

      {detalhe.status === 'negado' && (
        <p className="text-slate-500 text-xs">
          Negado{detalhe.decididoPor ? ` por ${detalhe.decididoPor}` : ''}
          {detalhe.decididoEm ? ` em ${formatarBR(detalhe.decididoEm, 'curto')}` : ''}
          {detalhe.motivoNegacao ? ` — ${detalhe.motivoNegacao}` : ''}.
        </p>
      )}
    </div>
  )
}
