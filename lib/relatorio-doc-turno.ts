import 'server-only'
import { supabaseAdmin, buscarTudo, diaDoTurno } from './supabase-server'
import { exigirAcessoAoEvento } from './relatorios-acesso'
import type { SecaoDoc } from './relatorio-doc'
import { montarFechamentoDoTurno, type BatidaDoFechamento } from './relatorio-doc-fechamento'

/**
 * Os dados do FECHAMENTO DO TURNO (a montagem está em lib/relatorio-doc-fechamento.ts). Supervisor vê só os setores
 * dele (mesma régua dos outros relatórios).
 */
export async function relatorioFechamentoDoTurno(eventoId: string, diaPedido?: string | null, escopo: 'pagas' | 'todas' = 'pagas'): Promise<
  | { erro: string }
  | { eventoNome: string; dia: string; rotuloEvento: string; secoes: SecaoDoc[] }
> {
  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) return { erro: acesso.erro }
  const dia = diaPedido && /^\d{4}-\d{2}-\d{2}$/.test(diaPedido) ? diaPedido : await diaDoTurno(eventoId)

  let consulta = supabaseAdmin.from('fornecedores').select('id, nome, exige_meio, subeventos(nome)').eq('evento_id', eventoId)
  if (acesso.setoresPermitidos) consulta = consulta.in('id', [...acesso.setoresPermitidos])
  const { data: fornecedores } = await consulta
  const setores = (fornecedores ?? []).map(f => ({
    id: f.id as string,
    nome: f.nome as string,
    area: (f.subeventos as unknown as { nome?: string } | null)?.nome ?? '',
    pedeMeio: (f as { exige_meio?: boolean | null }).exige_meio === true,
  }))
  // Evento sem nenhuma equipe que pede o meio: "pagas por pessoa" ficaria vazio — mostra todas.
  const escopoValido = escopo === 'pagas' && !setores.some(s => s.pedeMeio) ? 'todas' : escopo
  const permitidos = new Set(setores.map(s => s.id))

  const registros = await buscarTudo<Record<string, unknown>>((de, ate) =>
    supabaseAdmin.from('registros')
      .select('funcionario_id, tipo, funcionarios!inner(fornecedor_id)')
      .eq('evento_id', eventoId).eq('data_ref', dia).in('tipo', ['entrada', 'fim'])
      .order('id').range(de, ate) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>)
  const batidas: BatidaDoFechamento[] = []
  for (const linha of registros) {
    const r = linha as { funcionario_id: string; tipo: 'entrada' | 'fim'; funcionarios: { fornecedor_id?: string } | null }
    const fid = r.funcionarios?.fornecedor_id
    if (fid && permitidos.has(fid)) batidas.push({ funcionarioId: r.funcionario_id, fornecedorId: fid, tipo: r.tipo })
  }

  const { rotuloEvento, secoes } = montarFechamentoDoTurno({ eventoNome: acesso.evento.nome, dia, setores, batidas, escopo: escopoValido })
  return { eventoNome: acesso.evento.nome, dia, rotuloEvento, secoes }
}
