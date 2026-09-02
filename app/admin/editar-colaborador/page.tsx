import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { UserCog, CalendarDays } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import {
  veTodosEventos, podeGerenciarEventos, podeGerenciarUsuarios, podeEditarIdentidade,
} from '@/lib/permissions'
import { suporteTemEscopo } from '@/lib/suporte'
import { diaBRT, TETO_TURNO_H } from '@/lib/janelas'
import { PageHeader } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'
import BuscarColaborador, { type ColaboradorDoEvento } from './BuscarColaborador'
import type { Presenca } from '../eventos/[id]/fornecedor/[fid]/FuncionarioTable'

export const revalidate = 0

type Etapa = 'entrada' | 'meio' | 'fim'

/**
 * Editar colaborador — achar alguém do evento e abrir a ficha dela.
 *
 * Não é uma funcionalidade nova: mover de setor, corrigir CPF, ajustar valor
 * e tornar supervisor já existiam, mas só dentro da tela de um setor. Quem
 * não sabia em qual setor a pessoa estava tinha que abrir setor por setor —
 * num evento de 35 setores, isso é a diferença entre resolver na hora e não
 * resolver. O modal é o MESMO (`FuncionarioDetalheModal`), com as mesmas
 * permissões; o que muda é o caminho até ele.
 *
 * Master vê todos os eventos; admin só os da própria organização.
 */
