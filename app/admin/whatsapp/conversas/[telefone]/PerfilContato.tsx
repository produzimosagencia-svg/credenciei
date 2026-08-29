import Link from 'next/link'
import { BriefcaseBusiness, Building2, CalendarDays, CheckCircle2, CircleUserRound, MapPin, Phone, UserRoundX } from 'lucide-react'
import type { PerfilConversa } from '@/lib/whatsapp-painel'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'

export default function PerfilContato({ perfil, nomeWhatsApp }: { perfil: PerfilConversa; nomeWhatsApp?: string | null }) {
  const nome = perfil.nome || nomeWhatsApp || perfil.telefone
  const iniciais = nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

  return (
    <aside className="min-h-[650px] border-l border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-5 py-5 text-center">
        <span className="mx-auto flex w-16 h-16 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-600">
          {iniciais || <CircleUserRound className="w-8 h-8" />}
        </span>
        <h2 className="mt-3 font-semibold text-slate-900">{nome}</h2>
        <p className="mt-0.5 text-xs text-slate-500">{perfil.telefone}</p>
        {perfil.cadastrado ? (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-2xs font-semibold text-green-700">
            <CheckCircle2 className="w-3 h-3" /> Pessoa cadastrada
          </span>
        ) : (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-2xs font-semibold text-slate-600">
            <UserRoundX className="w-3 h-3" /> Sem cadastro na plataforma
          </span>
        )}
      </div>

      {perfil.cadastrado ? (
        <div className="max-h-[540px] overflow-y-auto">
          <section className="border-b border-slate-200 px-4 py-4">
            <h3 className="text-2xs font-semibold uppercase tracking-wide text-slate-400">Dados do cadastro</h3>
            <dl className="mt-3 space-y-3">
              <Dado rotulo="CPF" valor={perfil.cpf ? formatCpf(perfil.cpf) : null} />
              <Dado rotulo="Telefone" valor={perfil.telefone} icone={<Phone className="w-3.5 h-3.5" />} />
              <Dado rotulo="E-mail" valor={perfil.email} />
              <Dado rotulo="Cidade" valor={perfil.cidade} icone={<MapPin className="w-3.5 h-3.5" />} />
              <Dado rotulo="Empresa" valor={perfil.empresa} icone={<Building2 className="w-3.5 h-3.5" />} />
              <Dado rotulo="Função" valor={perfil.cargo} icone={<BriefcaseBusiness className="w-3.5 h-3.5" />} />
              <Dado rotulo="Chave PIX" valor={perfil.chavePix} />
              <Dado rotulo="Situação" valor={perfil.ativo === false ? 'Inativa' : 'Ativa'} />
              <Dado rotulo="Cadastro atualizado" valor={perfil.cadastradoEm ? formatarBR(perfil.cadastradoEm, 'completo') : null} />
            </dl>
          </section>

          <section className="px-4 py-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-2xs font-semibold uppercase tracking-wide text-slate-400">Registros de eventos</h3>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-2xs font-semibold text-slate-600">{perfil.eventos.length}</span>
            </div>
            {!perfil.eventos.length ? (
              <p className="mt-3 text-xs text-slate-500">Nenhum evento associado.</p>
            ) : (
              <div className="mt-3 space-y-3">
                {perfil.eventos.map(evento => (
                  <article key={evento.funcionarioId} className="rounded-xl border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold text-slate-800">{evento.evento}</p>
                        <p className="mt-0.5 truncate text-2xs text-slate-500">{evento.setor}{evento.cargo ? ` · ${evento.cargo}` : ''}</p>
                      </div>
                      <CalendarDays className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                    </div>
                    <p className="mt-2 text-2xs text-slate-500">
                      {formatarBR(evento.inicio, 'data')}{evento.fim && formatarBR(evento.fim, 'data') !== formatarBR(evento.inicio, 'data') ? ` a ${formatarBR(evento.fim, 'data')}` : ''}
                    </p>
                    {evento.local && <p className="mt-1 truncate text-2xs text-slate-500">{evento.local}</p>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {evento.registros.length ? evento.registros.map((registro, i) => (
                        <span key={`${registro.tipo}-${registro.em}-${i}`} className="rounded-md bg-green-50 px-1.5 py-1 text-2xs font-medium text-green-700">
                          {rotuloRegistro(registro.tipo)} · {formatarBR(registro.em, 'hora')}
                        </span>
                      )) : (
                        <span className="text-2xs text-amber-700">Sem registro de presença</span>
                      )}
                    </div>
                    <Link href={`/admin/funcionarios/${evento.funcionarioId}/historico`} className="mt-2 inline-block text-2xs font-medium text-brand-600 hover:underline">
                      Ver histórico completo
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-slate-500">Este telefone conversou pelo WhatsApp, mas ainda não corresponde a nenhum cadastro de funcionário.</p>
        </div>
      )}
    </aside>
  )
}

function Dado({ rotulo, valor, icone }: { rotulo: string; valor: string | null; icone?: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1 text-2xs text-slate-400">{icone}{rotulo}</dt>
      <dd className="mt-0.5 break-words text-xs font-medium text-slate-700">{valor || 'Não informado'}</dd>
    </div>
  )
}

function rotuloRegistro(tipo: string) {
  if (tipo === 'entrada') return 'Entrada'
  if (tipo === 'meio') return 'Meio'
  if (tipo === 'fim' || tipo === 'saida') return 'Saída'
  return tipo
}
