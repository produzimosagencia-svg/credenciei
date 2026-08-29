import Link from 'next/link'
import { CheckCircle2, Clock3, Megaphone, Plus, TriangleAlert, Users } from 'lucide-react'
import type { DisparoResumo } from '@/lib/whatsapp-painel'
import { formatarBR } from '@/lib/tz'

function estado(d: DisparoResumo) {
  if (d.enviando || d.pendentes) return { texto: 'Em andamento', classe: 'bg-blue-50 text-blue-700' }
  if (d.falhos) return { texto: 'Concluído com falhas', classe: 'bg-amber-50 text-amber-700' }
  if (d.cancelados === d.total) return { texto: 'Cancelado', classe: 'bg-slate-100 text-slate-600' }
  return { texto: 'Concluído', classe: 'bg-green-50 text-green-700' }
}

function categoria(categoria: DisparoResumo['categoria']) {
  if (categoria === 'AUTHENTICATION') return { texto: 'Autenticação', classe: 'bg-violet-50 text-violet-700' }
  if (categoria === 'MARKETING') return { texto: 'Marketing', classe: 'bg-pink-50 text-pink-700' }
  return { texto: 'Utilidade', classe: 'bg-blue-50 text-blue-700' }
}

export default function PainelDisparos({ disparos }: { disparos: DisparoResumo[] }) {
  const emAndamento = disparos.filter(d => d.pendentes || d.enviando).length
  const enviados = disparos.reduce((soma, d) => soma + d.enviados, 0)
  const falhos = disparos.reduce((soma, d) => soma + d.falhos, 0)

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Resumo icone={<Clock3 className="w-4 h-4" />} rotulo="Em andamento" valor={emAndamento} />
        <Resumo icone={<CheckCircle2 className="w-4 h-4" />} rotulo="Mensagens enviadas" valor={enviados} />
        <Resumo icone={<TriangleAlert className="w-4 h-4" />} rotulo="Falhas" valor={falhos} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3.5">
          <div>
            <h2 className="font-semibold text-slate-800">Todos os disparos</h2>
            <p className="text-xs text-slate-500">Campanhas, cadastros, autenticações, avisos e mensagens automáticas.</p>
          </div>
          <Link href="/admin/whatsapp/disparo" className="btn btn-primario btn-sm">
            <Plus className="w-3.5 h-3.5" /> Novo disparo
          </Link>
        </div>
        {!disparos.length ? (
          <div className="px-6 py-16 text-center">
            <Megaphone className="mx-auto w-8 h-8 text-slate-300" />
            <p className="mt-3 text-sm font-medium text-slate-700">Nenhum disparo registrado</p>
            <p className="mt-1 text-sm text-slate-500">Os próximos envios do canal aparecerão aqui.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {disparos.map(d => {
              const status = estado(d)
              const categoriaMeta = categoria(d.categoria)
              const processadas = d.enviados + d.falhos + d.cancelados
              const percentual = d.total ? Math.round((processadas / d.total) * 100) : 0
              return (
                <article key={d.id} className="p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold text-slate-800">{d.titulo}</h3>
                        <span className={`rounded-full px-2 py-1 text-2xs font-semibold ${status.classe}`}>{status.texto}</span>
                        <span className={`rounded-full px-2 py-1 text-2xs font-semibold ${categoriaMeta.classe}`}>{categoriaMeta.texto}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {d.template} · {d.evento} · {d.origem === 'csv' ? 'Arquivo CSV' : d.origem === 'equipe' ? 'Equipe do evento' : d.origem === 'socios' ? 'Sócios para teste' : d.origem === 'automatico' ? 'Fluxo automático' : 'Origem não identificada'}
                      </p>
                      {d.telefone && <p className="mt-1 font-mono text-2xs text-slate-400">Para {d.telefone}</p>}
                    </div>
                    <time className="shrink-0 text-2xs tabular-nums text-slate-400">{formatarBR(d.criadoEm, 'completo')}</time>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${percentual}%` }} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" /> {d.total} destinatários</span>
                    <span>{d.enviados} enviados</span>
                    {(d.pendentes + d.enviando) > 0 && <span>{d.pendentes + d.enviando} na fila</span>}
                    {d.falhos > 0 && <span className="text-amber-700">{d.falhos} falharam</span>}
                    {d.enviados > 0 && <span>Custo aprox. {d.custoEstimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>}
                    <span className="ml-auto font-medium text-slate-600">{percentual}%</span>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function Resumo({ icone, rotulo, valor }: { icone: React.ReactNode; rotulo: string; valor: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-slate-500">{icone}<span className="text-xs">{rotulo}</span></div>
      <p className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{valor}</p>
    </div>
  )
}
