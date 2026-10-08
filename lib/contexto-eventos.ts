import 'server-only'
import { supabaseAdmin } from './supabase-server'
import { vinculosDoEncarregado } from './encarregado-consulta'
import type { ContextoDeEventos, NoEvento, NoSubevento } from './contexto-eventos-tipos'

/**
 * A árvore Evento › Subevento › Fornecedor que ESTA conta enxerga — o que alimenta o seletor de
 * evento do topo (pedido do Juan, 07/10/2026: todo acesso com mais de um evento precisa poder
 * escolher e ver em qual está).
 *
 * O que entra depende do papel, porque cada um tem um vínculo diferente:
 *   - supervisor: os setores dele (`supervisor_setores`), agrupados por evento e subevento;
 *   - Encarregado: os setores liberados a ele (`encarregados_setor`);
 *   - administrador / gestor: os eventos da organização, com os subeventos (sem setores — são centenas);
 *   - Gestor de credenciamento (operador de portão): só os eventos da organização — o acesso dele é do
 *     evento inteiro, não de subevento nem de fornecedor.
 * Master, suporte e produtor ficam de fora: já escolhem o evento em cada tela.
 *
 * Nunca lança: o seletor é um conforto, e uma falha aqui não pode derrubar o painel inteiro.
 */
export async function contextoDeEventos(
  perfil: { id: string; role: string; organizacao_id?: string | null; fornecedor_id?: string | null },
  /** Os setores do supervisor, se quem chama já os tem (evita repetir a consulta). */
  setoresDoSupervisor?: { id: string; nome: string; evento_id: string }[],
): Promise<ContextoDeEventos | null> {
  try {
    if (perfil.role === 'encarregado') return await doEncarregado(perfil.id)
    if (perfil.role === 'supervisor') return await doSupervisor(perfil, setoresDoSupervisor ?? [])
    if (['admin', 'gerente', 'cliente', 'operador_portao'].includes(perfil.role) && perfil.organizacao_id) {
      return await daOrganizacao(perfil.organizacao_id, perfil.role === 'operador_portao')
    }
    return null
  } catch (e) {
    console.error('[contexto-eventos] falhou', e)
    return null
  }
}

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR')

async function doEncarregado(perfilId: string): Promise<ContextoDeEventos> {
  const vinculos = await vinculosDoEncarregado(perfilId)
  const eventos = new Map<string, NoEvento>()
  for (const v of vinculos) {
    const e = eventos.get(v.eventoId) ?? { id: v.eventoId, nome: v.evento, ativo: true, subeventos: [] }
    eventos.set(v.eventoId, e)
    let sub = e.subeventos.find(s => s.nome === v.subevento)
    if (!sub) { sub = { id: null, nome: v.subevento, setores: [] }; e.subeventos.push(sub) }
    sub.setores.push({ id: v.fornecedorId, nome: v.setor })
  }
  const lista = [...eventos.values()].sort(porNome)
  for (const e of lista) { e.subeventos.sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR')); for (const s of e.subeventos) s.setores.sort(porNome) }
  return { modo: 'encarregado', eventos: lista, atual: { eventoId: null, setorId: null } }
}

async function doSupervisor(
  perfil: { fornecedor_id?: string | null },
  setores: { id: string; nome: string; evento_id: string }[],
): Promise<ContextoDeEventos | null> {
  if (!setores.length) return null
  const idsSetores = setores.map(s => s.id)
  const idsEventos = [...new Set(setores.map(s => s.evento_id))]

  const [{ data: eventosRows }, subPorSetor] = await Promise.all([
    supabaseAdmin.from('eventos').select('id, nome, ativo, data_inicio').in('id', idsEventos),
    // Coluna/tabela de subeventos em consulta à parte e tolerante: sem a migração, tudo fica sem subevento.
    (async () => {
      const mapa = new Map<string, { id: string; nome: string }>()
      try {
        const { data: forn } = await supabaseAdmin.from('fornecedores').select('id, subevento_id').in('id', idsSetores)
        const ids = [...new Set((forn ?? []).map(f => f.subevento_id as string | null).filter((v): v is string => !!v))]
        if (!ids.length) return mapa
        const { data: subs } = await supabaseAdmin.from('subeventos').select('id, nome').in('id', ids)
        const nomes = new Map((subs ?? []).map(s => [s.id as string, s.nome as string]))
        for (const f of forn ?? []) {
          const sid = f.subevento_id as string | null
          if (sid && nomes.has(sid)) mapa.set(f.id as string, { id: sid, nome: nomes.get(sid)! })
        }
      } catch { /* migração pendente */ }
      return mapa
    })(),
  ])

  const eventos: NoEvento[] = (eventosRows ?? [])
    .map(e => ({ id: e.id as string, nome: e.nome as string, ativo: e.ativo !== false, inicio: (e.data_inicio as string | null) ?? '' }))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo) || b.inicio.localeCompare(a.inicio))
    .map(({ inicio: _inicio, ...e }) => {
      const subs: NoSubevento[] = []
      for (const s of setores.filter(x => x.evento_id === e.id).sort(porNome)) {
        const sub = subPorSetor.get(s.id) ?? null
        let no = subs.find(x => x.id === (sub?.id ?? null))
        if (!no) { no = { id: sub?.id ?? null, nome: sub?.nome ?? null, setores: [] }; subs.push(no) }
        no.setores.push({ id: s.id, nome: s.nome })
      }
      subs.sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
      return { ...e, subeventos: subs }
    })

  const atual = setores.find(s => s.id === perfil.fornecedor_id) ?? null
  return { modo: 'supervisor', eventos, atual: { eventoId: atual?.evento_id ?? null, setorId: atual?.id ?? null } }
}

async function daOrganizacao(organizacaoId: string, soEventos: boolean): Promise<ContextoDeEventos | null> {
  const { data } = await supabaseAdmin
    .from('eventos').select('id, nome, ativo, data_inicio')
    .eq('organizacao_id', organizacaoId).order('data_inicio', { ascending: false }).limit(200)
  const base = (data ?? []) as { id: string; nome: string; ativo: boolean | null; data_inicio: string | null }[]
  if (!base.length) return null

  const subPorEvento = new Map<string, NoSubevento[]>()
  if (!soEventos) {
    try {
      const { data: subs } = await supabaseAdmin
        .from('subeventos').select('id, nome, evento_id').in('evento_id', base.map(e => e.id)).order('nome')
      for (const s of subs ?? []) {
        const lista = subPorEvento.get(s.evento_id as string) ?? []
        lista.push({ id: s.id as string, nome: s.nome as string, setores: [] })
        subPorEvento.set(s.evento_id as string, lista)
      }
    } catch { /* migração pendente */ }
  }

  const eventos: NoEvento[] = base
    .map(e => ({ id: e.id, nome: e.nome, ativo: e.ativo !== false, subeventos: subPorEvento.get(e.id) ?? [] }))
    .sort((a, b) => Number(b.ativo) - Number(a.ativo))
  return { modo: soEventos ? 'portao' : 'organizacao', eventos, atual: { eventoId: null, setorId: null } }
}
