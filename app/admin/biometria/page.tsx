import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ScanFace, CalendarDays } from 'lucide-react'
import { getPerfil } from '@/lib/supabase-server'
import { veTodosEventos, podeGerenciarEventos } from '@/lib/permissions'
import { obterRelatorioBiometria } from '@/lib/biometria-relatorio'
import { PageHeader } from '@/components/ui/Superficie'
import EscolherEvento, { eventosQuePossoAbrir } from '../EscolherEvento'
import RelatorioBiometriaView from '../eventos/[id]/biometria/RelatorioBiometriaView'

export const revalidate = 0

/**
 * Biometria, pelo menu — mesmo padrão de `/admin/relatorios`: escolhe o
 * evento primeiro, e a partir daí é a mesma tela de
 * `/admin/eventos/[id]/biometria`, com a mesma `RelatorioBiometriaView`.
 *
 * A checagem de acesso NÃO é duplicada aqui: quem decide é
 * `obterRelatorioBiometria`. A lista de `eventosQuePossoAbrir` inclui
 * supervisor (ela é genérica pra todo o menu), mas biometria não é dividida
 * por setor — quem não pode gerenciar eventos é barrado por
 * `obterRelatorioBiometria` ao tentar abrir um evento específico, mesma
 * lógica de "a lista esconde, a checagem protege" de `EscolherEvento`.
 */
export default async function BiometriaPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string }>
}) {
  const perfil = await getPerfil()
  if (!perfil) redirect('/login')
  if (!podeGerenciarEventos(perfil)) redirect('/admin')

  const { evento: eventoParam } = await searchParams

  if (eventoParam) {
    const relatorio = await obterRelatorioBiometria(eventoParam)
    if ('erro' in relatorio) redirect('/admin/biometria')
    return (
      <div className="space-y-5">
        <PageHeader
          titulo="Biometria — tentativas de reconhecimento"
          descricao={`${relatorio.eventoNome} — o quanto o reconhecimento facial está acertando`}
          acoes={
            <Link href="/admin/biometria" className="btn btn-secundario">
              <CalendarDays className="w-3.5 h-3.5 shrink-0" /> Trocar de evento
            </Link>
          }
        />
        <RelatorioBiometriaView relatorio={relatorio} />
      </div>
    )
  }

  const eventos = await eventosQuePossoAbrir()

  return (
    <div className="space-y-5">
      <PageHeader titulo="Biometria" descricao="Escolha o evento pra ver as tentativas de reconhecimento facial" />
      <EscolherEvento
        eventos={eventos}
        href={id => `/admin/biometria?evento=${id}`}
        icone={<ScanFace className="w-3.5 h-3.5" />}
        titulo="De qual evento?"
        descricao="Quantas tentativas de biometria deram certo, erraram e por quê"
        vazio={{ titulo: 'Nenhum evento ainda', descricao: 'Crie um evento no Painel pra poder ver a biometria dele.' }}
        mostrarOrganizacao={veTodosEventos(perfil)}
      />
    </div>
  )
}
