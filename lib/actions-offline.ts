'use server'
import { createHash } from 'node:crypto'
import { getPerfil, supabaseAdmin, buscarTudo, eventosEscaneaveis, meusSetores } from './supabase-server'
import { statusCredenciamentoValido } from './credenciamento-constantes'
import { emLotes } from './lotes'
import { chaveBusca } from './format'
import { estadoDeEntradas, type EstadoDeEntradas as ContaDeEntradas } from './estado-de-entradas'

/*
 * O QUE O APARELHO DO PORTÃO GUARDA PARA TRABALHAR SEM INTERNET (Juan, 18/10/2026).
 *
 * Com internet, o leitor e o Registrar ponto baixam a lista de quem é do evento — só o necessário para, sem
 * internet, mostrar QUEM foi lido e de qual equipe, e achar a pessoa pelo CPF ou pelo nome:
 *
 *   * o QR e o CPF NÃO vão em texto: vai o resumo (SHA-256) — o aparelho calcula o mesmo resumo do que leu ou do
 *     que foi digitado e compara. O token do QR é o segredo da credencial e não pode ficar num celular de portão;
 *   * nome, equipe, cargo e a situação (liberado, pendente, baixa…) vão em texto, que é o que a tela mostra.
 *
 * A mesma régua de sempre: só o evento que esta conta opera hoje (`eventosEscaneaveis` — o operador só vê o evento
 * dele), e o supervisor só a própria equipe. Ver lib/fila-offline.ts.
 */

export type SituacaoGuardada = 'liberado' | 'pendente' | 'negado' | 'baixa' | 'inativo'

export type PessoaParaSemInternet = {
  id: string
  /** Resumo do token do QR (ver `resumoDoToken`). */
  t: string | null
  /** Resumo do CPF, amarrado ao evento (ver `resumoDoCpf`). */
  c: string | null
  nome: string
  /** O nome sem acento e em minúsculas, para a busca por nome. */
  busca: string
  equipe: string
  cargo: string | null
  situacao: SituacaoGuardada
}

/** Quem tem entrada aberta e quem já saiu, como estava em `geradoEm` — ver lib/estado-de-entradas.ts. */
export type EstadoDeEntradas = ContaDeEntradas & { geradoEm: string }

/** Quanto tempo para trás olhar: cobre o turno que vira a madrugada e o dia anterior com folga. */
const JANELA_DO_ESTADO_H = 60

const resumo = (texto: string) => createHash('sha256').update(texto).digest('hex').slice(0, 32)
/** O mesmo cálculo do aparelho (lib/fila-offline.ts): o token cru do QR. */
const resumoDoToken = (token: string) => resumo(token)
/** O mesmo cálculo do aparelho: evento + os 11 dígitos do CPF. */
const resumoDoCpf = (eventoId: string, cpf: string) => resumo(`${eventoId}:${cpf.replace(/\D/g, '')}`)

/** A hora do servidor — o aparelho mede a diferença do próprio relógio enquanto tem internet. */
export async function relogioDoServidor(): Promise<number> {
  return Date.now()
}

/** A mesma régua do portão para as duas listas: o evento que a conta opera hoje; supervisor, só a equipe dele. */
async function equipesDoPortao(eventoId: string): Promise<{ equipes: { id: string; nome: string }[]; error?: undefined } | { equipes?: undefined; error: string }> {
  const perfil = await getPerfil()
  if (!perfil) return { error: 'Sem sessão.' }
  if (!(await eventosEscaneaveis(perfil)).some(e => e.id === eventoId)) return { error: 'Sem acesso a este evento hoje.' }

  const { data: fornecedores, error: erroForn } = await supabaseAdmin
    .from('fornecedores').select('id, nome').eq('evento_id', eventoId)
  if (erroForn) return { error: 'Não foi possível montar a lista agora.' }
  let equipes = (fornecedores ?? []) as { id: string; nome: string }[]
  // Supervisor: só as equipes dele (a mesma régua do leitor e do Registrar ponto).
  if (perfil.role === 'supervisor') {
    const meus = new Set((await meusSetores(perfil)).map(s => s.id))
    equipes = equipes.filter(f => meus.has(f.id))
  }
  return { equipes }
}

