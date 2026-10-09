import 'server-only'
import { supabaseAdmin, buscarTudo } from './supabase-server'
import { diaBRT } from './janelas'
import { descreverDistancia, avaliarLocal, posicaoValida, type LocalDoEvento } from './geo-local'

/**
 * O alerta de "bateu fora do local do evento" — pedido do Juan (08/10/2026): quando o aparelho de quem registrou
 * (operador ou a própria pessoa) estava fora do raio do local configurado em Editar evento, isso precisa aparecer
 * para quem administra, não só ficar escondido na ficha de cada pessoa. Só admin/master veem (a marca em si já é
 * assim — ver `app/admin/eventos/[id]/fornecedor/[fid]/page.tsx`).
 *
 * Tolerante: sem a migração (upgrade-geolocalizacao-operador.sql) ou sem local configurado, a consulta não acha
 * nada marcado — o alerta simplesmente não aparece, sem quebrar a tela.
 */
export type BatidaForaDoLocal = {
  id: string
  nome: string
  setorNome: string | null
  tipo: 'entrada' | 'meio' | 'fim'
  criadoEm: string
  distanciaTexto: string | null
}

const ROTULO_TIPO: Record<string, string> = { entrada: 'Entrada', meio: 'Meio', fim: 'Saída' }

export async function batidasForaDoLocalHoje(eventoId: string): Promise<BatidaForaDoLocal[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('registros')
      .select('id, tipo, created_at, distancia_m, funcionarios!inner(nome, fornecedores(nome))')
      .eq('evento_id', eventoId)
      .eq('data_ref', diaBRT())
      .eq('fora_do_local', true)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) return []
    return (data ?? []).map(r => ({
      id: r.id as string,
      nome: (r.funcionarios as unknown as { nome: string } | null)?.nome ?? '—',
      setorNome: (r.funcionarios as unknown as { fornecedores?: { nome?: string } | null } | null)?.fornecedores?.nome ?? null,
      tipo: (ROTULO_TIPO[r.tipo as string] ? (r.tipo as 'entrada' | 'meio' | 'fim') : 'entrada'),
      criadoEm: r.created_at as string,
      distanciaTexto: typeof r.distancia_m === 'number' ? descreverDistancia(r.distancia_m) : null,
    }))
  } catch {
    return []
  }
}

export { ROTULO_TIPO }

// ─── Relatório completo: quem bateu fora do local do evento ──────────────────────────────────────────────────

export type LinhaForaDoLocal = {
  id: string
  /** 'registrada' = a batida valeu e está no ponto; 'recusada' = a tentativa foi barrada por estar fora do raio. */
  situacao: 'registrada' | 'recusada'
  funcionarioNome: string
  setorNome: string | null
  tipo: 'entrada' | 'meio' | 'fim' | null
  quando: string
  distanciaM: number | null
  latitude: number | null
  longitude: number | null
  endereco: string | null
  /** "Celular da própria pessoa" ou o nome de quem estava com o aparelho (operador). */
  quemRegistrou: string
}

export type RelatorioForaDoLocal = {
  /** false = o evento não tem local marcado no mapa (Editar evento) — não há com o que comparar. */
  localConfigurado: boolean
  raioM: number | null
  linhas: LinhaForaDoLocal[]
}

type Fn = { nome?: string; fornecedores?: { nome?: string } | null } | null

/**
 * "Quem bateu fora do limite da área precisa ter um relatório" (Juan, 08/10/2026). Junta:
 *   • batidas REGISTRADAS fora do raio: as já marcadas (`fora_do_local`) e — recalculando na hora — toda batida
 *     com latitude/longitude gravada. As do caminho antigo pelo celular nunca foram comparadas com o raio, e são
 *     justamente as que importam (dava pra bater de casa);
 *   • tentativas RECUSADAS por estar fora do raio (`leituras_qr`, resultado 'fora_do_local') — do scanner do
 *     operador e do autoatendimento pelo celular.
 * Usa o local/raio ATUAL do evento (Editar evento → mapa).
 */