export default async function EditarColaboradorPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarEventos(perfil.role) && perfil.role !== 'suporte') redirect('/admin')

  const { evento: eventoParam } = await searchParams

  if (!eventoParam) {
    return (
      <div className="space-y-5">
        <PageHeader titulo="Editar colaborador" descricao="Escolha o evento em que a pessoa está" />
        <EscolherEvento
          eventos={await eventosQuePossoAbrir()}
          href={id => `/admin/editar-colaborador?evento=${id}`}
          icone={<UserCog className="w-3.5 h-3.5" />}
          titulo="Em qual evento?"
          descricao="Mover de setor, corrigir CPF, ajustar valor e tornar supervisor"
          vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel para poder editar a equipe dele.' }}
          mostrarOrganizacao={veTodosEventos(perfil.role)}
        />
      </div>
    )
  }

  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoParam).single()
  if (!evento) notFound()
  if (perfil.role === 'suporte') {
    if (!(await suporteTemEscopo(perfil.id, { eventoId: evento.id, organizacaoId: evento.organizacao_id ?? undefined }))) notFound()
  } else if (!veTodosEventos(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
    notFound()
  }

  // Um instante só para o render inteiro: duas leituras de relógio na mesma
  // página podiam cair em dias diferentes na virada da meia-noite.
  const agoraDoRender = new Date()
  const hoje = diaBRT(agoraDoRender)
  const ontem = diaBRT(new Date(agoraDoRender.getTime() - 24 * 60 * 60 * 1000))

  const { data: setores } = await supabase
    .from('fornecedores').select('id, nome, valor_combinado').eq('evento_id', eventoParam).order('nome')
  const idsSetores = (setores ?? []).map(s => s.id as string)

  const [{ data: funcionarios }, { data: registros }] = await Promise.all([
    idsSetores.length
      ? supabase
          .from('funcionarios')
          .select('id, nome, cpf, telefone, empresa, cargo, valor_receber, chave_pix, pago, pago_em, foto_perfil_path, ativo, fornecedor_id')
          .in('fornecedor_id', idsSetores).order('nome')
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    /*
     * Só hoje e ontem: a ficha mostra "Presença hoje", e ontem entra por
     * causa do turno que vira a madrugada — mesma regra da tela do setor.
     */
    supabase
      .from('registros')
      .select('funcionario_id, tipo, created_at, data_ref, foto_url, latitude, longitude, endereco_aproximado, registro_manual, justificativa, criado_por_perfil_id')
      .eq('evento_id', eventoParam).in('data_ref', [hoje, ontem]),
  ])

  // Nomes de quem registrou — a trilha de auditoria da batida assistida.
  const perfilIds = [...new Set((registros ?? []).map(r => r.criado_por_perfil_id).filter((v): v is string => !!v))]
  const nomePorPerfil: Record<string, string> = {}
  if (perfilIds.length) {
    const { data: perfis } = await supabase.from('perfis').select('id, nome').in('id', perfilIds)
    for (const p of perfis ?? []) nomePorPerfil[p.id] = p.nome
  }

  // Assina as URLs das fotos em lote (bucket privado) — presença + avatares.
  const paths = [
    ...(registros ?? []).map(r => r.foto_url).filter((p): p is string => !!p),
    ...(funcionarios ?? []).map(f => f.foto_perfil_path as string | null).filter((p): p is string => !!p),
  ]
  const urlPorPath: Record<string, string> = {}
  if (paths.length) {
    const { data: signed } = await supabase.storage.from('presencas').createSignedUrls(paths, 60 * 60)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlPorPath[s.path] = s.signedUrl
  }

  /*
   * Qual dia cada pessoa está cumprindo — quase sempre hoje; a exceção é quem
   * entrou ontem à noite e ainda está no turno. Mesma regra do scanner.
   */
  const agora = agoraDoRender.getTime()
  const diaPorFunc = new Map<string, string>()
  for (const r of registros ?? []) {
    if (r.tipo !== 'entrada') continue
    if (agora - new Date(r.created_at as string).getTime() > TETO_TURNO_H * 60 * 60 * 1000) continue
    const dia = (r.data_ref as string | null) ?? diaBRT(r.created_at as string)
    const atual = diaPorFunc.get(r.funcionario_id as string)
    if (!atual || dia > atual) diaPorFunc.set(r.funcionario_id as string, dia)
  }
  const diaDe = (funcId: string) => diaPorFunc.get(funcId) ?? hoje

  const presencaPorFunc: Record<string, Record<Etapa, Presenca>> = {}
  for (const r of registros ?? []) {
    const funcId = r.funcionario_id as string
    if (((r.data_ref as string | null) ?? hoje) !== diaDe(funcId)) continue
    if (!presencaPorFunc[funcId]) presencaPorFunc[funcId] = { entrada: null, meio: null, fim: null }
    presencaPorFunc[funcId][r.tipo as Etapa] = {
      feitoEm: r.created_at as string,
      fotoUrl: r.foto_url ? urlPorPath[r.foto_url as string] ?? null : null,
      lat: (r.latitude as number | null) ?? null,
      lng: (r.longitude as number | null) ?? null,
      enderecoAproximado: (r.endereco_aproximado as string | null) ?? null,
      registradoPor: r.criado_por_perfil_id ? nomePorPerfil[r.criado_por_perfil_id as string] ?? null : null,
      assistido: r.registro_manual === true,
      justificativa: (r.justificativa as string | null) ?? null,
    }
  }

  const dadosSetor = new Map((setores ?? []).map(s => [s.id as string, s]))
  const colaboradores: ColaboradorDoEvento[] = (funcionarios ?? []).map(f => {
    const setor = dadosSetor.get(f.fornecedor_id as string)
    const p = presencaPorFunc[f.id as string] ?? { entrada: null, meio: null, fim: null }
    return {
      id: f.id as string,
      nome: f.nome as string,
      cpf: f.cpf as string,
      telefone: (f.telefone as string | null) ?? '',
      empresa: (f.empresa as string | null) ?? '',
      cargo: (f.cargo as string | null) ?? '',
      valorReceber: Number(f.valor_receber ?? 0),
      chavePix: (f.chave_pix as string | null) ?? null,
      pago: f.pago === true,
      pagoEm: (f.pago_em as string | null) ?? null,
      fotoUrl: f.foto_perfil_path ? urlPorPath[f.foto_perfil_path as string] ?? null : null,
      ativo: f.ativo !== false,
      fornecedorId: f.fornecedor_id as string,
      setorNome: (setor?.nome as string) ?? '—',
      valorCombinado: (setor?.valor_combinado as number | null) ?? null,
      entrada: p.entrada,
      meio: p.meio,
      fim: p.fim,
    }
  })

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Editar colaborador"
        descricao={`${evento.nome} — mover de setor, corrigir dados e ajustar valor`}
        acoes={
          <Link href="/admin/editar-colaborador" className="btn btn-secundario">
            <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
          </Link>
        }
      />
      <BuscarColaborador
        colaboradores={colaboradores}
        eventoId={eventoParam}
        eventoNome={evento.nome as string}
        outrosSetores={(setores ?? []).map(s => ({ id: s.id as string, nome: s.nome as string }))}
        /* Já provamos o escopo de suporte acima (senão a página nem chegava
           aqui) — dentro dele, ele pode as mesmas três coisas de admin/master. */
        podeMoverDeSetor={podeGerenciarEventos(perfil.role) || perfil.role === 'suporte'}
        podeCriarSupervisor={podeGerenciarUsuarios(perfil.role) || perfil.role === 'suporte'}
        podeEditarCpf={podeEditarIdentidade(perfil.role)}
        podeAtivarDesativar={podeGerenciarEventos(perfil.role) || perfil.role === 'suporte'}
        role={perfil.role}
      />
    </div>
  )
}
