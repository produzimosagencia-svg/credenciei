import 'server-only'
import { supabaseAdmin, buscarTudo, diaDoTurno } from './supabase-server'
import { exigirAcessoAoEvento } from './relatorios-acesso'
import type { SecaoDoc } from './relatorio-doc'
import { montarFechamentoDoTurno, type BatidaDoFechamento } from './relatorio-doc-fechamento'

const dataValida = (d?: string | null): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d)

/**
 * Os dados do FECHAMENTO DO TURNO (a montagem está em lib/relatorio-doc-fechamento.ts). Supervisor vê só os setores
 * dele (mesma régua dos outros relatórios). Um dia (`dia`) ou um período (`de`/`ate`, Juan, 13/10/2026); sem nada, o
 * turno de agora.
 */
export async function relatorioFechamentoDoTurno(
  eventoId: string,
  pedido: { dia?: string | null; de?: string | null; ate?: string | null },
  escopo: 'pagas' | 'todas' = 'pagas',
): Promise<
  | { erro: string }
  | { eventoNome: string; de: string; ate: string; rotuloEvento: string; secoes: SecaoDoc[] }
> {
  const acesso = await exigirAcessoAoEvento(eventoId)
  if ('erro' in acesso) return { erro: acesso.erro }
  const pedidoDe = dataValida(pedido.de) ? pedido.de : dataValida(pedido.dia) ? pedido.dia : null
  const pedidoAte = dataValida(pedido.ate) ? pedido.ate : pedidoDe
  const [a, b] = pedidoDe && pedidoAte ? [pedidoDe, pedidoAte] : await diaDoTurno(eventoId).then(d => [d, d])
  const [de, ate] = a <= b ? [a, b] : [b, a]

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

  const registros = await buscarTudo<Record<string, unknown>>((inicio, fim) =>
    supabaseAdmin.from('registros')
      .select('funcionario_id, tipo, data_ref, funcionarios!inner(fornecedor_id)')
      .eq('evento_id', eventoId).gte('data_ref', de).lte('data_ref', ate).in('tipo', ['entrada', 'fim'])
      .order('id').range(inicio, fim) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string } | null }>)
  const batidas: BatidaDoFechamento[] = []
  for (const linha of registros) {
    const r = linha as { funcionario_id: string; tipo: 'entrada' | 'fim'; data_ref: string; funcionarios: { fornecedor_id?: string } | null }
    const fid = r.funcionarios?.fornecedor_id
    if (fid && permitidos.has(fid)) batidas.push({ funcionarioId: r.funcionario_id, fornecedorId: fid, tipo: r.tipo, dataRef: r.data_ref })
  }

  const { rotuloEvento, secoes } = montarFechamentoDoTurno({ eventoNome: acesso.evento.nome, de, ate, setores, batidas, escopo: escopoValido })
  return { eventoNome: acesso.evento.nome, de, ate, rotuloEvento, secoes }
}