export async function pacoteParaSemInternet(
  eventoId: string,
): Promise<{ pessoas: PessoaParaSemInternet[]; geradoEm: string; error?: undefined } | { pessoas?: undefined; error: string }> {
  try {
    const acesso = await equipesDoPortao(eventoId)
    if (!acesso.equipes) return { error: acesso.error }
    const equipes = acesso.equipes
    const nomeDaEquipe = new Map(equipes.map(f => [f.id, f.nome]))

    type Linha = {
      id: string; nome: string | null; cpf: string | null; cargo: string | null; qr_token: string | null
      status_credenciamento: string | null; ativo: boolean | null; descredenciado_em: string | null; fornecedor_id: string
    }
    const linhas: Linha[] = []
    for (const lote of emLotes(equipes.map(f => f.id), 100)) {
      linhas.push(...await buscarTudo<Linha>((de, ate) =>
        supabaseAdmin.from('funcionarios')
          .select('id, nome, cpf, cargo, qr_token, status_credenciamento, ativo, descredenciado_em, fornecedor_id')
          .in('fornecedor_id', lote).order('id').range(de, ate) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>,
      ))
    }

    const pessoas = linhas.map((f): PessoaParaSemInternet => {
      const status = statusCredenciamentoValido(f.status_credenciamento as string)
      const situacao: SituacaoGuardada = f.descredenciado_em ? 'baixa'
        : status === 'pendente' ? 'pendente'
        : status === 'negado' ? 'negado'
        : f.ativo === false ? 'inativo'
        : 'liberado'
      const nome = (f.nome ?? '').trim()
      return {
        id: f.id,
        t: f.qr_token ? resumoDoToken(f.qr_token) : null,
        c: f.cpf ? resumoDoCpf(eventoId, f.cpf) : null,
        nome,
        busca: chaveBusca(nome),
        equipe: nomeDaEquipe.get(f.fornecedor_id) ?? '',
        cargo: f.cargo ?? null,
        situacao,
      }
    })
    return { pessoas, geradoEm: new Date().toISOString() }
  } catch (e) {
    console.error('[pacoteParaSemInternet]', e)
    return { error: 'Não foi possível montar a lista agora.' }
  }
}

/**
 * QUEM JÁ TEM ENTRADA (Juan, 19/10/2026): o aparelho guarda isto junto com a lista para, na saída sem internet, dizer se
 * a pessoa bateu a entrada. Leve (só quem bateu algo nos últimos dias), e o aparelho renova de poucos em poucos minutos.
 * É só um aviso na tela: o servidor confere tudo de novo quando a batida chega.
 */
export async function estadoDeEntradasParaSemInternet(
  eventoId: string,
): Promise<{ estado: EstadoDeEntradas; error?: undefined } | { estado?: undefined; error: string }> {
  try {
    const acesso = await equipesDoPortao(eventoId)
    if (!acesso.equipes) return { error: acesso.error }
    const permitidas = new Set(acesso.equipes.map(f => f.id))

    type Linha = { funcionario_id: string; tipo: string; data_ref: string | null; created_at: string; funcionarios: { fornecedor_id: string } | null }
    const desde = new Date(Date.now() - JANELA_DO_ESTADO_H * 60 * 60 * 1000).toISOString()
    const linhas = await buscarTudo<Linha>((de, ate) =>
      supabaseAdmin.from('registros')
        .select('funcionario_id, tipo, data_ref, created_at, funcionarios!inner(fornecedor_id)')
        .eq('evento_id', eventoId).in('tipo', ['entrada', 'fim']).gte('created_at', desde)
        .order('id').range(de, ate) as unknown as PromiseLike<{ data: Linha[] | null; error: { message: string } | null }>,
    )
    const batidas = linhas.filter(l => l.funcionarios && permitidas.has(l.funcionarios.fornecedor_id))
    return { estado: { ...estadoDeEntradas(batidas), geradoEm: new Date().toISOString() } }
  } catch (e) {
    console.error('[estadoDeEntradasParaSemInternet]', e)
    return { error: 'Não foi possível conferir as entradas agora.' }
  }
}
