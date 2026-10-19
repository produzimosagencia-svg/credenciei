import 'server-only'
import { supabaseAdmin, buscarTudo, diaDoTurno } from './supabase-server'
import { cadastrosSoNaLixeira } from './lixeira'

/*
 * OS NÚMEROS DO EVENTO NO DIA — os mesmos cinco cartões do topo da tela do evento (/admin/eventos/[id]), com a mesma
 * conta, para quem não abre aquela tela (o operador de portão — Juan, 18/10/2026: "pra eles saberem o que tá
 * acontecendo no evento"). Se a conta mudar lá, muda aqui também.
 *
 *   funcionariosDoEvento — todo mundo que TEVE cadastro no evento (inclui baixa e lixeira: o número não diminui);
 *   equipe               — quem está nas equipes agora (a base das proporções);
 *   presentes            — entrou no dia e ainda não saiu;
 *   entradas/meio/saidas — pessoas com aquela batida no dia do turno.
 */
export type NumerosDoEvento = {
  dia: string
  funcionariosDoEvento: number
  equipe: number
  presentes: number
  entradas: number
  meio: number
  saidas: number
}

export async function numerosDoEvento(eventoId: string): Promise<NumerosDoEvento> {
  const [{ data: fornecedores }, { data: dias }, hojeDoTurno] = await Promise.all([
    supabaseAdmin.from('fornecedores').select('id, funcionarios(count)').eq('evento_id', eventoId),
    supabaseAdmin.from('jornada_dias').select('data').eq('evento_id', eventoId).eq('cancelado', false).order('data'),
    diaDoTurno(eventoId),
  ])
  // O mesmo "dia" da tela do evento: hoje (do turno) quando é dia de operação; senão o último que já passou.
  const diasDaOperacao = (dias ?? []).map(d => d.data as string)
  const dia = (diasDaOperacao.includes(hojeDoTurno) ? hojeDoTurno : null)
    ?? [...diasDaOperacao].reverse().find(d => d <= hojeDoTurno)
    ?? diasDaOperacao[0]
    ?? hojeDoTurno

  const equipe = (fornecedores ?? []).reduce((acc, f) => acc + ((f.funcionarios as unknown as { count: number }[] | null)?.[0]?.count ?? 0), 0)
  const [registros, naLixeira] = await Promise.all([
    buscarTudo<{ funcionario_id: string; tipo: string }>((de, ate) => supabaseAdmin.from('registros')
      .select('funcionario_id, tipo').eq('evento_id', eventoId).eq('data_ref', dia).order('id').range(de, ate) as never)
      .catch(() => [] as { funcionario_id: string; tipo: string }[]),
    cadastrosSoNaLixeira(eventoId).catch(() => 0),
  ])
  const quem = (t: string) => new Set(registros.filter(r => r.tipo === t).map(r => r.funcionario_id))
  const entraram = quem('entrada')
  const sairam = quem('fim')
  return {
    dia,
    funcionariosDoEvento: equipe + naLixeira,
    equipe,
    presentes: [...entraram].filter(id => !sairam.has(id)).length,
    entradas: entraram.size,
    meio: quem('meio').size,
    saidas: sairam.size,
  }
}
