import { supabaseAdmin } from './supabase-server'
import { diaBRT } from './janelas'

/**
 * Quem recebe qual aviso — a mesma pergunta respondida em DOIS contextos
 * diferentes: o funcionário abrindo a própria credencial pública, e o
 * supervisor logando no painel. Os dois usam a mesma tabela `avisos`, mas
 * casam o público por identificadores diferentes (`funcionario_id` num
 * caso, `perfil_id` no outro) — por isso duas funções, não uma genérica
 * demais pra ler.
 *
 * `cpf_pessoa` é a chave que cruza os dois mundos: é o mesmo raciocínio já
 * usado em `situacaoDoAcesso`/`editarCpfFuncionario` (ver `lib/actions.ts`)
 * — CPF identifica a PESSOA, não uma linha específica de `funcionarios` ou
 * de `perfis`.
 */

export type AvisoPendente = {
  id: string
  titulo: string
  mensagem: string
}

type AvisoLinha = {
  id: string
  titulo: string
  mensagem: string
  publico: 'todos' | 'setores' | 'pessoa' | 'supervisores'
  cpf_pessoa: string | null
  recorrente: boolean
  data_inicio: string
  data_fim: string | null
}

/** Avisos ativos e dentro do período, do evento — sem filtrar público ainda. */
async function avisosAtivosDoEvento(eventoId: string): Promise<AvisoLinha[]> {
  const hoje = diaBRT()
  const { data } = await supabaseAdmin
    .from('avisos')
    .select('id, titulo, mensagem, publico, cpf_pessoa, recorrente, data_inicio, data_fim')
    .eq('evento_id', eventoId)
    .eq('ativo', true)
    .lte('data_inicio', hoje)
    .order('created_at', { ascending: false })
  return (data ?? []).filter(a => !a.data_fim || a.data_fim >= hoje) as AvisoLinha[]
}

/** Quais desses `avisoIds` já têm confirmação — recorrentes não entram aqui. */
async function jaVisualizados(avisoIds: string[], coluna: 'funcionario_id' | 'perfil_id', valor: string): Promise<Set<string>> {
  if (!avisoIds.length) return new Set()
  const { data } = await supabaseAdmin
    .from('aviso_visualizacoes')
    .select('aviso_id')
    .in('aviso_id', avisoIds)
    .eq(coluna, valor)
  return new Set((data ?? []).map(v => v.aviso_id as string))
}

/** Avisos pendentes pra quem abre a própria credencial (`/credential/[token]`). */
export async function avisosPendentesFuncionario({
  eventoId, funcionarioId, fornecedorId, cpf,
}: {
  eventoId: string
  funcionarioId: string
  fornecedorId: string
  cpf: string
}): Promise<AvisoPendente[]> {
  const avisos = await avisosAtivosDoEvento(eventoId)
  if (!avisos.length) return []

  const setoresDosAvisos = avisos.filter(a => a.publico === 'setores').map(a => a.id)
  const avisosDesteSetor = setoresDosAvisos.length
    ? new Set(
        (await supabaseAdmin
          .from('aviso_setores')
          .select('aviso_id')
          .in('aviso_id', setoresDosAvisos)
          .eq('fornecedor_id', fornecedorId)).data?.map(r => r.aviso_id as string) ?? [],
      )
    : new Set<string>()

  const ehSupervisor = !!(await supabaseAdmin
    .from('perfis').select('id').eq('cpf', cpf).eq('role', 'supervisor').eq('ativo', true).maybeSingle()).data

  const elegiveis = avisos.filter(a => {
    if (a.publico === 'todos') return true
    if (a.publico === 'setores') return avisosDesteSetor.has(a.id)
    if (a.publico === 'pessoa') return a.cpf_pessoa === cpf
    if (a.publico === 'supervisores') return ehSupervisor
    return false
  })
  if (!elegiveis.length) return []

  const naoRecorrentes = elegiveis.filter(a => !a.recorrente).map(a => a.id)
  const vistos = await jaVisualizados(naoRecorrentes, 'funcionario_id', funcionarioId)

  return elegiveis
    .filter(a => a.recorrente || !vistos.has(a.id))
    .map(a => ({ id: a.id, titulo: a.titulo, mensagem: a.mensagem }))
}

/**
 * Avisos pendentes pro supervisor que acabou de logar. Só chamado quando
 * `perfil.role === 'supervisor'` — admin/master navegando pela mesma tela
 * não são interrompidos por avisos que não são pra eles.
 */
export async function avisosPendentesSupervisor({
  eventoId, perfilId, fornecedorId, cpf,
}: {
  eventoId: string
  perfilId: string
  fornecedorId: string
  cpf: string | null
}): Promise<AvisoPendente[]> {
  const avisos = await avisosAtivosDoEvento(eventoId)
  if (!avisos.length) return []

  const setoresDosAvisos = avisos.filter(a => a.publico === 'setores').map(a => a.id)
  const avisosDesteSetor = setoresDosAvisos.length
    ? new Set(
        (await supabaseAdmin
          .from('aviso_setores')
          .select('aviso_id')
          .in('aviso_id', setoresDosAvisos)
          .eq('fornecedor_id', fornecedorId)).data?.map(r => r.aviso_id as string) ?? [],
      )
    : new Set<string>()

  const elegiveis = avisos.filter(a => {
    if (a.publico === 'todos') return true
    if (a.publico === 'setores') return avisosDesteSetor.has(a.id)
    if (a.publico === 'pessoa') return !!cpf && a.cpf_pessoa === cpf
    if (a.publico === 'supervisores') return true // já sabemos que é supervisor
    return false
  })
  if (!elegiveis.length) return []

  const naoRecorrentes = elegiveis.filter(a => !a.recorrente).map(a => a.id)
  const vistos = await jaVisualizados(naoRecorrentes, 'perfil_id', perfilId)

  return elegiveis
    .filter(a => a.recorrente || !vistos.has(a.id))
    .map(a => ({ id: a.id, titulo: a.titulo, mensagem: a.mensagem }))
}
