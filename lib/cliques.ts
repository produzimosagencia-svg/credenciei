import 'server-only'
import { supabaseAdmin, buscarTudo } from './supabase-server'
import { emLotes } from './lotes'
import { formatarBR } from './tz'
import { ROTULO_DESTINO, ROTULO_ORIGEM, type DestinoClique, type OrigemClique } from './links-rastreados'

/*
 * Os números da tela "Cliques" (/admin/cliques, só master) — pedido do Juan, 09/10/2026: quantos clicaram no
 * Instagram, quantos foram pro site, e quem. Instagram e site vêm de `cliques_links` (rota /ir); o WhatsApp
 * comercial, de `cliques_whatsapp` (rota /wa, que já existia e não tinha tela).
 *
 * Tolerante: sem a tabela (SQL ainda não rodado), devolve `tabelaFaltando` e a tela explica o que rodar.
 */

export type Contagem = { total: number; seteDias: number; hoje: number }
export type ResumoCliques = {
  tabelaFaltando: boolean
  instagram: Contagem
  site: Contagem
  whatsapp: Contagem
  porOrigem: { destino: string; origem: string; total: number }[]
  porEvento: { evento: string; instagram: number; site: number }[]
  ultimos: { quando: string; destino: string; origem: string; pessoa: string | null; setor: string | null; evento: string | null }[]
}

type Linha = { destino: string; origem: string; evento_id: string | null; fornecedor_id: string | null; funcionario_id: string | null; criado_em: string }

/** 00:00 de hoje e de 6 dias atrás, no horário de Brasília (-03:00 fixo). */
function marcos() {
  const hoje = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
  const inicioHoje = new Date(`${hoje}T00:00:00-03:00`).getTime()
  return { inicioHoje, inicioSete: inicioHoje - 6 * 24 * 3600_000 }
}

function contar(datas: string[]): Contagem {
  const { inicioHoje, inicioSete } = marcos()
  let seteDias = 0, hoje = 0
  for (const d of datas) {
    const t = new Date(d).getTime()
    if (t >= inicioSete) seteDias++
    if (t >= inicioHoje) hoje++
  }
  return { total: datas.length, seteDias, hoje }
}

async function nomes(tabela: 'eventos' | 'fornecedores' | 'funcionarios', ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  for (const lote of emLotes([...new Set(ids)], 150)) {
    const { data } = await supabaseAdmin.from(tabela).select('id, nome').in('id', lote)
    for (const r of data ?? []) mapa.set(r.id as string, r.nome as string)
  }
  return mapa
}

export async function resumoDosCliques(): Promise<ResumoCliques> {
  let linhas: Linha[] = []
  let tabelaFaltando = false
  try {
    linhas = await buscarTudo<Linha>((de, ate) => supabaseAdmin.from('cliques_links')
      .select('destino, origem, evento_id, fornecedor_id, funcionario_id, criado_em').order('criado_em', { ascending: false }).range(de, ate))
  } catch {
    tabelaFaltando = true
  }
  let whats: string[] = []
  try {
    whats = (await buscarTudo<{ criado_em: string }>((de, ate) => supabaseAdmin.from('cliques_whatsapp')
      .select('criado_em').order('criado_em', { ascending: false }).range(de, ate))).map(w => w.criado_em)
  } catch { /* sem a tabela do /wa: zero */ }

  const [eventos, setores, pessoas] = await Promise.all([
    nomes('eventos', linhas.map(l => l.evento_id).filter((x): x is string => !!x)),
    nomes('fornecedores', linhas.slice(0, 200).map(l => l.fornecedor_id).filter((x): x is string => !!x)),
    nomes('funcionarios', linhas.slice(0, 200).map(l => l.funcionario_id).filter((x): x is string => !!x)),
  ])

  const destino = (d: string) => ROTULO_DESTINO[d as DestinoClique] ?? d
  const origem = (o: string) => ROTULO_ORIGEM[o as OrigemClique] ?? o

  const porOrigem = new Map<string, { destino: string; origem: string; total: number }>()
  const porEvento = new Map<string, { evento: string; instagram: number; site: number }>()
  for (const l of linhas) {
    const k = `${l.destino}|${l.origem}`
    const o = porOrigem.get(k) ?? { destino: destino(l.destino), origem: origem(l.origem), total: 0 }
    o.total++
    porOrigem.set(k, o)
    if (l.evento_id) {
      const e = porEvento.get(l.evento_id) ?? { evento: eventos.get(l.evento_id) ?? 'Evento excluído', instagram: 0, site: 0 }
      if (l.destino === 'instagram') e.instagram++
      else e.site++
      porEvento.set(l.evento_id, e)
    }
  }

  return {
    tabelaFaltando,
    instagram: contar(linhas.filter(l => l.destino === 'instagram').map(l => l.criado_em)),
    site: contar(linhas.filter(l => l.destino === 'site').map(l => l.criado_em)),
    whatsapp: contar(whats),
    porOrigem: [...porOrigem.values()].sort((a, b) => b.total - a.total),
    porEvento: [...porEvento.values()].sort((a, b) => (b.instagram + b.site) - (a.instagram + a.site)),
    ultimos: linhas.slice(0, 200).map(l => ({
      quando: formatarBR(l.criado_em, 'completo'),
      destino: destino(l.destino),
      origem: origem(l.origem),
      pessoa: l.funcionario_id ? pessoas.get(l.funcionario_id) ?? null : null,
      setor: l.fornecedor_id ? setores.get(l.fornecedor_id) ?? null : null,
      evento: l.evento_id ? eventos.get(l.evento_id) ?? null : null,
    })),
  }
}
