import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { IdCard, CalendarDays, Building2 } from 'lucide-react'
import { getPerfil, meusSetores, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos } from '@/lib/permissions'
import { garantirMeuCracha } from '@/lib/actions'
import { PageHeader, Secao, EmptyState, Aviso } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir, eventosDosMeusSetores } from '../EscolherEvento'

export const revalidate = 0

/**
 * "Meu Crachá" — pedido do Juan, 24/09/2026: supervisor e admin também
 * precisam se credenciar no evento, e passar pela portaria como qualquer
 * outra pessoa da equipe. Sem tela nova de verdade: garante (cria se não
 * existir) a linha em `funcionarios` e manda pra MESMA `/credential/[token]`
 * que todo mundo já usa — QR, foto, janelas de horário, tudo igual.
 *
 * O supervisor já tem um setor fixo (`perfil.fornecedor_id`) — vai direto.
 * O admin cobre o evento inteiro, não um setor, então escolhe evento e
 * depois setor antes (mesmo padrão de Avisos/Veículos/Lançamento manual).
 *
 * Quem tem outro papel principal mas GANHOU um vínculo de supervisor
 * (achado ao vivo, 05/10/2026, caso da Mara Lúcia) também vai DIRETO,
 * igual ao supervisor de papel — `perfil.fornecedor_id` já é o setor
 * ATIVO dela também (gravado ao entrar no evento por "Meus eventos",
 * `entrarNoEventoSupervisor`). Sem isso, ela caía no seletor "Crachá
 * Admin" de escolher fornecedor entre TODOS do evento — confuso pra quem
 * só quer o próprio crachá pessoal.
 */
export default async function MeuCrachaPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string; setor?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  const meusVinculos = await meusSetores(perfil)
  const temVinculo = !!meusVinculos.length
  if (perfil.role !== 'supervisor' && perfil.role !== 'admin' && perfil.role !== 'master' && !temVinculo) redirect('/admin')

  const vinculoAtivo = perfil.fornecedor_id && meusVinculos.some(s => s.id === perfil.fornecedor_id)
  if (perfil.role === 'supervisor' || vinculoAtivo) {
    const resultado = await garantirMeuCracha()
    if ('error' in resultado) {
      return (
        <div className="space-y-5">
          <PageHeader titulo="Meu Crachá" descricao="Sua credencial neste evento" />
          <Aviso tom="atencao">{resultado.error}</Aviso>
        </div>
      )
    }
    redirect(`/credential/${resultado.qrToken}`)
  }

  const { evento: eventoParam, setor: setorParam } = await searchParams

  if (!eventoParam) {
    const ehAdminOuMasterSemEvento = perfil.role === 'admin' || perfil.role === 'master'
    const eventos = ehAdminOuMasterSemEvento
      ? await eventosQuePossoAbrir()
      : await eventosDosMeusSetores(meusVinculos)
    return (
      <div className="space-y-5">
        <PageHeader
          titulo={ehAdminOuMasterSemEvento ? 'Crachá Admin' : 'Meu Crachá'}
          descricao="Escolha o evento — o crachá é vinculado a um fornecedor dele"
        />
        <EscolherEvento
          eventos={eventos}
          href={id => `/admin/meu-cracha?evento=${id}`}
          icone={<IdCard className="w-3.5 h-3.5" />}
          titulo="Em qual evento?"
          descricao="Você vai escolher o fornecedor a seguir"
          vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel antes de gerar seu crachá.' }}
          mostrarOrganizacao={veTodosEventos(perfil)}
        />
      </div>
    )
  }

  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoParam).single()
  if (!evento) notFound()
  const idsVinculoNesteEvento = meusVinculos.filter(s => s.evento_id === eventoParam).map(s => s.id)
  const temVinculoNesteEvento = !!idsVinculoNesteEvento.length
  if (!temVinculoNesteEvento && !veTodosEventos(perfil) && evento.organizacao_id !== perfil.organizacao_id) notFound()

  /*
   * Admin/master escolhem entre TODOS os fornecedores do evento (é uma
   * credencial administrativa, de visita). Quem só tem vínculo (sem ser
   * admin/master) escolhe só ENTRE OS PRÓPRIOS — é o crachá pessoal dela,
   * não uma escolha de gestão.
   */
  const ehAdminOuMaster = perfil.role === 'admin' || perfil.role === 'master'
  const titulo = ehAdminOuMaster ? 'Crachá Admin' : 'Meu Crachá'

  if (!setorParam) {
    let query = supabase.from('fornecedores').select('id, nome').eq('evento_id', eventoParam).order('nome')
    if (!ehAdminOuMaster) query = query.in('id', idsVinculoNesteEvento)
    const { data: setores } = await query

    return (
      <div className="space-y-5">
        <PageHeader
          titulo={titulo}
          descricao={`${evento.nome} — em qual fornecedor você quer aparecer credenciado?`}
          acoes={
            <Link href="/admin/meu-cracha" className="btn btn-secundario">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
            </Link>
          }
        />
        <Secao tom="acento" icone={<Building2 className="w-3.5 h-3.5" />} titulo={ehAdminOuMaster ? 'Fornecedores deste evento' : 'Seus fornecedores neste evento'} corpoClassName={setores?.length ? 'p-0' : 'p-4'}>
          {!setores?.length ? (
            <EmptyState
              icone={<Building2 className="w-7 h-7" />}
              titulo="Nenhum fornecedor ainda"
              descricao="Crie um fornecedor neste evento antes de gerar seu crachá."
            />
          ) : (
            <div className="divide-y divide-slate-50">
              {setores.map(s => (
                <Link
                  key={s.id}
                  href={`/admin/meu-cracha?evento=${eventoParam}&setor=${s.id}`}
                  className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50 transition-colors"
                >
                  <p className="text-slate-800 font-medium text-sm">{s.nome}</p>
                </Link>
              ))}
            </div>
          )}
        </Secao>
      </div>
    )
  }

  const resultado = await garantirMeuCracha(setorParam)
  if ('error' in resultado) {
    return (
      <div className="space-y-5">
        <PageHeader titulo={titulo} descricao={evento.nome} />
        <Aviso tom="atencao">{resultado.error}</Aviso>
      </div>
    )
  }
  redirect(`/credential/${resultado.qrToken}`)
}
