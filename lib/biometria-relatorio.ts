'use server'
/**
 * Relatório de tentativas de biometria — pra calibrar `LIMIAR_PADRAO`/
 * `MARGEM_MINIMA` (lib/biometria.ts) com dados reais em vez de no chute.
 *
 * Cada leitura de rosto (totem e autoatendimento) grava uma linha em
 * `biometria_tentativas` (`gravarTentativaBiometrica`, lib/actions.ts) — este
 * arquivo só lê e agrega, nunca escreve. Nenhum dado biométrico é lido aqui:
 * a tabela nunca guardou rosto nem vetor, só o RESULTADO e a DISTÂNCIA (um
 * número, não uma imagem).
 *
 * Mesma régua de acesso de `lib/relatorios.ts` (master vê tudo, admin só a
 * própria organização) — sem escopo de supervisor aqui: biometria não é
 * dividida por setor, é uma configuração do evento inteiro.
 */
import { getPerfil, supabaseAdmin, buscarTudo } from './supabase-server'
import { podeGerenciarEventos, ehMaster } from './permissions'
import { LIMIAR_PADRAO, MARGEM_MINIMA } from './biometria'

export type LinhaTentativaBiometrica = {
  id: string
  criadoEm: string
  resultado: string
  distancia: number | null
  duracaoMs: number | null
  funcionarioNome: string | null
}

export type ResumoPorResultado = {
  resultado: string
  quantidade: number
  distanciaMedia: number | null
  distanciaMinima: number | null
  distanciaMaxima: number | null
}

export type RelatorioBiometria = {
  eventoId: string
  eventoNome: string
  organizacaoNome: string | null
  limiarAtual: number
  margemAtual: number
  total: number
  porResultado: ResumoPorResultado[]
  recentes: LinhaTentativaBiometrica[]
}

type EventoParaAcesso = { id: string; nome: string; organizacao_id: string | null; organizacoes: { nome: string } | null }

async function exigirAcesso(eventoId: string): Promise<{ erro: string } | { evento: EventoParaAcesso }> {
  const perfil = await getPerfil()
  if (!perfil) return { erro: 'Não autenticado.' }

  const { data } = await supabaseAdmin
    .from('eventos').select('id, nome, organizacao_id, organizacoes(nome)').eq('id', eventoId).single()
  if (!data) return { erro: 'Evento não encontrado.' }
  const evento = data as unknown as EventoParaAcesso

  if (!podeGerenciarEventos(perfil)) return { erro: 'Sem permissão para ver este relatório.' }
  if (!ehMaster(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) {
    return { erro: 'Sem permissão sobre este evento.' }
  }
  return { evento }
}

/** Quantas linhas recentes mostrar em detalhe — o resumo por resultado usa TODAS. */
const LIMITE_RECENTES = 200

export async function obterRelatorioBiometria(eventoId: string): Promise<{ erro: string } | RelatorioBiometria> {
  const acesso = await exigirAcesso(eventoId)
  if ('erro' in acesso) return acesso
  const { evento } = acesso

  /*
   * Só `resultado`+`distancia` (2 colunas leves, sem join) pra agregar — o
   * `.limit()` do cliente Supabase nunca passa de `db.max_rows` (1000),
   * então isto usa `buscarTudo` (pagina sozinho) em vez de confiar num
   * único `.select()` — mesmo cuidado de sempre neste projeto pra não
   * subcontar um evento grande.
   */
  let paraAgregar: { resultado: string; distancia: number | null }[] = []
  try {
    paraAgregar = await buscarTudo<{ resultado: string; distancia: number | null }>((de, ate) =>
      supabaseAdmin
        .from('biometria_tentativas')
        .select('resultado, distancia')
        .eq('evento_id', eventoId)
        .range(de, ate)
    )
  } catch {
    // Tabela ainda não migrada neste ambiente — relatório vazio, não erro.
  }

  const porResultadoMap = new Map<string, number[]>()
  for (const linha of paraAgregar) {
    const distancias = porResultadoMap.get(linha.resultado) ?? []
    if (typeof linha.distancia === 'number') distancias.push(linha.distancia)
    porResultadoMap.set(linha.resultado, distancias)
  }
  // Guarda a CONTAGEM de cada resultado separada das distâncias (nem toda
  // linha tem distância — ver comentário em `decidirMatch`, lib/biometria.ts).
  const quantidadePorResultado = new Map<string, number>()
  for (const linha of paraAgregar) {
    quantidadePorResultado.set(linha.resultado, (quantidadePorResultado.get(linha.resultado) ?? 0) + 1)
  }

  const porResultado: ResumoPorResultado[] = [...quantidadePorResultado.entries()]
    .map(([resultado, quantidade]) => {
      const distancias = porResultadoMap.get(resultado) ?? []
      return {
        resultado,
        quantidade,
        distanciaMedia: distancias.length ? distancias.reduce((a, b) => a + b, 0) / distancias.length : null,
        distanciaMinima: distancias.length ? Math.min(...distancias) : null,
        distanciaMaxima: distancias.length ? Math.max(...distancias) : null,
      }
    })
    .sort((a, b) => b.quantidade - a.quantidade)

  const { data: recentesBrutos } = await supabaseAdmin
    .from('biometria_tentativas')
    .select('id, created_at, resultado, distancia, duracao_ms, funcionarios(nome)')
    .eq('evento_id', eventoId)
    .order('created_at', { ascending: false })
    .limit(LIMITE_RECENTES)

  const recentes: LinhaTentativaBiometrica[] = (recentesBrutos ?? []).map(l => ({
    id: l.id as string,
    criadoEm: l.created_at as string,
    resultado: l.resultado as string,
    distancia: l.distancia as number | null,
    duracaoMs: l.duracao_ms as number | null,
    funcionarioNome: (l.funcionarios as unknown as { nome: string } | null)?.nome ?? null,
  }))

  return {
    eventoId,
    eventoNome: evento.nome,
    organizacaoNome: evento.organizacoes?.nome ?? null,
    limiarAtual: LIMIAR_PADRAO,
    margemAtual: MARGEM_MINIMA,
    total: paraAgregar.length,
    porResultado,
    recentes,
  }
}