export async function relatorioForaDoLocal(eventoId: string): Promise<RelatorioForaDoLocal> {
  const { data: ev } = await supabaseAdmin.from('eventos').select('local_latitude, local_longitude, local_raio_m').eq('id', eventoId).maybeSingle()
  const local: LocalDoEvento | null = ev?.local_latitude != null && ev?.local_longitude != null
    ? { latitude: Number(ev.local_latitude), longitude: Number(ev.local_longitude), raioM: Number(ev.local_raio_m ?? 800) }
    : null

  const registros = await buscarTudo<Record<string, unknown>>((de, ate) => supabaseAdmin
    .from('registros')
    .select('id, tipo, created_at, latitude, longitude, precisao_m, distancia_m, fora_do_local, endereco_aproximado, criado_por_perfil_id, funcionarios!inner(nome, fornecedores(nome))')
    .eq('evento_id', eventoId)
    .or('fora_do_local.eq.true,latitude.not.is.null')
    .order('created_at', { ascending: false })
    .range(de, ate)).catch(() => [] as Record<string, unknown>[])

  const leituras = await lerTentativas('evento_id', eventoId)

  const perfilIds = [...new Set([
    ...registros.map(r => r.criado_por_perfil_id as string | null),
    ...leituras.map(l => l.perfil_id as string | null),
  ].filter((v): v is string => !!v))]
  const nomePerfil = new Map<string, string>()
  if (perfilIds.length) {
    const { data } = await supabaseAdmin.from('perfis').select('id, nome').in('id', perfilIds)
    for (const p of data ?? []) nomePerfil.set(p.id as string, p.nome as string)
  }
  const quem = (perfilId: unknown) =>
    perfilId ? (nomePerfil.get(perfilId as string) ?? 'Operador') : 'Celular da própria pessoa'
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

  const linhas: LinhaForaDoLocal[] = []
  for (const r of registros) {
    const pos = posicaoValida({ latitude: num(r.latitude), longitude: num(r.longitude), precisao: num(r.precisao_m) })
    const calculado = avaliarLocal(pos, local)
    const fora = r.fora_do_local === true || calculado.foraDoLocal === true
    if (!fora) continue
    const f = r.funcionarios as unknown as Fn
    linhas.push({
      id: `r:${r.id as string}`,
      situacao: 'registrada',
      funcionarioNome: f?.nome ?? '—',
      setorNome: f?.fornecedores?.nome ?? null,
      tipo: (ROTULO_TIPO[r.tipo as string] ? r.tipo : null) as LinhaForaDoLocal['tipo'],
      quando: r.created_at as string,
      distanciaM: num(r.distancia_m) ?? calculado.distanciaM,
      latitude: pos?.latitude ?? null,
      longitude: pos?.longitude ?? null,
      endereco: (r.endereco_aproximado as string | null) ?? null,
      quemRegistrou: quem(r.criado_por_perfil_id),
    })
  }
  for (const l of leituras) {
    const f = l.funcionarios as unknown as Fn
    const mensagem = (l.mensagem as string | null) ?? ''
    linhas.push({
      id: `l:${l.id as string}`,
      situacao: 'recusada',
      funcionarioNome: f?.nome ?? '—',
      setorNome: f?.fornecedores?.nome ?? null,
      tipo: /\(saída\)/.test(mensagem) ? 'fim' : /\(entrada\)/.test(mensagem) ? 'entrada' : /\(meio\)/.test(mensagem) ? 'meio' : null,
      quando: l.created_at as string,
      distanciaM: num(l.distancia_m),
      latitude: num(l.latitude),
      longitude: num(l.longitude),
      endereco: (l.endereco_aproximado as string | null) ?? null,
      quemRegistrou: quem(l.perfil_id),
    })
  }
  linhas.sort((a, b) => b.quando.localeCompare(a.quando))
  return { localConfigurado: !!local, raioM: local?.raioM ?? null, linhas }
}

const COLUNAS_TENTATIVA = 'id, created_at, latitude, longitude, distancia_m, perfil_id, mensagem, funcionario_id, funcionarios(nome, fornecedores(nome))'

/**
 * As tentativas recusadas por estar fora do raio (`leituras_qr`, resultado 'fora_do_local'). Tolerante: sem a
 * coluna do endereço (upgrade-endereco-tentativa-fora.sql pendente), lê sem ela.
 */
async function lerTentativas(coluna: 'evento_id' | 'funcionario_id', valor: string): Promise<Record<string, unknown>[]> {
  const ler = (colunas: string) => buscarTudo<Record<string, unknown>>((de, ate) => supabaseAdmin
    .from('leituras_qr').select(colunas)
    .eq(coluna, valor)
    .eq('resultado', 'fora_do_local')
    .order('created_at', { ascending: false })
    .range(de, ate) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>)
  try {
    return await ler(`${COLUNAS_TENTATIVA}, endereco_aproximado`)
  } catch {
    return ler(COLUNAS_TENTATIVA).catch(() => [])
  }
}

export type TentativaForaDoLocal = {
  id: string
  quando: string
  tipo: 'entrada' | 'meio' | 'fim' | null
  distanciaM: number | null
  endereco: string | null
  latitude: number | null
  longitude: number | null
  quemRegistrou: string
}

/** As tentativas recusadas de UMA pessoa — o histórico dela (aba Histórico da ficha), mais recente primeiro. */
export async function tentativasForaDoLocalDe(funcionarioId: string): Promise<TentativaForaDoLocal[]> {
  const linhas = await lerTentativas('funcionario_id', funcionarioId)
  const perfilIds = [...new Set(linhas.map(l => l.perfil_id as string | null).filter((v): v is string => !!v))]
  const nomes = new Map<string, string>()
  if (perfilIds.length) {
    const { data } = await supabaseAdmin.from('perfis').select('id, nome').in('id', perfilIds)
    for (const p of data ?? []) nomes.set(p.id as string, p.nome as string)
  }
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  return linhas.map(l => {
    const mensagem = (l.mensagem as string | null) ?? ''
    return {
      id: l.id as string,
      quando: l.created_at as string,
      tipo: /\(saída\)/.test(mensagem) ? 'fim' : /\(entrada\)/.test(mensagem) ? 'entrada' : /\(meio\)/.test(mensagem) ? 'meio' : null,
      distanciaM: num(l.distancia_m),
      endereco: (l.endereco_aproximado as string | null) ?? null,
      latitude: num(l.latitude),
      longitude: num(l.longitude),
      quemRegistrou: l.perfil_id ? (nomes.get(l.perfil_id as string) ?? 'Operador') : 'Celular da própria pessoa',
    }
  })
}
