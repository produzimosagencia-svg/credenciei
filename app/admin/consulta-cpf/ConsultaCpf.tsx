'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Search, AlertTriangle, ExternalLink } from 'lucide-react'
import { consultarPorCpf } from '@/lib/actions-consulta-cpf'
import { ROTULO_COMO, type FichaDaConsulta, type BatidaDaConsulta } from '@/lib/consulta-cpf-regras'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { Secao, EmptyState } from '@/components/ui/Superficie'

const ROTULO_TIPO: Record<BatidaDaConsulta['tipo'], string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }
const ROTULO_STATUS_MSG: Record<string, string> = {
  na_fila: 'na fila', enviada: 'enviada', entregue: 'entregue', lida: 'lida', falhou: 'NÃO ENTREGUE', sem_mensagem: 'cancelada',
}
const diaCurto = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—')
const hora = (iso: string | null) => (iso ? formatarBR(iso, 'curto') : '—')

function Selo({ children, tom }: { children: React.ReactNode; tom: 'ok' | 'aviso' | 'erro' | 'neutro' }) {
  const cor = tom === 'ok' ? 'bg-green-50 text-green-700 border-green-200' : tom === 'aviso' ? 'bg-amber-50 text-amber-800 border-amber-300'
    : tom === 'erro' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-100 text-slate-600 border-slate-200'
  return <span className={`inline-block text-2xs font-bold px-2 py-0.5 rounded-full border ${cor}`}>{children}</span>
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-slate-400 text-2xs font-semibold uppercase tracking-wide">{rotulo}</p>
      <div className="text-slate-800 text-sm break-words">{children}</div>
    </div>
  )
}

function Bloco({ titulo, quantidade, aberto = false, children }: { titulo: string; quantidade: number; aberto?: boolean; children: React.ReactNode }) {
  return (
    <details open={aberto && quantidade > 0} className="group border-t border-slate-100 pt-3">
      <summary className="cursor-pointer list-none flex items-center justify-between text-sm font-semibold text-slate-700">
        <span>{titulo} <span className="text-slate-400 font-medium">({quantidade})</span></span>
        <span className="text-slate-400 text-xs group-open:hidden">mostrar</span>
        <span className="text-slate-400 text-xs hidden group-open:inline">ocultar</span>
      </summary>
      <div className="mt-2">
        {quantidade === 0 ? <p className="text-slate-400 text-xs">Nada registrado.</p> : children}
      </div>
    </details>
  )
}

