import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Eye } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { exigirVinculo, carregarPessoaParaConsulta, carregarHistoricoParaConsulta } from '@/lib/encarregado-consulta'
import { caminhoDoSetor } from '@/lib/encarregado'
import { formatarBR } from '@/lib/tz'
import { formatTelefone, formatCpf } from '@/lib/format'
import { Badge, PageHeader } from '@/components/ui/Superficie'
import HistoricoLeitura from './HistoricoLeitura'

export const revalidate = 0

type Aba = 'dados' | 'historico'

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="min-w-0">
      <p className="text-slate-500 text-xs">{rotulo}</p>
      <p className="text-slate-800 text-sm font-medium mt-0.5 break-words">{valor}</p>
    </div>
  )
}

/**
 * Uma pessoa da equipe, em modo leitura: DADOS e HISTÓRICO — só essas duas
 * abas, sem nenhuma ação (sem editar, sem lançar ponto, sem crachá, sem QR).
 *
 * Sem JavaScript de aba: cada aba é um link, e a página é toda de servidor. O
 * vínculo com o setor é conferido aqui, e a pessoa só abre se for DESTE setor.
 */
export default async function PessoaDoEncarregado({
  params, searchParams,
}: {
  params: Promise<{ fid: string; pid: string }>
  searchParams: Promise<{ aba?: string }>
}) {
  const { fid, pid } = await params
  const { aba: abaParam } = await searchParams
  const aba: Aba = abaParam === 'historico' ? 'historico' : 'dados'

  const perfil = await getPerfil()
  if (!perfil) redirect('/login')

  const vinculo = await exigirVinculo(perfil.id as string, fid)
  if (!vinculo) notFound()
  const pessoa = await carregarPessoaParaConsulta(vinculo, pid)
  if (!pessoa) notFound()

  const historico = aba === 'historico' ? await carregarHistoricoParaConsulta(vinculo, pid) : null
  const hrefAba = (a: Aba) => `/encarregado/${fid}/${pid}${a === 'historico' ? '?aba=historico' : ''}`

  return (
    <div className="space-y-5">
      <PageHeader
        titulo={pessoa.nome}
        descricao={caminhoDoSetor({ evento: vinculo.evento, subevento: vinculo.subevento, setor: vinculo.setor })}
        voltarPara={`/encarregado/${fid}`}
      />

      <div className="flex items-center gap-1.5 text-slate-400 text-2xs">
        <Eye className="w-3 h-3" /> Somente leitura
      </div>

      <div className="abas" role="tablist">
        {([['dados', 'Dados'], ['historico', 'Histórico']] as const).map(([valor, rotulo]) => (
          <Link
            key={valor} href={hrefAba(valor)} role="tab" aria-selected={aba === valor}
            className={`aba ${aba === valor ? 'aba-ativa' : ''}`}
          >
            {rotulo}
          </Link>
        ))}
      </div>

      {aba === 'dados' ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {pessoa.status === 'aprovado' && pessoa.ativo && <Badge tom="positivo">Aprovado</Badge>}
            {pessoa.status === 'aprovado' && !pessoa.ativo && <Badge tom="neutro">Desativado</Badge>}
            {pessoa.status === 'pendente' && <Badge tom="atencao">Aguardando aprovação</Badge>}
            {pessoa.status === 'negado' && <Badge tom="negativo">Não aprovado</Badge>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Dado rotulo="Nome" valor={pessoa.nome} />
            <Dado rotulo="Função" valor={pessoa.cargo || 'Sem função definida'} />
            <Dado rotulo="Empresa" valor={pessoa.empresa || '—'} />
            <Dado rotulo="Cidade" valor={pessoa.cidade || '—'} />
            <Dado rotulo="Telefone" valor={pessoa.telefone ? formatTelefone(pessoa.telefone) : '—'} />
            <Dado rotulo="CPF" valor={pessoa.cpf.length === 11 ? formatCpf(pessoa.cpf) : pessoa.cpf} />
            <Dado rotulo="Setor" valor={vinculo.subevento ? `${vinculo.subevento} › ${vinculo.setor}` : vinculo.setor} />
            <Dado rotulo="Cadastrado em" valor={formatarBR(pessoa.cadastradoEm, 'curto')} />
          </div>
          {pessoa.diasAprovados.length > 0 && (
            <div>
              <p className="text-slate-500 text-xs">Dias escalados</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {pessoa.diasAprovados.map(d => (
                  <span key={d} className="text-xs font-medium text-slate-600 bg-slate-100 rounded-full px-2.5 py-0.5 tabular-nums">
                    {`${d.slice(8, 10)}/${d.slice(5, 7)}`}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : historico ? (
        <HistoricoLeitura h={historico} />
      ) : (
        <p className="text-slate-400 text-sm py-6 text-center">Não foi possível carregar o histórico agora.</p>
      )}
    </div>
  )
}
