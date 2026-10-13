import type { Metadata } from 'next'
import { Clock, QrCode } from 'lucide-react'
import { disparoAoVivo, type SituacaoDoContato } from '@/lib/disparo-ao-vivo'
import { formatarBR } from '@/lib/tz'
import AoVivo from '../../[token]/AoVivo'
import LinkIndisponivel from '../../[token]/LinkIndisponivel'

export const dynamic = 'force-dynamic'

// Mostra o andamento de uma lista de contatos: buscador nenhum deve guardar esta página.
export const metadata: Metadata = {
  title: 'Disparo ao vivo',
  robots: { index: false, follow: false },
}

const ROTULO: Record<SituacaoDoContato, string> = {
  fila: 'Na fila', enviada: 'Enviada', entregue: 'Entregue', lida: 'Lida', recusada: 'Recusada', cancelada: 'Cancelada',
}
const COR: Record<SituacaoDoContato, string> = {
  fila: 'text-white/50', enviada: 'text-amber-300', entregue: 'text-sky-300', lida: 'text-emerald-300', recusada: 'text-rose-300', cancelada: 'text-white/50',
}
const SITUACAO_DO_MODELO: Record<string, string> = { APPROVED: 'Ativo', PAUSED: 'Pausado pela Meta', DISABLED: 'Desativado', PENDING: 'Em análise' }
const QUALIDADE: Record<string, string> = { GREEN: 'qualidade verde', YELLOW: 'qualidade amarela', RED: 'qualidade vermelha', UNKNOWN: 'ainda sem nota de qualidade' }

