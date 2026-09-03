import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Truck, CalendarDays } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarEventos } from '@/lib/permissions'
import { formatCpf } from '@/lib/format'
import { formatarBR } from '@/lib/tz'
import { PageHeader, Secao, EmptyState } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'
import FormVeiculo from './FormVeiculo'
import AcoesVeiculo from './AcoesVeiculo'

export const revalidate = 0

/**
 * Veículos do evento — quem entra de caminhão/van, e com qual placa.
 *
 * Pede o evento primeiro, igual Avisos e Relatórios: a autorização é sempre
 * DE um evento (o condutor precisa estar credenciado nele, e os dias vêm da
 * jornada dele).
 *
 * SÓ CADASTRO E CONSULTA, por decisão: o veículo não bate ponto, não tem QR
 * e não passa pelo scanner — a portaria consulta a placa aqui e confere. Ver
 * supabase/upgrade-veiculos.sql.
 */
export default async function VeiculosPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarEventos(perfil.role)) redirect('/admin')

  const { evento: eventoParam } = await searchParams

  if (!eventoParam) {
    return (
      <div className="space-y-5">
        <PageHeader
          titulo="Cadastrar veículo"
          descricao="Escolha o evento para autorizar a entrada de um veículo"
        />
        <EscolherEvento
          eventos={await eventosQuePossoAbrir()}
          href={id => `/admin/veiculos?evento=${id}`}
          icone={<Truck className="w-3.5 h-3.5" />}
          titulo="Para qual evento?"
          descricao="O condutor precisa estar credenciado no evento escolhido"
          vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para cadastrar veículos.' }}
          mostrarOrganizacao={veTodosEventos(perfil.role)}
        />
      </div>
    )
  }

  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoParam).single()
  if (!evento) notFound()
  if (!veTodosEventos(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) notFound()

  const [{ data: dias }, { data: veiculos }] = await Promise.all([
    supabase.from('jornada_dias').select('data, tipo')
      .eq('evento_id', eventoParam).eq('cancelado', false).order('data'),
    supabase.from('veiculos')
      .select('id, placa, modelo, cor, tipo, empresa, observacoes, created_at, funcionarios(nome, cpf), veiculo_dias(data)')
      .eq('evento_id', eventoParam).order('created_at', { ascending: false }),
  ])

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Cadastrar veículo"
        descricao={`${evento.nome} — veículos autorizados a entrar`}
        acoes={
          <Link href="/admin/veiculos" className="btn btn-secundario">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
          </Link>
        }
      />

      <FormVeiculo eventoId={eventoParam} dias={(dias ?? []) as { data: string; tipo: string }[]} />

      <Secao
        tom="acento"
        icone={<Truck className="w-3.5 h-3.5" />}
        titulo={`${veiculos?.length ?? 0} veículo${veiculos?.length === 1 ? '' : 's'} cadastrado${veiculos?.length === 1 ? '' : 's'}`}
        descricao="A portaria confere a placa nesta lista"
        corpoClassName={veiculos?.length ? '' : 'p-4'}
      >
        {!veiculos?.length ? (
          <EmptyState
            icone={<Truck className="w-7 h-7" />}
            titulo="Nenhum veículo ainda"
            descricao="Cadastre acima, começando pelo CPF de quem vai dirigir."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Placa</th>
                  <th>Veículo</th>
                  <th>Condutor</th>
                  <th>Empresa</th>
                  <th>Dias</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {veiculos.map(v => {
                  const cond = v.funcionarios as unknown as { nome: string; cpf: string } | null
                  const diasDoVeiculo = (v.veiculo_dias as unknown as { data: string }[] | null) ?? []
                  return (
                    <tr key={v.id as string}>
                      <td className="font-mono font-bold tabular-nums whitespace-nowrap">{v.placa as string}</td>
                      <td>
                        <p className="text-slate-700">{v.modelo as string}</p>
                        <p className="text-slate-400 text-2xs">
                          {[v.tipo, v.cor].filter(Boolean).join(' · ') || '—'}
                        </p>
                        {v.observacoes ? (
                          <p className="text-amber-700 text-2xs mt-0.5">{v.observacoes as string}</p>
                        ) : null}
                      </td>
                      <td>
                        <p className="text-slate-700">{cond?.nome ?? '—'}</p>
                        {cond?.cpf && (
                          <p className="text-slate-400 text-2xs tabular-nums">{formatCpf(cond.cpf)}</p>
                        )}
                      </td>
                      <td className="text-slate-500">{(v.empresa as string | null) || '—'}</td>
                      <td className="text-slate-500 text-2xs">
                        {/* Sem dia marcado = autorizado em todos — é o padrão
                            do cadastro, e dizer "Todos" evita a leitura de
                            que ficou faltando preencher. */}
                        {diasDoVeiculo.length
                          ? diasDoVeiculo
                              .map(d => formatarBR(`${d.data}T12:00:00-03:00`, 'data').slice(0, 5))
                              .join(', ')
                          : 'Todos'}
                      </td>
                      <td className="text-right">
                        <AcoesVeiculo
                          veiculoId={v.id as string}
                          eventoId={eventoParam}
                          placa={v.placa as string}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Secao>
    </div>
  )
}
