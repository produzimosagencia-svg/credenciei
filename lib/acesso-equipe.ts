import 'server-only'
import { getPerfil, supabaseAdmin, meusSetores, ehDaOrganizacaoDoPerfil } from './supabase-server'
import { ehMaster, podeGerenciarEventos } from './permissions'
import { obterFuncionalidadesDoEvento } from './internos-servidor'

/*
 * QUEM PODE MONTAR UMA EQUIPE — a régua do "Monte sua equipe" e do convite por WhatsApp (18/10/2026): o supervisor
 * DELA (vínculo em `supervisor_setores`, qualquer que seja o papel principal da conta) e quem gerencia o evento
 * (admin da organização, master). A mesma régua do cadastro pela equipe (`exigirAcessoFuncionarios`).
 */

export type Acesso = {
  perfil: NonNullable<Awaited<ReturnType<typeof getPerfil>>>
  fornecedor: {
    id: string; nome: string; evento_id: string; quantidade_estimada: number | null; subevento_id: string | null
    token_formulario: string | null; link_ativo: boolean
  }
  evento: { id: string; nome: string; organizacao_id: string | null; ativo: boolean | null; data_inicio: string | null; local: string | null }
  /** De quem é o histórico: o supervisor logado, ou (para o admin) os supervisores desta equipe. */
  supervisorIds: string[]
  ehOSupervisor: boolean
}

/**
 * Quem pode montar esta equipe: o supervisor DELA (vínculo em `supervisor_setores`, qualquer que seja o papel
 * principal da conta) e quem gerencia o evento (admin da organização, master). A mesma régua do cadastro pela
 * equipe (`exigirAcessoFuncionarios`).
 */
export async function acessoAEquipe(fornecedorId: string): Promise<Acesso | null> {
  const perfil = await getPerfil()
  if (!perfil || typeof fornecedorId !== 'string' || !fornecedorId) return null
  const { data: forn } = await supabaseAdmin.from('fornecedores')
    .select('id, nome, evento_id, quantidade_estimada, subevento_id, token_formulario, link_ativo, eventos!inner(id, nome, organizacao_id, ativo, data_inicio, local)')
    .eq('id', fornecedorId).maybeSingle()
  if (!forn) return null
  const evento = forn.eventos as unknown as Acesso['evento']
  const meus = await meusSetores(perfil)
  const ehOSupervisor = meus.some(s => s.id === fornecedorId)
  if (!ehOSupervisor) {
    if (perfil.role === 'supervisor' || !podeGerenciarEventos(perfil)) return null
    if (!ehMaster(perfil.role) && !ehDaOrganizacaoDoPerfil(perfil, evento.organizacao_id)) return null
  }
  let supervisorIds = [perfil.id as string]
  if (!ehOSupervisor) {
    const { data: sup } = await supabaseAdmin.from('supervisor_setores').select('perfil_id').eq('fornecedor_id', fornecedorId)
    supervisorIds = [...new Set((sup ?? []).map(s => s.perfil_id as string))]
  }
  return {
    perfil,
    fornecedor: {
      id: forn.id as string, nome: String(forn.nome ?? '').trim(), evento_id: forn.evento_id as string,
      quantidade_estimada: (forn.quantidade_estimada as number | null) ?? null,
      subevento_id: (forn as { subevento_id?: string | null }).subevento_id ?? null,
      token_formulario: (forn.token_formulario as string | null) ?? null,
      link_ativo: (forn as { link_ativo?: boolean | null }).link_ativo !== false,
    },
    evento, supervisorIds, ehOSupervisor,
  }
}

/** Vagas que a cota da equipe ainda deixa (null = sem trava de cota). Mesma conta da importação. */
export async function vagasNaCota(fornecedor: Acesso['fornecedor']): Promise<number | null> {
  const funcionalidades = await obterFuncionalidadesDoEvento(fornecedor.evento_id)
  if (!funcionalidades.travaCotaHabilitada || !fornecedor.quantidade_estimada) return null
  const { count } = await supabaseAdmin.from('funcionarios').select('id', { count: 'exact', head: true })
    .eq('fornecedor_id', fornecedor.id).or('origem.is.null,origem.neq.supervisor').is('descredenciado_em', null)
  return Math.max(0, fornecedor.quantidade_estimada - (count ?? 0))
}

