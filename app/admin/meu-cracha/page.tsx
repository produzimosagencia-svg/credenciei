import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { IdCard, CalendarDays, Building2 } from 'lucide-react'
import { getPerfil, supabaseAdmin as supabase } from '@/lib/supabase-server'
import { veTodosEventos } from '@/lib/permissions'
import { garantirMeuCracha } from '@/lib/actions'
import { PageHeader, Secao, EmptyState, Aviso } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'

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
 */
export default async function MeuCrachaPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string; setor?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (perfil.role !== 'supervisor' && perfil.role !== 'admin' && perfil.role !== 'master') redirect('/admin')

  if (perfil.role === 'supervisor') {
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
    return (
      <div className="space-y-5">
        <PageHeader titulo="Crachá Admin" descricao="Escolha o evento — o crachá é vinculado a um setor dele" />
        <EscolherEvento
          eventos={await eventosQuePossoAbrir()}
          href={id => `/admin/meu-cracha?evento=${id}`}
          icone={<IdCard className="w-3.5 h-3.5" />}
          titulo="Em qual evento?"
          descricao="Você vai escolher o setor a seguir"
          vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel antes de gerar seu crachá.' }}
          mostrarOrganizacao={veTodosEventos(perfil)}
        />
      </div>
    )
  }

  const { data: evento } = await supabase
    .from('eventos').select('id, nome, organizacao_id').eq('id', eventoParam).single()
  if (!evento) notFound()
  if (!veTodosEventos(perfil) && evento.organizacao_id !== perfil.organizacao_id) notFound()

  if (!setorParam) {
    const { data: setores } = await supabase
      .from('fornecedores').select('id, nome').eq('evento_id', eventoParam).order('nome')

    return (
      <div className="space-y-5">
        <PageHeader
          titulo="Crachá Admin"
          descricao={`${evento.nome} — em qual setor você quer aparecer credenciado?`}
          acoes={
            <Link href="/admin/meu-cracha" className="btn btn-secundario">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
            </Link>
          }
        />
        <Secao tom="acento" icone={<Building2 className="w-3.5 h-3.5" />} titulo="Setores deste evento" corpoClassName={setores?.length ? 'p-0' : 'p-4'}>
          {!setores?.length ? (
            <EmptyState
              icone={<Building2 className="w-7 h-7" />}
              titulo="Nenhum setor ainda"
              descricao="Crie um setor neste evento antes de gerar seu crachá."
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
        <PageHeader titulo="Crachá Admin" descricao={evento.nome} />
        <Aviso tom="atencao">{resultado.error}</Aviso>
      </div>
    )
  }
  redirect(`/credential/${resultado.qrToken}`)
}
