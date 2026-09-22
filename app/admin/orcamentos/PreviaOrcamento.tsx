import { brl, numeroOrcamento } from '@/lib/orcamentos-constantes'

/**
 * Espelho em HTML/Tailwind do PDF (lib/orcamentos-pdf.ts) — mesma ordem de
 * seções, mesma paleta, pra quem está preenchendo ver como o cliente vai
 * receber ANTES de gerar o arquivo definitivo.
 */
export default function PreviaOrcamento({
  numero, nomeEvento, responsavel, telefone, dataEvento,
  valorDia, valorFuncionario, valorTecnico, itens, observacoes, total,
}: {
  /** Ausente enquanto o orçamento ainda não foi salvo pela primeira vez. */
  numero?: number
  nomeEvento: string
  responsavel: string
  telefone: string
  dataEvento: string
  valorDia: number
  valorFuncionario: number
  valorTecnico: number
  itens: { descricao: string; valor: number }[]
  observacoes: string
  total: number
}) {
  const linhas = [
    { descricao: 'Valor do dia', valor: valorDia },
    { descricao: 'Valor por funcionário', valor: valorFuncionario },
    { descricao: 'Valor do técnico', valor: valorTecnico },
    ...itens.filter(i => i.descricao.trim() && i.valor > 0),
  ].filter(l => l.valor > 0)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm text-sm">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4 mb-5">
        <span className="text-lg font-extrabold text-slate-800">Credenciei</span>
        <div className="text-right">
          <p className="text-xl font-extrabold text-brand-600">ORÇAMENTO</p>
          <p className="text-slate-400 text-xs mt-0.5">
            {numero ? numeroOrcamento(numero) : 'rascunho'} · Emitido hoje
          </p>
        </div>
      </div>

      <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide mb-2">Dados do evento</p>
      <div className="space-y-1 mb-6">
        <Linha rotulo="Evento" valor={nomeEvento || '—'} />
        <Linha rotulo="Responsável" valor={responsavel || '—'} />
        <Linha rotulo="Telefone" valor={telefone || '—'} />
        <Linha rotulo="Data do evento" valor={dataEvento ? dataBR(dataEvento) : '—'} />
      </div>

      <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide mb-2">Investimento</p>
      <div className="border-t border-slate-100">
        {linhas.length === 0 && <p className="text-slate-400 py-3">Nenhum valor preenchido ainda.</p>}
        {linhas.map((l, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b border-slate-50">
            <span className="text-slate-700">{l.descricao}</span>
            <span className="tabular-nums font-medium text-slate-800">{brl(l.valor)}</span>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-xl bg-brand-50 px-5 py-4 flex items-center justify-between gap-3">
        <span className="font-bold text-slate-800 text-xs uppercase tracking-wide">Valor total do orçamento</span>
        <span className="text-xl font-extrabold text-brand-600 tabular-nums">{brl(total)}</span>
      </div>

      {observacoes.trim() && (
        <div className="mt-6">
          <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide mb-1.5">Observações</p>
          <p className="text-slate-600 whitespace-pre-wrap">{observacoes}</p>
        </div>
      )}

      <p className="mt-8 pt-4 border-t border-slate-100 text-slate-400 text-xs">
        <span className="text-brand-600 font-semibold">Credenciei</span> — Soluções profissionais para gestão e credenciamento de eventos.
      </p>
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-slate-400 text-xs">{rotulo}</span>
      <span className="text-slate-700 text-right">{valor}</span>
    </div>
  )
}

function dataBR(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : iso
}