function CartaoDaFicha({ f }: { f: FichaDaConsulta }) {
  const r = f.resumo
  return (
    <Secao
      titulo={`${f.evento.nome} · ${f.fornecedor.nome}`}
      descricao={f.fornecedor.area ? `Área ${f.fornecedor.area}` : undefined}
      acoes={
        <Link href={`/admin/eventos/${f.evento.id}/fornecedor/${f.fornecedor.id}`} className="btn btn-secundario btn-sm">
          <ExternalLink className="w-3.5 h-3.5" /> Abrir equipe
        </Link>
      }
      corpoClassName="p-5 space-y-4"
    >
      <div className="flex flex-wrap gap-1.5">
        {f.situacao === 'aprovado' ? <Selo tom="ok">Aprovado</Selo> : f.situacao === 'pendente' ? <Selo tom="aviso">Aguardando aprovação</Selo> : <Selo tom="erro">Negado</Selo>}
        {f.baixaEm && <Selo tom="erro">Baixa em {formatarBR(f.baixaEm, 'data')}</Selo>}
        {!f.ativo && <Selo tom="aviso">Não ativado</Selo>}
        {!f.telefoneValido && <Selo tom="aviso">Sem telefone válido</Selo>}
        {!f.evento.ativo && <Selo tom="neutro">Evento encerrado</Selo>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
        <Dado rotulo="Nome">{f.nome}</Dado>
        <Dado rotulo="CPF"><span className="tabular-nums">{formatCpf(f.cpf)}</span></Dado>
        <Dado rotulo="Telefone"><span className="tabular-nums">{f.telefone || '—'}</span></Dado>
        <Dado rotulo="Cargo">{f.cargo || '—'}</Dado>
        <Dado rotulo="Cadastrada em">{hora(f.criadaEm)}</Dado>
        <Dado rotulo="Origem do cadastro">{f.origem || '—'}</Dado>
        <Dado rotulo="Evento">{f.evento.dataInicio ? formatarBR(f.evento.dataInicio, 'data') : '—'}</Dado>
        <Dado rotulo="Código da ficha"><span className="text-2xs text-slate-500 select-all">{f.id}</span></Dado>
      </div>

      {/* O resumo diz de relance se há algo estranho nas batidas. */}
      <div className="flex flex-wrap gap-1.5">
        <Selo tom="neutro">{r.total} batida{r.total === 1 ? '' : 's'} em {r.dias} dia{r.dias === 1 ? '' : 's'}</Selo>
        {r.aMao > 0 && <Selo tom="aviso">{r.aMao} lançada{r.aMao === 1 ? '' : 's'} por operador ou à mão</Selo>}
        {r.semSaida > 0 && <Selo tom="erro">{r.semSaida} dia{r.semSaida === 1 ? '' : 's'} sem saída</Selo>}
        {r.saidaAntesDaEntrada > 0 && <Selo tom="erro">{r.saidaAntesDaEntrada} saída antes da entrada</Selo>}
        {r.total === 0 && <Selo tom="erro">nenhuma batida</Selo>}
      </div>

      <Bloco titulo="Batidas" quantidade={f.batidas.length} aberto>
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-left text-slate-400 text-2xs uppercase tracking-wide">
                <th className="px-1 py-1.5 font-semibold">Dia</th>
                <th className="px-1 py-1.5 font-semibold">Etapa</th>
                <th className="px-1 py-1.5 font-semibold">Quando</th>
                <th className="px-1 py-1.5 font-semibold">Como e quem lançou</th>
                <th className="px-1 py-1.5 font-semibold">Observações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {f.batidas.map(b => (
                <tr key={b.id}>
                  <td className="px-1 py-1.5 tabular-nums text-slate-700">{diaCurto(b.dataRef)}</td>
                  <td className="px-1 py-1.5 font-semibold text-slate-800">{ROTULO_TIPO[b.tipo]}</td>
                  <td className="px-1 py-1.5 tabular-nums text-slate-700">{hora(b.quandoISO)}</td>
                  <td className="px-1 py-1.5 text-slate-700">
                    {ROTULO_COMO[b.como]}
                    {b.porNome && <span className="block text-slate-500">{b.porNome}{b.porPapel ? ` (${b.porPapel})` : ''}</span>}
                    {b.como !== 'leitor' && !b.foto && <span className="block text-slate-400">sem foto</span>}
                  </td>
                  <td className="px-1 py-1.5 text-slate-600">
                    <div className="flex flex-wrap gap-1">
                      {b.alertas.map(a => <Selo key={a} tom="aviso">{a}</Selo>)}
                      {b.semInternet && <Selo tom="aviso">feita sem internet</Selo>}
                      {b.foraDoLocal === true && <Selo tom="erro">fora do local</Selo>}
                    </div>
                    {b.justificativa && <p className="mt-0.5 text-slate-500">{b.justificativa}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloco>

      <Bloco titulo="Pausas (saiu e voltou no mesmo dia)" quantidade={f.pausas.length}>
        <ul className="space-y-1 text-xs text-slate-700">
          {f.pausas.map((p, i) => (
            <li key={i}>Dia {diaCurto(p.dataRef)}: saiu {hora(p.saiuEm)}, voltou {hora(p.voltouEm)}{p.origem ? ` · ${p.origem}` : ''}{p.porNome ? ` · ${p.porNome}` : ''}</li>
          ))}
        </ul>
      </Bloco>

      <Bloco titulo="Batidas apagadas (guardadas)" quantidade={f.apagadas.length}>
        <ul className="space-y-1 text-xs text-slate-700">
          {f.apagadas.map((a, i) => (
            <li key={i}>{ROTULO_TIPO[a.tipo as BatidaDaConsulta['tipo']] ?? a.tipo} de {diaCurto(a.dataRef)} às {hora(a.quandoISO)} — apagada em {hora(a.apagadaEm)}{a.justificativa ? ` · ${a.justificativa}` : ''}</li>
          ))}
        </ul>
      </Bloco>

      <Bloco titulo="Histórico de alterações (auditoria)" quantidade={f.alteracoes.length}>
        <ul className="space-y-1.5 text-xs text-slate-700">
          {f.alteracoes.map((a, i) => (
            <li key={i}>
              <span className="tabular-nums text-slate-500">{hora(a.quando)}</span> · <span className="font-semibold">{a.acao}</span>
              {a.campo ? ` · ${a.campo}` : ''}{a.antes || a.depois ? ` (${a.antes ?? '—'} → ${a.depois ?? '—'})` : ''}
              {a.quem ? <span className="text-slate-500"> · por {a.quem}</span> : null}
              {a.motivo ? <span className="block text-slate-500">{a.motivo}</span> : null}
            </li>
          ))}
        </ul>
      </Bloco>

      <Bloco titulo="Mensagens de WhatsApp" quantidade={f.mensagens.length}>
        <ul className="space-y-1 text-xs text-slate-700">
          {f.mensagens.map((m, i) => (
            <li key={i}>
              <span className="tabular-nums text-slate-500">{hora(m.quando)}</span> · {m.tipo} · <span className={m.status === 'falhou' ? 'font-bold text-red-700' : 'font-semibold'}>{ROTULO_STATUS_MSG[m.status] ?? m.status}</span>
              {m.erro ? <span className="block text-slate-500">{m.erro}</span> : null}
            </li>
          ))}
        </ul>
      </Bloco>
    </Secao>
  )
}

export default function ConsultaCpf() {
  const [cpf, setCpf] = useState('')
  const [fichas, setFichas] = useState<FichaDaConsulta[] | null>(null)
  const [consultado, setConsultado] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [buscando, startBusca] = useTransition()

  const consultar = (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    startBusca(async () => {
      const r = await consultarPorCpf(cpf)
      if (!r.fichas) { setErro(r.error ?? 'Não foi possível consultar agora.'); setFichas(null); return }
      setFichas(r.fichas)
      setConsultado(r.cpf ?? '')
    })
  }

  return (
    <div className="space-y-5">
      <Secao tom="acento" icone={<Search className="w-3.5 h-3.5" />} titulo="CPF da pessoa" corpoClassName="p-5">
        <form onSubmit={consultar} className="flex flex-col sm:flex-row gap-2">
          <input
            required autoFocus inputMode="numeric" autoComplete="off" placeholder="000.000.000-00"
            value={cpf} onChange={e => { setCpf(formatCpf(e.target.value)); setErro(null) }}
            className="input flex-1 tabular-nums" aria-label="CPF"
          />
          <button type="submit" disabled={buscando} className="btn btn-primario shrink-0">{buscando ? 'Consultando…' : 'Consultar'}</button>
        </form>
        {erro && (
          <p className="mt-3 flex items-start gap-1.5 text-red-600 text-xs"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" /> {erro}</p>
        )}
      </Secao>

      {fichas && fichas.length === 0 && (
        <Secao>
          <EmptyState titulo="Nenhuma ficha com este CPF" descricao={`Não achei ${formatCpf(consultado)} em nenhum evento. Confira os números ou procure pelo nome em Base funcionário.`} />
        </Secao>
      )}

      {fichas && fichas.length > 0 && (
        <>
          <p className="text-slate-500 text-sm">
            <strong className="text-slate-800">{fichas.length} ficha{fichas.length === 1 ? '' : 's'}</strong> com o CPF {formatCpf(consultado)} — do evento mais recente para o mais antigo.
          </p>
          {fichas.map(f => <CartaoDaFicha key={f.id} f={f} />)}
        </>
      )}
    </div>
  )
}