const n = (v: number) => v.toLocaleString('pt-BR')
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1).replace('.', ',')}%` : '0%')

function Indicador({ rotulo, valor, sub, alerta = false }: { rotulo: string; valor: string; sub: string; alerta?: boolean }) {
  return (
    <div className={`min-w-0 rounded-2xl p-4 ${alerta ? 'bg-rose-500/15 ring-1 ring-rose-400/40' : 'bg-white/[0.05]'}`}>
      <p className="text-2xs font-semibold uppercase tracking-wider text-white/50">{rotulo}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-white">{valor}</p>
      <p className="mt-1 text-xs text-white/55">{sub}</p>
    </div>
  )
}

/**
 * O andamento de um disparo avulso, para quem acompanha de fora do sistema.
 *
 * A página é do servidor e o `AoVivo` a recarrega sozinha a cada poucos
 * segundos; o cálculo é guardado por alguns segundos em `disparoAoVivo`, então
 * muita gente olhando ao mesmo tempo não multiplica as leituras do banco.
 */
export default async function DisparoAoVivoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const d = await disparoAoVivo(token)
  if (!d.valido) return <LinkIndisponivel motivo={d.motivo} />

  const fase = d.fila ? 'Enviando' : d.canceladas ? 'Interrompido' : 'Concluído'
  const modeloEmAlerta = !!d.modelo && (d.modelo.situacao !== 'APPROVED' || d.modelo.qualidade === 'RED')
  const base = d.total || 1
  const naoLidas = d.entregues - d.lidas

  return (
    <main className="min-h-dvh bg-[#0a0918] text-white">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 sm:px-6 sm:py-7">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="logo-marca flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><QrCode className="h-4 w-4 text-white" /></div>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight text-white sm:text-lg">{d.titulo}</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-2xs text-white/50">
                <Clock className="h-3 w-3 shrink-0" /> Atualizado às {formatarBR(d.atualizadoEm, 'hora')} · link válido até {formatarBR(d.expiraEm, 'curto')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white/[0.08] px-3 py-1 text-2xs font-semibold uppercase tracking-wider text-white/80">
              {fase}{d.previsaoDeTermino ? ` · termina por volta de ${formatarBR(d.previsaoDeTermino, 'hora')}` : ''}
            </span>
            <AoVivo intervaloMs={5000} />
          </div>
        </header>

        <section>
          <div className="flex h-3.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label="Andamento do envio">
            <span className="block h-full bg-emerald-400" style={{ width: `${(d.lidas / base) * 100}%` }} />
            <span className="block h-full bg-sky-400" style={{ width: `${(naoLidas / base) * 100}%` }} />
            <span className="block h-full bg-amber-300" style={{ width: `${(d.semConfirmacao / base) * 100}%` }} />
            <span className="block h-full bg-rose-400" style={{ width: `${(d.recusadas / base) * 100}%` }} />
          </div>
          <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/60">
            <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-400" />Lidas {n(d.lidas)}</span>
            <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-sky-400" />Entregues, não lidas {n(naoLidas)}</span>
            <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-300" />Aguardando confirmação {n(d.semConfirmacao)}</span>
            <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-400" />Recusadas {n(d.recusadas)}</span>
            <span><i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-white/20" />Na fila {n(d.fila)}{d.canceladas ? `, canceladas ${n(d.canceladas)}` : ''}</span>
          </p>
        </section>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Indicador rotulo="Enviadas" valor={n(d.enviadas)} sub={`${pct(d.enviadas, d.total)} de ${n(d.total)}`} />
          <Indicador rotulo="Na fila" valor={n(d.fila)} sub={d.fila ? `${n(d.ritmoPorMinuto)} por minuto agora` : 'fila vazia'} />
          <Indicador rotulo="Entregues" valor={n(d.entregues)} sub={`${pct(d.entregues, d.enviadas)} das enviadas`} />
          <Indicador rotulo="Lidas" valor={n(d.lidas)} sub={`${pct(d.lidas, d.entregues)} das entregues`} />
          <Indicador rotulo="Recusadas" valor={n(d.recusadas)} sub={`${pct(d.recusadas, d.enviadas)} das enviadas`} />
          <Indicador
            rotulo="Modelo na Meta"
            valor={d.modelo ? (SITUACAO_DO_MODELO[d.modelo.situacao] ?? d.modelo.situacao) : 'Sem leitura'}
            sub={d.modelo ? (QUALIDADE[d.modelo.qualidade] ?? '') : ''}
            alerta={modeloEmAlerta}
          />
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="min-w-0">
            <h2 className="mb-2 text-sm font-bold text-white">Andamento por horário</h2>
            <div className="overflow-x-auto rounded-2xl bg-white/[0.05]">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="text-2xs uppercase tracking-wider text-white/50">
                    <th className="px-4 pb-2 pt-3 text-left font-semibold">Bloco</th>
                    <th className="px-3 pb-2 pt-3 text-right font-semibold">Programadas</th>
                    <th className="px-3 pb-2 pt-3 text-right font-semibold">Enviadas</th>
                    <th className="px-3 pb-2 pt-3 text-right font-semibold">Entregues</th>
                    <th className="px-4 pb-2 pt-3 text-right font-semibold">Lidas</th>
                  </tr>
                </thead>
                <tbody>
                  {d.blocos.map(b => (
                    <tr key={b.inicio} className="border-t border-white/[0.07]">
                      <td className="whitespace-nowrap px-4 py-2 text-left text-white/85">{formatarBR(b.inicio, 'hora')}</td>
                      <td className="px-3 py-2 text-right text-white/70">{n(b.programadas)}</td>
                      <td className="px-3 py-2 text-right text-white">{n(b.enviadas)}</td>
                      <td className="px-3 py-2 text-right text-white">{n(b.entregues)}</td>
                      <td className="px-4 py-2 text-right text-white">{n(b.lidas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {d.motivos.length > 0 && (
              <>
                <h2 className="mb-2 mt-5 text-sm font-bold text-white">Motivos de recusa</h2>
                <ul className="rounded-2xl bg-white/[0.05] text-sm">
                  {d.motivos.map(m => (
                    <li key={m.motivo} className="flex items-center justify-between gap-3 border-t border-white/[0.07] px-4 py-2 first:border-t-0">
                      <span className="text-white/80">{m.motivo}</span>
                      <strong className="tabular-nums text-white">{n(m.total)}</strong>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <section className="min-w-0">
            <h2 className="mb-2 text-sm font-bold text-white">Últimos envios</h2>
            <div className="overflow-x-auto rounded-2xl bg-white/[0.05]">
              <table className="w-full text-sm tabular-nums">
                <tbody>
                  {d.ultimos.map((u, i) => (
                    <tr key={`${u.telefone}-${u.em}-${i}`} className="border-t border-white/[0.07] first:border-t-0">
                      <td className="whitespace-nowrap px-4 py-2 text-left text-white/85">{u.telefone}</td>
                      <td className={`px-3 py-2 text-left font-semibold ${COR[u.situacao]}`}>
                        {ROTULO[u.situacao]}{u.motivo ? <span className="font-normal text-white/50"> · {u.motivo}</span> : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right text-white/60">{formatarBR(u.em, 'hora')}</td>
                    </tr>
                  ))}
                  {d.ultimos.length === 0 && (
                    <tr><td className="px-4 py-6 text-center text-white/50">Nenhuma mensagem saiu ainda.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-white/45">
              Os telefones aparecem mascarados para proteger os dados da lista. A leitura só é confirmada para quem mantém a confirmação de leitura ligada.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
