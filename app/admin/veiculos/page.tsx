import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { Truck, CalendarDays } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarVeiculos } from '@/lib/permissions'
import { suporteTemEscopo } from '@/lib/suporte'
import { linksDeVeiculoDoEvento } from '@/lib/actions'
import { statusVeiculoValido, tipoCadastroValido } from '@/lib/veiculos-constantes'
import { PageHeader } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'
import PainelVeiculos, { type VeiculoLinha } from './PainelVeiculos'

export const revalidate = 0

/**
 * Veículos do evento — quem entra de caminhão/van, e com qual placa.
 *
 * Pede o evento primeiro, igual Avisos e Relatórios: a autorização é sempre
 * DE um evento (o condutor precisa estar credenciado nele, e os dias vêm da
 * jornada dele).
 *
 * O veículo não bate ponto (sem entrada/saída, sem janela) — mas desde
 * 24/09/2026 o scanner da portaria confere o QR e libera a entrada, com
 * horário (ver `conferirVeiculoPorQR` em lib/actions.ts e
 * supabase/upgrade-veiculo-entrada.sql).
 */
export default async function VeiculosPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  // Mesma régua de `exigirAcessoAVeiculos` no servidor — aqui só evita a
  // tela abrir pra quem não pode; quem barra de verdade é a action.
  if (!podeGerenciarVeiculos(perfil)) redirect('/admin')

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
          mostrarOrganizacao={veTodosEventos(perfil)}
        />
      </div>
    )
  }

  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoParam).single()
  if (!evento) notFound()
  /*
   * O suporte não é da organização do evento — o escopo dele vem de
   * `suporte_escopo`, e comparar `organizacao_id` o expulsaria de um evento
   * que ele foi contratado justamente pra atender. Mesma régua que
   * `exigirAcessoAVeiculos` aplica no servidor.
   */
  if (perfil.role === 'suporte') {
    if (!(await suporteTemEscopo(perfil.id, { eventoId: evento.id, organizacaoId: evento.organizacao_id ?? undefined }))) {
      notFound()
    }
  } else if (!veTodosEventos(perfil) && evento.organizacao_id !== perfil.organizacao_id) {
    notFound()
  }

  const [{ data: dias }, { data: veiculos }, { data: entradas }, links] = await Promise.all([
    supabase.from('jornada_dias').select('data, tipo')
      .eq('evento_id', eventoParam).eq('cancelado', false).order('data'),
    supabase.from('veiculos')
      .select(`
        id, placa, modelo, cor, tipo, ano, empresa, setor, observacoes,
        foto_path, foto_pessoa_path, status, tipo_cadastro, created_at,
        condutor_nome, condutor_cpf, condutor_telefone, funcionarios(nome, cpf, telefone), veiculo_dias(data)
      `)
      .eq('evento_id', eventoParam).order('created_at', { ascending: false }),
    // Mais recente primeiro: cada veículo guarda a lista inteira, não só a última.
    supabase.from('veiculo_entradas').select('veiculo_id, liberado_em')
      .eq('evento_id', eventoParam).order('liberado_em', { ascending: false }),
    linksDeVeiculoDoEvento(eventoParam),
  ])

  const entradasPorVeiculo = new Map<string, string[]>()
  for (const e of entradas ?? []) {
    const lista = entradasPorVeiculo.get(e.veiculo_id as string) ?? []
    lista.push(e.liberado_em as string)
    entradasPorVeiculo.set(e.veiculo_id as string, lista)
  }

  /*
   * O caminho da foto NAO desce pra tela — só "tem ou não tem".
   *
   * Quem abre a foto pede uma URL assinada na hora (`urlFotoVeiculo`), que
   * vale 30 minutos. Mandar o caminho do arquivo pro navegador seria dar de
   * graça a localização de todas as fotos do bucket a quem abrisse a página.
   */
  const linhas: VeiculoLinha[] = (veiculos ?? []).map(v => {
    const cond = v.funcionarios as unknown as { nome: string; cpf: string; telefone: string } | null
    const entradasDoVeiculo = entradasPorVeiculo.get(v.id as string) ?? []
    return {
      id: v.id as string,
      placa: v.placa as string,
      modelo: v.modelo as string,
      cor: (v.cor as string | null) ?? null,
      ano: (v.ano as number | null) ?? null,
      tipo: (v.tipo as string | null) ?? null,
      empresa: (v.empresa as string | null) ?? null,
      setor: (v.setor as string | null) ?? null,
      observacoes: (v.observacoes as string | null) ?? null,
      condutorNome: (v.condutor_nome as string | null) ?? cond?.nome ?? null,
      condutorCpf: (v.condutor_cpf as string | null) ?? cond?.cpf ?? null,
      condutorTelefone: (v.condutor_telefone as string | null) ?? cond?.telefone ?? null,
      dias: ((v.veiculo_dias as unknown as { data: string }[] | null) ?? []).map(d => d.data),
      temFoto: !!v.foto_path,
      temFotoPessoa: !!v.foto_pessoa_path,
      status: statusVeiculoValido(v.status as string),
      tipoCadastro: tipoCadastroValido(v.tipo_cadastro as string),
      ultimaEntradaEm: entradasDoVeiculo[0] ?? null,
      entradas: entradasDoVeiculo,
    }
  })

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Veículos do evento"
        descricao={`${evento.nome} — veículos autorizados a entrar`}
        acoes={
          <Link href="/admin/veiculos" className="btn btn-secundario">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
          </Link>
        }
      />

      <PainelVeiculos
        eventoId={eventoParam}
        links={links}
        dias={(dias ?? []) as { data: string; tipo: string }[]}
        veiculos={linhas}
      />
    </div>
  )
}
