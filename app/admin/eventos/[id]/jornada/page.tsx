import { notFound, redirect } from 'next/navigation'
import { CalendarCheck } from 'lucide-react'
import { getPerfil, supabaseAdmin } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarEventos } from '@/lib/permissions'
import { formatarBR } from '@/lib/tz'
import { PageHeader, Secao, Aviso } from '@/components/ui/Superficie'
import { somarDias, type BlocoJornada, type Jornada } from '@/lib/jornada'
import JornadaForm from './JornadaForm'
import DiasGerados from './DiasGerados'

export const revalidate = 0

/**
 * Configuração de registros diários.
 *
 * Existe para operações de VÁRIOS dias. O evento de um dia continua usando as
 * janelas fixas da tela de edição — as duas coisas convivem, e é a existência
 * de dias gerados que decide qual manda na hora de validar o ponto.
 */
export default async function JornadaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarEventos(perfil.role)) redirect('/admin')

  const [{ data: evento }, { data: jornada }] = await Promise.all([
    supabaseAdmin.from('eventos').select('id, nome, data_inicio, data_fim, organizacao_id').eq('id', id).single(),
    supabaseAdmin.from('evento_jornadas').select('*').eq('evento_id', id).maybeSingle(),
  ])
  if (!evento) notFound()
  if (!veTodosEventos(perfil.role) && evento.organizacao_id !== perfil.organizacao_id) notFound()

  // Dias já gerados, para a lista de exceções (cancelar um feriado).
  const { data: dias } = await supabaseAdmin
    .from('jornada_dias')
    .select('id, data, turno, entrada_inicio, saida_inicio, cancelado')
    .eq('evento_id', id)
    .order('data')
    .order('turno')

  const hojeISO = new Date().toISOString().slice(0, 10)
  const doEvento = (d: string | null) => (d ? String(d).slice(0, 10) : '')

  /*
   * Valores iniciais. Sem jornada salva, parte das datas do próprio evento e
   * de segunda a sexta — que é a configuração que a maioria vai querer, e
   * poupa o preenchimento do caso comum.
   */
  const inicial: Jornada = jornada
    ? {
        dataInicio: doEvento(jornada.data_inicio),
        dataFim: doEvento(jornada.data_fim),
        toleranciaMin: jornada.tolerancia_min ?? 0,
        blocos: (jornada.blocos as BlocoJornada[]) ?? [],
      }
    : {
        dataInicio: doEvento(evento.data_inicio) || hojeISO,
        dataFim: doEvento(evento.data_fim) || somarDias(hojeISO, 7),
        toleranciaMin: 15,
        blocos: [],
      }

  return (
    <div className="max-w-3xl space-y-5">
      <PageHeader
        voltarPara={`/admin/eventos/${id}`}
        titulo="Configuração de registros diários"
        descricao={evento.nome}
      />

      <Aviso tom="marca" icone={<CalendarCheck className="w-3.5 h-3.5" />}>
        Configure uma vez e o sistema repete nos dias escolhidos, como um despertador.
        Enquanto esta configuração existir, ela substitui as janelas fixas de entrada e saída
        da tela de edição do evento.
      </Aviso>

      <JornadaForm eventoId={id} inicial={inicial} jaExiste={!!jornada} />

      {!!dias?.length && (
        <Secao
          titulo="Dias gerados"
          descricao="Desmarque um dia para não cobrar registro nele — feriado, folga ou cancelamento"
          acoes={
            <span className="indicador-selo selo-neutro">
              {dias.filter(d => !d.cancelado).length} de {dias.length}
            </span>
          }
        >
          <DiasGerados
            dias={dias.map(d => ({
              id: d.id as string,
              data: d.data as string,
              turno: d.turno as number,
              entrada: formatarBR(d.entrada_inicio as string, 'hora'),
              saida: formatarBR(d.saida_inicio as string, 'hora'),
              cancelado: d.cancelado === true,
              passado: (d.data as string) < hojeISO,
            }))}
          />
        </Secao>
      )}
    </div>
  )
}
